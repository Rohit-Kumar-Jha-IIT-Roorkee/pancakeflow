"""REST + WebSocket gateway for the dashboard. Reads agent state from Redis/DB,
streams UI pushes over WS, and hosts the NL query + what-if endpoints (P7)."""
from __future__ import annotations
import asyncio, json, sys, os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# make the agents package importable
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from agents.common import config, bus, state          # noqa: E402
from agents.portfolio import agent as portfolio        # noqa: E402
from agents.simulation import scenarios                # noqa: E402
from agents.strategy.arbitrage.cycle_math import evaluate_cycle  # noqa: E402
from agents.common.llm import reason_json              # noqa: E402

app = FastAPI(title="PancakeFlow API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def _startup():
    await portfolio.init()

@app.get("/health")
async def health():
    return {"ok": True, "mode": config.EXEC_MODE, "profile": config.RISK_PROFILE}

@app.get("/portfolio/summary")
async def portfolio_summary():
    return await portfolio.summary()

@app.get("/trades")
async def trades(limit: int = 100):
    from agents.portfolio import ledger
    return await ledger.all_trades(limit)

@app.get("/market/state")
async def market_state():
    pools = await state.get_all_pools()
    gas = await state.get_gas_wei()
    breaker = await bus.get_redis().hgetall(config.KEY_BREAKER)
    pair = await state.get_pair("WBNB", "USDT")
    return {"pools": pools, "gasWei": gas, "breaker": breaker or {"state": "ARMED"},
            "regime": (pair or {}).get("regime", "unknown")}

@app.get("/agents/timeline")
async def agent_timeline(tradeId: str = "", limit: int = 200):
    """The agent decision graph source: replay agent.decision events for a trade."""
    r = bus.get_redis()
    entries = await r.xrevrange(config.STREAM_TRADE, count=1000)
    out = []
    for _id, fields in entries:
        if fields.get("type") in ("agent.decision", "trade.proposed", "trade.approved",
                                   "trade.executed", "trade.failed", "simulation.result"):
            payload = json.loads(fields.get("payload", "{}"))
            tid = payload.get("trade_id") or payload.get("id") or payload.get("tradeId", "")
            if not tradeId or tid == tradeId:
                out.append({"type": fields["type"], "ts": int(fields.get("ts", 0)), **payload})
    return list(reversed(out[:limit]))

@app.post("/nl/query")
async def nl_query(body: dict):
    """BONUS: natural-language interface. Routes a question to live data.
    'show me arbitrage opportunities on BNB right now' -> current proposals."""
    q = (body.get("q") or "").lower()
    if "arbitrage" in q or "arb" in q or "opportun" in q:
        pools = await state.get_all_pools()
        from agents.strategy.arbitrage.scanner import build_edges, find_negative_cycle, size_and_score
        cyc = find_negative_cycle(build_edges(pools))
        if not cyc:
            return {"answer": "No profitable arbitrage cycle on tracked pools right now.", "data": None}
        opp = size_and_score(cyc, await state.get_gas_wei())
        if not opp:
            return {"answer": "A cycle exists but isn't profitable after gas.", "data": None}
        return {"answer": f"Found {' -> '.join(opp['sym_path'])} at {opp['net_bps']:.0f} bps "
                          f"(size {opp['amount_in_wei']/1e18:.1f}).", "data": opp["sym_path"]}
    if "regime" in q or "market" in q:
        pair = await state.get_pair("WBNB", "USDT")
        return {"answer": f"WBNB/USDT regime is {(pair or {}).get('regime','unknown')}.", "data": None}
    if "pnl" in q or "profit" in q or "performance" in q:
        s = await portfolio.summary()
        return {"answer": f"{s['trades']} trades, {s['win_rate']}% win rate, "
                          f"${s['total_pnl_usd']} net P&L.", "data": s}
    # fallback to LLM if available
    out = await reason_json(system="You answer questions about a crypto trading bot. Be brief.",
                            user=q) if config.ANTHROPIC_KEY else None
    return {"answer": (out or {}).get("answer", "Try: 'show arbitrage', 'regime', or 'pnl'."), "data": None}

@app.post("/simulate/whatif")
async def whatif(body: dict):
    """BONUS: what-if scenarios. body: {legs:[{reserveIn,reserveOut}], amountIn, liquidityMult, gasMult, baseGasWei}"""
    hops = [(int(l["reserveIn"]), int(l["reserveOut"])) for l in body.get("legs", [])]
    amt = int(body.get("amountIn", 0))
    res = []
    for lm in (1.0, 0.75, 0.5):
        for gm in (1.0, 2.0):
            res.append(scenarios.what_if(hops, amt, liquidity_mult=lm, gas_mult=gm,
                                         base_gas_wei=int(body.get("baseGasWei", 0))))
    return {"scenarios": res}

@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    await ws.accept()
    r = bus.get_redis()
    ps = r.pubsub()
    await ps.subscribe(config.UI_CHANNEL)
    try:
        # send an initial snapshot
        await ws.send_json({"kind": "snapshot", "data": await market_state()})
        while True:
            msg = await ps.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg:
                await ws.send_text(msg["data"])
            else:
                await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    finally:
        await ps.unsubscribe(config.UI_CHANNEL)

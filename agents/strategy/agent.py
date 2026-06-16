"""Strategy Agent (A2): signal generation & opportunity ranking.

Pipeline: read live pool graph -> Bellman-Ford arb scan -> size+score -> optional
LLM confidence adjustment informed by RAG memory -> emit ranked TradeProposals.
Also runs the trend strategy off regime labels (multi-strategy)."""
from __future__ import annotations
import asyncio, json, time
from ..common import config, state, bus
from ..common.schemas import TradeProposal, ProposalLeg
from ..common.llm import reason_json
from .arbitrage.scanner import build_edges, find_negative_cycle, size_and_score
from .trend.signals import evaluate as trend_eval
from .memory_rag import TradeMemory

memory = TradeMemory()

async def _adjust_confidence(opp: dict, base_conf: float) -> tuple[float, str]:
    """BONUS: LLM nudges confidence using recalled similar trades. Falls back to
    a deterministic rule when no API key. Never touches the arithmetic."""
    path = " -> ".join(opp["sym_path"])
    recalled = memory.recall(f"arb cycle {path} bps {opp['net_bps']:.0f}", k=3)
    if not recalled:
        return base_conf, "no prior memory"
    wins = sum(1 for r in recalled if r.get("status") == "executed" and r.get("pnl", 0) > 0)
    rule_conf = max(0.1, min(0.95, base_conf * (0.6 + 0.2 * wins)))
    out = await reason_json(
        system="You adjust a trade confidence (0..1) given recent similar trades. "
               "Output {\"confidence\": float, \"why\": str}. Be conservative.",
        user=json.dumps({"path": path, "net_bps": opp["net_bps"],
                         "base_confidence": base_conf, "recalled": recalled}))
    if out and "confidence" in out:
        return float(max(0.0, min(1.0, out["confidence"]))), str(out.get("why", "llm"))[:120]
    return rule_conf, f"rule: {wins}/{len(recalled)} prior wins"

async def scan_once() -> list[TradeProposal]:
    pools = await state.get_all_pools()
    edges = build_edges(pools)
    proposals: list[TradeProposal] = []
    gas_wei = await state.get_gas_wei()

    # ---- arbitrage ----
    cyc = find_negative_cycle(edges)
    if cyc:
        opp = size_and_score(cyc, gas_wei)
        if opp and opp["net_bps"] >= config.MIN_PROFIT_BPS and opp["n_legs"] <= config.MAX_LEGS:
            base_conf = min(0.95, 0.5 + opp["net_bps"] / 200)
            conf, why = await _adjust_confidence(opp, base_conf)
            legs = [ProposalLeg(pool=e.pool, tokenIn=e.token_in, tokenOut=e.token_out,
                                symbolIn=e.sym_in, symbolOut=e.sym_out, poolType=e.pool_type)
                    for e in opp["edges"]]
            risk = max(0.0, min(1.0, 0.3 + opp["n_legs"] * 0.1))
            p = TradeProposal(
                strategy="cross_pool_arb" if opp["n_legs"] == 2 else "triangular_arb",
                kind="cycle", legs=legs, amountInWei=str(opp["amount_in_wei"]),
                expProfitWei=str(opp["net_profit_wei"]), expProfitBps=round(opp["net_bps"], 2),
                gasEstWei=str(opp["gas_cost_wei"]), confidence=round(conf, 3), riskScore=round(risk, 3),
                slippageBps=30, rationale=f"{' -> '.join(opp['sym_path'])}; {why}")
            proposals.append(p)

    # ---- trend (multi-strategy) ----
    for sym in ("CAKE", "ETH"):
        pair = await state.get_pair(sym, "WBNB")
        if not pair:
            continue
        sig = trend_eval(f"{sym}/WBNB", pair.get("regime", "unknown"),
                         float(pair.get("midPrice", 0)), float(pair.get("ewmaVol", 0)))
        if sig:
            proposals.append(TradeProposal(
                strategy="trend_follow", kind="directional", legs=[],
                pair=sig.pair, side=sig.side, amountInWei="0", expProfitWei="0",
                expProfitBps=0.0, gasEstWei=str(gas_wei * 150_000),
                confidence=round(sig.strength, 3), riskScore=0.5, slippageBps=50,
                rationale=sig.rationale))

    proposals.sort(key=lambda p: p.confidence * max(0.01, p.expProfitBps), reverse=True)
    return proposals

async def run() -> None:
    print(f"[strategy] running (min {config.MIN_PROFIT_BPS}bps, max {config.MAX_LEGS} legs)")
    while True:
        breaker = await bus.get_redis().hget(config.KEY_BREAKER, "state")
        if breaker == "TRIPPED":
            await asyncio.sleep(config.SCAN_INTERVAL_SEC); continue
        try:
            props = await scan_once()
            for p in props:
                await bus.publish(config.STREAM_TRADE, "trade.proposed", p.model_dump())
                await bus.ui_push("proposal", {"id": p.id, "strategy": p.strategy,
                                  "bps": p.expProfitBps, "conf": p.confidence, "rationale": p.rationale})
        except Exception as e:
            print(f"[strategy] scan error: {e}")
        await asyncio.sleep(config.SCAN_INTERVAL_SEC)

if __name__ == "__main__":
    asyncio.run(run())

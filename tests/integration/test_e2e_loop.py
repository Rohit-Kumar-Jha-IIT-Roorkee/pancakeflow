import sys, asyncio, json, time
import os,sys; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from agents.common import config, bus
from agents.orchestrator import graph as orchestrator
from agents.strategy import agent as strategy
from agents.risk import agent as risk

E18 = 10**18
WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"
USDT = "0x55d398326f99059ff775485246999027b3197955"

async def seed_market():
    r = bus.get_redis()
    # catalog: two WBNB/USDT pools with price divergence
    pools = {
      "0xpoolA": {"symbol0":"WBNB","symbol1":"USDT","tier":"blue-chip","poolType":2,
                  "address":"0xpoolA","token0":WBNB,"token1":USDT},
      "0xpoolB": {"symbol0":"WBNB","symbol1":"USDT","tier":"blue-chip","poolType":2,
                  "address":"0xpoolB","token0":WBNB,"token1":USDT},
    }
    await r.hset("mkt:pools:catalog:bsc", mapping={k: json.dumps(v) for k,v in pools.items()})
    # live reserves: poolA 1000:1.00M, poolB 1000:1.15M  (15% divergence)
    await r.hset("mkt:pool:bsc:0xpoola", mapping={
      "address":"0xpoolA","poolType":"2","token0":WBNB,"token1":USDT,
      "reserve0":str(1000*E18),"reserve1":str(1_000_000*E18),"midPrice":"1000","blockNumber":"1","updatedAt":str(int(time.time()*1000)),"feeBps":"25"})
    await r.hset("mkt:pool:bsc:0xpoolb", mapping={
      "address":"0xpoolB","poolType":"2","token0":WBNB,"token1":USDT,
      "reserve0":str(1000*E18),"reserve1":str(1_150_000*E18),"midPrice":"1150","blockNumber":"1","updatedAt":str(int(time.time()*1000)),"feeBps":"25"})
    await r.hset("mkt:gas:bsc", mapping={"gasPriceWei":"5000000000","updatedAt":str(int(time.time()*1000))})
    await r.hset("mkt:oracle:bsc:BNB/USD", mapping={"price":"1075","staleSec":"2","updatedAt":str(int(time.time()*1000))})
    await r.hset("risk:breaker","state","ARMED")

async def collect_ui(events, stop):
    r = bus.get_redis()
    ps = r.pubsub()
    await ps.subscribe(config.UI_CHANNEL)
    while not stop.is_set():
        msg = await ps.get_message(ignore_subscribe_messages=True, timeout=0.5)
        if msg:
            events.append(json.loads(msg["data"]))
    await ps.unsubscribe(config.UI_CHANNEL)

async def main():
    config.CAPITAL_USD = 100000.0  # enough to size a real arb without flash
    config.RISK_PROFILE = "aggressive"
    config.MIN_PROFIT_BPS = 10
    await seed_market()

    ui_events = []
    stop = asyncio.Event()
    tasks = [
        asyncio.create_task(orchestrator.run()),
        asyncio.create_task(risk.monitor_loop()),
        asyncio.create_task(collect_ui(ui_events, stop)),
    ]
    # run one strategy scan manually (deterministic, no loop sleep)
    await asyncio.sleep(0.5)
    props = await strategy.scan_once()
    print(f"strategy produced {len(props)} proposal(s)")
    for p in props[:1]:
        print(f"  -> {p.strategy} {p.expProfitBps}bps conf={p.confidence} size={int(p.amountInWei)/E18:.1f}")
        await bus.publish(config.STREAM_TRADE, "trade.proposed", p.model_dump())
        await bus.ui_push("proposal", {"id": p.id, "strategy": p.strategy, "bps": p.expProfitBps, "conf": p.confidence, "rationale": p.rationale})

    # let the lifecycle run
    await asyncio.sleep(3)
    stop.set()
    for t in tasks: t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    kinds = [e["kind"] for e in ui_events]
    print("\nUI event sequence:", " -> ".join(kinds))
    # verify trades table
    from agents.portfolio import agent as portfolio
    s = await portfolio.summary()
    print("portfolio summary:", json.dumps(s, indent=None))
    # assertions
    assert "proposal" in kinds, "no proposal emitted"
    assert "approved" in kinds, "trade not approved (risk/sim gate failed)"
    assert "fill" in kinds, "no fill booked"
    fill_ev = next(e for e in ui_events if e["kind"]=="fill")
    assert fill_ev["data"]["status"]=="executed", f"fill not executed: {fill_ev}"
    assert s["trades"] >= 1 and s["total_pnl_usd"] > 0, "no profitable trade booked"
    print(f"\nPASS: full loop executed a profitable trade, P&L ${s['total_pnl_usd']}")

asyncio.run(main())

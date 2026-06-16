import sys, asyncio, json, time, urllib.request
sys.path.insert(0,'.')
from agents.common import config, bus
from agents.orchestrator import graph as orchestrator
from agents.strategy import agent as strategy
from agents.risk import agent as risk

E18=10**18
WBNB="0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"; USDT="0x55d398326f99059ff775485246999027b3197955"

def http_get(path):
    return json.load(urllib.request.urlopen(f"http://127.0.0.1:8000{path}"))
def http_post(path, body):
    req = urllib.request.Request(f"http://127.0.0.1:8000{path}",
        data=json.dumps(body).encode(), headers={"content-type":"application/json"})
    return json.load(urllib.request.urlopen(req))

async def seed():
    r=bus.get_redis()
    pools={"0xpoolA":{"symbol0":"WBNB","symbol1":"USDT","tier":"blue-chip","poolType":2,"address":"0xpoolA","token0":WBNB,"token1":USDT},
           "0xpoolB":{"symbol0":"WBNB","symbol1":"USDT","tier":"blue-chip","poolType":2,"address":"0xpoolB","token0":WBNB,"token1":USDT}}
    await r.hset("mkt:pools:catalog:bsc", mapping={k:json.dumps(v) for k,v in pools.items()})
    await r.hset("mkt:pool:bsc:0xpoola", mapping={"address":"0xpoolA","poolType":"2","token0":WBNB,"token1":USDT,"reserve0":str(1000*E18),"reserve1":str(1_000_000*E18),"midPrice":"1000","blockNumber":"1","updatedAt":str(int(time.time()*1000)),"feeBps":"25"})
    await r.hset("mkt:pool:bsc:0xpoolb", mapping={"address":"0xpoolB","poolType":"2","token0":WBNB,"token1":USDT,"reserve0":str(1000*E18),"reserve1":str(1_150_000*E18),"midPrice":"1150","blockNumber":"1","updatedAt":str(int(time.time()*1000)),"feeBps":"25"})
    await r.hset("mkt:gas:bsc", mapping={"gasPriceWei":"5000000000"})
    await r.hset("mkt:oracle:bsc:BNB/USD", mapping={"price":"1075"})
    await r.hset("risk:breaker","state","ARMED")

async def main():
    config.CAPITAL_USD=100000.0; config.RISK_PROFILE="aggressive"; config.MIN_PROFIT_BPS=10
    await seed()

    # 1. market state endpoint reflects seed
    ms = http_get("/market/state")
    print(f"[API] /market/state -> {len(ms['pools'])} pools, regime={ms['regime']}, breaker={ms['breaker']['state']}")
    assert len(ms['pools'])==2

    # 2. NL query finds the arb
    nl = http_post("/nl/query", {"q":"show me arbitrage opportunities on BNB right now"})
    print(f"[API] /nl/query -> {nl['answer']}")
    assert "->" in nl['answer'] or "bps" in nl['answer']

    # 3. drive a trade through the agents
    tasks=[asyncio.create_task(orchestrator.run()), asyncio.create_task(risk.monitor_loop())]
    await asyncio.sleep(0.5)
    props = await strategy.scan_once()
    for p in props[:1]:
        await bus.publish(config.STREAM_TRADE,"trade.proposed",p.model_dump())
    await asyncio.sleep(2.5)
    for t in tasks: t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    # 4. portfolio + trades endpoints reflect the executed trade
    summ = http_get("/portfolio/summary")
    print(f"[API] /portfolio/summary -> {summ['trades']} trades, {summ['win_rate']}% win, ${summ['total_pnl_usd']} PnL")
    trades = http_get("/trades?limit=5")
    print(f"[API] /trades -> {len(trades)} rows; latest status={trades[0]['status'] if trades else 'none'}")

    # 5. agent timeline (decision graph source) has events
    tl = http_get("/agents/timeline?limit=50")
    agents_seen = sorted({e.get('agent') for e in tl if e.get('agent')})
    print(f"[API] /agents/timeline -> {len(tl)} events; agents: {agents_seen}")

    # 6. what-if scenarios
    wf = http_post("/simulate/whatif", {"legs":[{"reserveIn":str(1000*E18),"reserveOut":str(1_150_000*E18)},{"reserveIn":str(1_000_000*E18),"reserveOut":str(1000*E18)}],"amountIn":str(int(9*E18)),"baseGasWei":"750000000000000"})
    print(f"[API] /simulate/whatif -> {len(wf['scenarios'])} scenarios (gas/liquidity stress)")

    assert summ['trades']>=1 and summ['total_pnl_usd']>0, "no profitable trade reflected in API"
    assert len(trades)>=1 and trades[0]['status']=='executed'
    assert len(tl)>=3
    print("\nPASS: full stack — agents -> Redis -> FastAPI -> (dashboard data) all wired and live")

asyncio.run(main())

import sys, asyncio, json, time
sys.path.insert(0,'.')
from agents.common import config, bus, state
from agents.risk import circuit_breaker, anomaly, agent as risk
E18=10**18
WBNB="0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"; USDT="0x55d398326f99059ff775485246999027b3197955"

async def main():
    r=bus.get_redis(); await r.flushall()
    await circuit_breaker.arm()
    # 1. oracle divergence trips breaker: pool says 1500, oracle says 1075 (~40% off)
    await r.hset("mkt:pair:bsc:WBNB:USDT", mapping={"midPrice":"1500","regime":"high_vol","ewmaVol":"0.5"})
    await r.hset("mkt:oracle:bsc:BNB/USD", mapping={"price":"1075"})
    pair = await state.get_pair("WBNB","USDT"); oracle = await state.get_oracle("BNB/USD")
    a = anomaly.oracle_divergence(float(pair["midPrice"]), oracle)
    assert a, "should detect divergence"
    await circuit_breaker.trip(a.detail)
    state_now = await circuit_breaker.current_state()
    print(f"after oracle divergence ({a.detail}): breaker = {state_now}")
    assert state_now == "TRIPPED"

    # 2. while tripped, strategy must stand down
    from agents.strategy import agent as strategy
    breaker = await r.hget("risk:breaker","state")
    print(f"strategy would skip scanning: breaker={breaker} -> {'HALT' if breaker=='TRIPPED' else 'run'}")
    assert breaker == "TRIPPED"

    # 3. consecutive failures also trip
    await circuit_breaker.arm()
    for i in range(3):
        await risk.on_fill("failed")
    s = await circuit_breaker.current_state()
    print(f"after 3 consecutive failures: breaker = {s}")
    assert s == "TRIPPED"
    # 4. drawdown breach also trips
    await circuit_breaker.arm()
    a_drawdown = anomaly.drawdown_breach(10.0, 7.0) # 10% drawdown >= 7% cap
    assert a_drawdown, "should detect drawdown breach"
    await circuit_breaker.trip(a_drawdown.detail)
    s_drawdown = await circuit_breaker.current_state()
    print(f"after drawdown breach: breaker = {s_drawdown}")
    assert s_drawdown == "TRIPPED"

    print("\nPASS: circuit breaker trips on oracle divergence, failure streak, and drawdown breach, halts trading")

asyncio.run(main())

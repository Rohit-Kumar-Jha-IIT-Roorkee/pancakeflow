import sys, asyncio, json, time, os, pytest
sys.path.insert(0,'.')
from agents.common import config
from agents.portfolio import ledger

@pytest.mark.asyncio
async def test_postgres_roundtrip():
    if not config.DATABASE_URL:
        pytest.skip("DATABASE_URL not set; skipping Postgres test")

    await ledger.init()

    trade_id = f"test_trade_{int(time.time())}"
    t = {
        "id": trade_id,
        "chain": "bsc",
        "strategy": "test_strat",
        "kind": "cycle",
        "legs": [{"pool": "0xABC"}],
        "amount_in": 100,
        "amount_out": 110,
        "gas_wei": 5000000,
        "status": "executed",
        "mode": "paper",
        "tx_hash": "0xDEF",
        "realized_pnl_usd": 10.5,
        "proposal": {"confidence": 0.9}
    }

    # Insert trade
    await ledger.record_trade(t)

    # Read back trades
    trades = await ledger.all_trades(5)
    
    # Assert it exists and matches
    found = None
    for tr in trades:
        if tr["id"] == trade_id:
            found = tr
            break
            
    assert found is not None, "Trade was not returned by all_trades()"
    assert found["strategy"] == "test_strat"
    assert found["realized_pnl_usd"] == 10.5
    assert found["status"] == "executed"
    
if __name__ == "__main__":
    asyncio.run(test_postgres_roundtrip())

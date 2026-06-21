"""
Demo market state seeder.

Seeds synthetic but internally consistent pool data into Redis so the
paper-mode agents can run real Bellman-Ford arbitrage detection without
needing a live BSC RPC. This is the correct way to drive the demo: seed
MARKET STATE (pool reserves / prices), not fake trade records.

The injected scenario:
  Pool A  WBNB/USDT V2  mid = 580.0  (PancakeSwap main pool)
  Pool B  WBNB/USDT V2  mid = 591.5  (+1.98% vs A)
  Pool C  CAKE/WBNB  V2  mid = 181.2 CAKE per WBNB

The 1.98% spread between A and B creates a two-hop negative cycle
(WBNB -> USDT on B, USDT -> WBNB on A) that the scanner's Bellman-Ford
will detect and the paper executor will trade through the full gate/sim
pipeline. Real BSC spreads are <5bps; this is intentionally wide for a
demo with no competing MEV bots.

Usage:
    python scripts/seed_market.py        # uses REDIS_URL env var or localhost
"""
import asyncio, json, sys, time, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agents.common.bus import get_redis
from agents.common import config

E18 = 10 ** 18

WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"
USDT = "0x55d398326f99059ff775485246999027b3197955"
CAKE = "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82"

POOL_A = "0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae"  # WBNB/USDT V2 main
POOL_B = "0x36696169c63e42cd08ce11f5deebbcebae652050"  # WBNB/USDT V2 alt
POOL_C = "0xa527a61703d82139f8a06bc30097cc9caa2df5a6"  # CAKE/WBNB V2

# Pool A: 5000 WBNB / 2,900,000 USDT → mid price 580 USDT/WBNB
R_A0 = 5_000 * E18
R_A1 = 2_900_000 * E18

# Pool B: 5000 WBNB / 2,957,500 USDT → mid price 591.5 USDT/WBNB (+1.98%)
R_B0 = 5_000 * E18
R_B1 = 2_957_500 * E18

# Pool C: 1,000,000 CAKE / 5,520 WBNB → 1 WBNB ≈ 181.16 CAKE ≈ 3.2 USD/CAKE
R_C0 = 1_000_000 * E18
R_C1 = 5_520 * E18


async def seed() -> None:
    r = get_redis()
    ts = str(int(time.time() * 1000))
    chain = config.CHAIN

    catalog = {
        POOL_A: json.dumps({"address": POOL_A, "symbol0": "WBNB", "symbol1": "USDT",
                             "token0": WBNB, "token1": USDT, "tier": "blue-chip", "poolType": 2}),
        POOL_B: json.dumps({"address": POOL_B, "symbol0": "WBNB", "symbol1": "USDT",
                             "token0": WBNB, "token1": USDT, "tier": "blue-chip", "poolType": 2}),
        POOL_C: json.dumps({"address": POOL_C, "symbol0": "CAKE", "symbol1": "WBNB",
                             "token0": CAKE, "token1": WBNB, "tier": "mid-cap", "poolType": 2}),
    }
    await r.hset(f"mkt:pools:catalog:{chain}", mapping=catalog)

    await r.hset(f"mkt:pool:{chain}:{POOL_A.lower()}", mapping={
        "address": POOL_A, "poolType": "2", "token0": WBNB, "token1": USDT,
        "reserve0": str(R_A0), "reserve1": str(R_A1),
        "midPrice": "580", "feeBps": "25", "blockNumber": "38000000", "updatedAt": ts,
    })
    await r.hset(f"mkt:pool:{chain}:{POOL_B.lower()}", mapping={
        "address": POOL_B, "poolType": "2", "token0": WBNB, "token1": USDT,
        "reserve0": str(R_B0), "reserve1": str(R_B1),
        "midPrice": "591.5", "feeBps": "25", "blockNumber": "38000000", "updatedAt": ts,
    })
    await r.hset(f"mkt:pool:{chain}:{POOL_C.lower()}", mapping={
        "address": POOL_C, "poolType": "2", "token0": CAKE, "token1": WBNB,
        "reserve0": str(R_C0), "reserve1": str(R_C1),
        "midPrice": "0.00552", "feeBps": "25", "blockNumber": "38000000", "updatedAt": ts,
    })

    await r.hset(f"mkt:gas:{chain}", mapping={"gasPriceWei": "3000000000"})
    await r.hset(f"mkt:oracle:{chain}:BNB/USD", mapping={"price": "585"})
    await r.hset(f"mkt:oracle:{chain}:CAKE/USD", mapping={"price": "3.2"})

    # Pair metadata consumed by the regime badge and oracle-divergence check
    await r.hset(f"mkt:pair:{chain}:WBNB:USDT", mapping={
        "regime": "mean_reverting", "spread_bps": "198",
        "midPrice": "585.75",   # must be within 300bps of oracle (585) to keep breaker ARMED
        "updatedAt": ts,
    })

    await r.hset("risk:breaker", mapping={"state": "ARMED", "reason": ""})

    print(f"[seed_market] Redis: {config.REDIS_URL}")
    print(f"  Pool A  WBNB/USDT  mid=580.0   ({POOL_A[:10]}…)")
    print(f"  Pool B  WBNB/USDT  mid=591.5   ({POOL_B[:10]}…)  +1.98% vs A")
    print(f"  Pool C  CAKE/WBNB  mid=181.16  ({POOL_C[:10]}…)")
    print(f"  Bellman-Ford arb: WBNB->USDT on B, USDT->WBNB on A  (~150 bps gross)")
    print(f"  Start agents now:  make agents")


asyncio.run(seed())

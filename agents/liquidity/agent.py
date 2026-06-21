"""Liquidity & Pool Analysis Agent (A6). Reads pools.catalog, computes
IL estimates, tracks risk tiers, and emits pool.imbalance events."""
from __future__ import annotations
import asyncio
import json
import math
from ..common import config, bus, state

async def get_catalog() -> dict:
    """Read the pool catalog written by ingestion."""
    raw = await bus.get_redis().hgetall(state._catalog_key(config.CHAIN))
    if not raw:
        return {}
    return {k: json.loads(v) for k, v in raw.items()}

def estimate_il(r: float) -> float:
    """Estimate Impermanent Loss. r is the price ratio change.
    IL(r) = 2*sqrt(r)/(1+r) - 1
    """
    if r <= 0: return 0.0
    return 2 * math.sqrt(r) / (1 + r) - 1

def is_pool_safe(pool_id: str, catalog: dict, allowed_tiers: tuple[str, ...]) -> bool:
    """Check if a pool's risk tier is allowed by the profile."""
    pool_info = catalog.get(pool_id, {})
    tier = pool_info.get("tier", "degen") # default to degen if unknown
    return tier in allowed_tiers

async def run() -> None:
    print("[liquidity] A6 agent online")
    while True:
        try:
            catalog = await get_catalog()
            for pool_id, info in catalog.items():
                pool = await state.get_pool(pool_id)
                if not pool:
                    continue
                res0 = float(pool.get("reserve0", 1))
                res1 = float(pool.get("reserve1", 1))
                if res0 > 0 and res1 > 0:
                    ratio = res0 / res1
                    # Dummy imbalance detection logic
                    if ratio > 1000 or ratio < 0.001:
                        await bus.publish(config.STREAM_MARKET, "pool.imbalance", {
                            "pool": pool_id, "ratio": ratio, "tier": info.get("tier", "degen")
                        })
        except Exception as e:
            print(f"[liquidity] error: {e}")
        await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(run())

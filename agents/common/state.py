"""Read-only accessors over the Market State Graph that the P1 ingestion service
writes. Keys mirror services/ingestion/src/redis.ts exactly."""
from __future__ import annotations
from typing import Optional
from .bus import get_redis
from . import config

def _pool_key(chain: str, addr: str) -> str:   return f"mkt:pool:{chain}:{addr.lower()}"
def _pair_key(chain: str, s0: str, s1: str) -> str: return f"mkt:pair:{chain}:{s0}:{s1}"
def _gas_key(chain: str) -> str:               return f"mkt:gas:{chain}"
def _catalog_key(chain: str) -> str:           return f"mkt:pools:catalog:{chain}"
def _oracle_key(chain: str, pair: str) -> str: return f"mkt:oracle:{chain}:{pair}"

async def get_pool(addr: str, chain: str = config.CHAIN) -> Optional[dict]:
    h = await get_redis().hgetall(_pool_key(chain, addr))
    return h or None

async def get_all_pools(chain: str = config.CHAIN) -> list[dict]:
    """Reads the catalog, then hydrates live state for each pool."""
    r = get_redis()
    cat = await r.hgetall(_catalog_key(chain))
    pools: list[dict] = []
    for addr in cat.keys():
        live = await r.hgetall(_pool_key(chain, addr))
        import json
        meta = json.loads(cat[addr])
        if live:
            live.update({"symbol0": meta["symbol0"], "symbol1": meta["symbol1"], "tier": meta.get("tier", "unrated")})
            pools.append(live)
        else:
            pools.append(meta)
    return pools

async def get_pair(s0: str, s1: str, chain: str = config.CHAIN) -> Optional[dict]:
    h = await get_redis().hgetall(_pair_key(chain, s0, s1))
    return h or None

async def get_gas_wei(chain: str = config.CHAIN) -> int:
    h = await get_redis().hgetall(_gas_key(chain))
    return int(h.get("gasPriceWei", "5000000000")) if h else 5_000_000_000  # 5 gwei default

async def get_oracle(pair: str, chain: str = config.CHAIN) -> Optional[float]:
    v = await get_redis().hget(_oracle_key(chain, pair), "price")
    return float(v) if v else None

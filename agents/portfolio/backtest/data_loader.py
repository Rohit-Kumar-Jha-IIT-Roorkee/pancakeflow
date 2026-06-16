"""Load historical pool snapshots from Timescale (or synthesize for demo)."""
from __future__ import annotations
from ..ledger import _pool  # reuse the asyncpg pool
import asyncpg
from ...common import config

async def load_snapshots(pool_addr: str, limit: int = 5000) -> list[dict]:
    if config.DATABASE_URL:
        try:
            conn = await asyncpg.connect(config.DATABASE_URL)
            rows = await conn.fetch(
                "SELECT time, reserve0, reserve1, mid_price FROM pool_snapshots "
                "WHERE pool=$1 ORDER BY time ASC LIMIT $2", pool_addr.lower(), limit)
            await conn.close()
            return [dict(r) for r in rows]
        except Exception:
            pass
    return []  # caller synthesizes if empty

"""Trade ledger. Three-tier persistence so the system runs in any environment:
  1. Postgres (DATABASE_URL set) — production, full SQL analytics.
  2. Redis list (no DB, but Redis present) — cross-process shared state for the
     demo, so the API server sees trades booked by the agent process.
  3. Pure in-memory — last resort (tests/single-process)."""
from __future__ import annotations
import json
from typing import Optional
import asyncpg
import os
from ..common import config, bus

_pool: Optional[asyncpg.Pool] = None
_memory_trades: list[dict] = []
_REDIS_KEY = "ledger:trades"

async def init() -> None:
    global _pool
    if config.DATABASE_URL:
        try:
            _pool = await asyncpg.create_pool(config.DATABASE_URL, min_size=1, max_size=4)
            # Apply migrations idempotently
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            migrations_dir = os.path.join(base_dir, "data", "migrations")
            async with _pool.acquire() as c:
                for filename in ["001_tables.sql", "002_timescale.sql"]:
                    filepath = os.path.join(migrations_dir, filename)
                    if os.path.exists(filepath):
                        with open(filepath, "r") as f:
                            await c.execute(f.read())
            return
        except Exception as e:
            print(f"[portfolio] DB unavailable ({e}); using Redis-backed ledger")

async def record_trade(t: dict) -> None:
    if _pool:
        async with _pool.acquire() as c:
            await c.execute(
                """INSERT INTO trades (id, chain, strategy, kind, legs, amount_in, amount_out,
                   gas_wei, status, mode, tx_hash, realized_pnl_usd, proposal)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                   ON CONFLICT (id) DO NOTHING""",
                t["id"], t["chain"], t["strategy"], t["kind"], json.dumps(t.get("legs", [])),
                t.get("amount_in", 0), t.get("amount_out", 0), t.get("gas_wei", 0),
                t["status"], t["mode"], t.get("tx_hash"), t.get("realized_pnl_usd", 0.0),
                json.dumps(t.get("proposal", {})))
        return
    # Redis-backed shared fallback
    try:
        await bus.get_redis().lpush(_REDIS_KEY, json.dumps(t, default=str))
        await bus.get_redis().ltrim(_REDIS_KEY, 0, 999)
        return
    except Exception:
        pass
    _memory_trades.append(t)

async def all_trades(limit: int = 200) -> list[dict]:
    if _pool:
        async with _pool.acquire() as c:
            rows = await c.fetch("SELECT * FROM trades ORDER BY ts DESC LIMIT $1", limit)
            return [dict(r) for r in rows]
    try:
        raw = await bus.get_redis().lrange(_REDIS_KEY, 0, limit - 1)
        if raw:
            return [json.loads(x) for x in raw]
    except Exception:
        pass
    return list(reversed(_memory_trades[-limit:]))

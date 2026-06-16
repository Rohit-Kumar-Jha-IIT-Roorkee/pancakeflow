"""Circuit breaker state machine: ARMED -> TRIPPED -> COOLDOWN -> ARMED.
When TRIPPED it (a) sets the shared Redis flag every agent checks, (b) pushes a
UI banner, and (c) (in testnet/live) would call ArbExecutor.pause() on-chain.
Fail-closed: callers treat unknown/missing state cautiously."""
from __future__ import annotations
import time
from ..common import config, bus

COOLDOWN_SEC = 60

async def trip(reason: str) -> None:
    r = bus.get_redis()
    await r.hset(config.KEY_BREAKER, mapping={"state": "TRIPPED", "reason": reason,
                                              "trippedAt": str(int(time.time()))})
    await bus.publish(config.STREAM_TRADE, "risk.circuit_breaker", {"state": "TRIPPED", "reason": reason})
    await bus.ui_push("circuit_breaker", {"state": "TRIPPED", "reason": reason})
    print(f"[risk] !! CIRCUIT BREAKER TRIPPED: {reason}")
    # NOTE (P4): in testnet/live mode, also submit ArbExecutor.pause() via the
    # execution service here for an on-chain backstop.

async def maybe_recover() -> None:
    r = bus.get_redis()
    h = await r.hgetall(config.KEY_BREAKER)
    if h.get("state") == "TRIPPED" and int(time.time()) - int(h.get("trippedAt", 0)) > COOLDOWN_SEC:
        await r.hset(config.KEY_BREAKER, "state", "COOLDOWN")
        await bus.ui_push("circuit_breaker", {"state": "COOLDOWN", "reason": "cooldown elapsed"})

async def current_state() -> str:
    s = await bus.get_redis().hget(config.KEY_BREAKER, "state")
    return s or "ARMED"

async def arm() -> None:
    await bus.get_redis().hset(config.KEY_BREAKER, "state", "ARMED")

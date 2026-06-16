"""Redis Streams bus — mirrors services/ingestion/src/publisher.ts.
Entries: {id, type, ts, source, payload(json)}. Consumer groups give each agent
an independent, replayable cursor; the stream IS the audit trail."""
from __future__ import annotations
import json, time, uuid
from typing import Any, AsyncIterator
import redis.asyncio as aioredis
from . import config

_redis: aioredis.Redis | None = None

def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(config.REDIS_URL, decode_responses=True)
    return _redis

async def publish(stream: str, type_: str, payload: dict[str, Any], source: str = "agents") -> str:
    r = get_redis()
    return await r.xadd(stream, {
        "id": uuid.uuid4().hex, "type": type_, "ts": str(int(time.time() * 1000)),
        "source": source, "payload": json.dumps(payload),
    }, maxlen=20000, approximate=True)

async def consume(stream: str, group: str, consumer: str,
                  block_ms: int = 1000, count: int = 16) -> AsyncIterator[tuple[str, str, dict]]:
    """Yields (entry_id, type, payload). Caller acks via ack()."""
    r = get_redis()
    try:
        await r.xgroup_create(stream, group, id="0", mkstream=True)
    except aioredis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise
    while True:
        resp = await r.xreadgroup(group, consumer, {stream: ">"}, count=count, block=block_ms)
        if not resp:
            yield ("", "", {})  # heartbeat tick so callers can do periodic work
            continue
        for _, entries in resp:
            for entry_id, fields in entries:
                payload = json.loads(fields.get("payload", "{}"))
                yield (entry_id, fields.get("type", ""), payload)

async def ack(stream: str, group: str, entry_id: str) -> None:
    await get_redis().xack(stream, group, entry_id)

async def ui_push(kind: str, data: dict[str, Any]) -> None:
    """Fire-and-forget push to the dashboard via pub/sub."""
    await get_redis().publish(config.UI_CHANNEL, json.dumps({"kind": kind, "data": data, "ts": int(time.time()*1000)}))

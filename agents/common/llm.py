"""LLM reasoning helper. Hard rule: the LLM is OUT of the hot path — it only
adjusts confidence / writes narratives. Every call is schema-validated; if no
API key is set, callers fall back to deterministic rules. The arithmetic is
never delegated to the model."""
from __future__ import annotations
import json
from typing import Optional
import httpx
from . import config

async def reason_json(system: str, user: str, max_tokens: int = 512) -> Optional[dict]:
    """Returns parsed JSON dict or None (caller must have a rule-based fallback)."""
    if not config.ANTHROPIC_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": config.ANTHROPIC_KEY,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": "claude-sonnet-4-6", "max_tokens": max_tokens,
                      "system": system + "\nRespond ONLY with valid JSON, no prose, no markdown.",
                      "messages": [{"role": "user", "content": user}]},
            )
            data = r.json()
            text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
            text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            return json.loads(text)
    except Exception:
        return None

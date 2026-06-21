"""Trade memory (BONUS: RAG/vector DB). Stores 'trade memos' (context+outcome)
and retrieves similar past situations so the Strategy agent learns. Uses Qdrant
when QDRANT_URL is set; otherwise an in-memory cosine store so it always runs.
Embeddings: a cheap deterministic hashing embedding (no external model needed
for the demo; swap for a real embedder in prod)."""
from __future__ import annotations
import hashlib, math, time
from dataclasses import dataclass, field
from ..common import config

DIM = 384

_model = None

def _embed(text: str) -> list[float]:
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception:
            _model = "fallback"
            
    if _model == "fallback":
        # Deterministic bag-of-hashed-tokens fallback
        import hashlib
        vec = [0.0] * DIM
        for tok in text.lower().split():
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            vec[h % DIM] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]
        
    return _model.encode(text).tolist()

def _cos(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))

@dataclass
class _Memo:
    text: str; vec: list[float]; outcome: dict; ts: float

class TradeMemory:
    def __init__(self) -> None:
        self._mem: list[_Memo] = []
        self._qdrant = None
        if config.QDRANT_URL:
            try:
                from qdrant_client import QdrantClient
                from qdrant_client.models import Distance, VectorParams
                self._qdrant = QdrantClient(url=config.QDRANT_URL)
                try:
                    self._qdrant.get_collection("trade_memos")
                except Exception:
                    self._qdrant.create_collection(
                        "trade_memos", vectors_config=VectorParams(size=DIM, distance=Distance.COSINE))
            except Exception:
                self._qdrant = None

    async def add(self, context: str, outcome: dict) -> None:
        import asyncio
        vec = await asyncio.to_thread(_embed, context)
        if self._qdrant:
            try:
                from qdrant_client.models import PointStruct
                # qdrant_client provides async methods, but we use sync client, so wrap it
                await asyncio.to_thread(self._qdrant.upsert, "trade_memos", [PointStruct(
                    id=int(time.time() * 1e6) % (2**63), vector=vec,
                    payload={"text": context, **outcome})])
                return
            except Exception:
                pass
        self._mem.append(_Memo(context, vec, outcome, time.time()))

    async def recall(self, context: str, k: int = 3) -> list[dict]:
        import asyncio
        vec = await asyncio.to_thread(_embed, context)
        if self._qdrant:
            try:
                res = await asyncio.to_thread(self._qdrant.search, "trade_memos", vec, limit=k)
                return [r.payload for r in res]
            except Exception:
                pass
        scored = sorted(self._mem, key=lambda m: _cos(vec, m.vec), reverse=True)[:k]
        return [{"text": m.text, **m.outcome} for m in scored]

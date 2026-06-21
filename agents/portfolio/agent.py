"""Portfolio & Performance Agent (A5). Books fills, computes metrics, writes
trade memos back into the Strategy agent's vector memory (closing the RAG loop)."""
from __future__ import annotations
import asyncio
import datetime
from ..common import config, bus
from ..common.schemas import Fill
from . import ledger, metrics
from ..strategy.agent import memory as trade_memory

async def init() -> None:
    await ledger.init()

async def on_fill(fill: Fill, proposal: dict) -> None:
    pnl_usd = 0.0
    if fill.status == "executed":
        # paper/testnet: realized profit in start-token wei -> rough USD via $1 stable assumption
        profit_wei = int(fill.amountOutWei or "0") - int(fill.amountInWei or "0")
        pnl_usd = profit_wei / 1e18
    await ledger.record_trade({
        "id": fill.tradeId, "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "chain": config.CHAIN,
        "strategy": proposal.get("strategy", "?"), "kind": proposal.get("kind", "cycle"),
        "legs": proposal.get("legs", []), "amount_in": int(fill.amountInWei or 0),
        "amount_out": int(fill.amountOutWei or 0), "gas_wei": int(fill.gasWei or 0),
        "status": fill.status, "mode": fill.mode, "tx_hash": fill.txHash,
        "realized_pnl_usd": pnl_usd, "proposal": proposal})
    # close the RAG loop: store the outcome memo
    path = proposal.get("rationale", "")
    await trade_memory.add(f"arb {path} bps {proposal.get('expProfitBps',0)}",
                     {"status": fill.status, "pnl": pnl_usd})
    await bus.ui_push("fill", {"id": fill.tradeId, "status": fill.status, "pnl_usd": round(pnl_usd, 4)})
    await _push_summary()

async def _push_summary() -> None:
    summary = metrics.summarize(await ledger.all_trades())
    await bus.ui_push("summary", summary)

async def summary() -> dict:
    return metrics.summarize(await ledger.all_trades())

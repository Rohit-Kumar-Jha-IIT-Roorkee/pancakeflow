"""Trade lifecycle orchestrator. A deterministic state machine — the LLM agents
are nodes, but the TOPOLOGY is code: a proposal physically cannot reach
execution without passing risk.gate then simulation. (LangGraph-shaped; kept
dependency-light so it runs anywhere. Swap in langgraph.StateGraph 1:1.)

  proposed --> [risk.gate] --> sized --> [simulation.dry_run] --> [risk.approve]
            --> approved --> [execute] --> [portfolio.book] --> done
"""
from __future__ import annotations
import asyncio, json
from ..common import config, bus
from ..common.schemas import TradeProposal, SizedTrade, Fill
from ..risk import agent as risk
from ..simulation import fork_runner
from ..portfolio import agent as portfolio
from . import executor_paper

# in-flight sized trades awaiting sim+approval, keyed by trade id
_pending: dict[str, SizedTrade] = {}
_proposals: dict[str, dict] = {}

async def handle(type_: str, payload: dict) -> None:
    if type_ == "trade.proposed":
        p = TradeProposal(**payload)
        _proposals[p.id] = payload
        await risk.gate_proposal(p)                       # -> emits trade.sized or trade.rejected

    elif type_ == "trade.sized":
        sized = SizedTrade(**payload)
        _pending[sized.proposal.id] = sized
        sim = await fork_runner.dry_run(sized)            # A7 requote dry-run
        await bus.publish(config.STREAM_TRADE, "simulation.result", sim.model_dump())
        await risk.approve_after_sim(sized.proposal.id, sized, sim.passed, sim.reason)
        await _log(sized.proposal.id, "simulation", "result",
                   {"passed": sim.passed, "bps": sim.requotedProfitBps, "reason": sim.reason})

    elif type_ == "trade.approved":
        sized = SizedTrade(**payload)
        sim = await fork_runner.dry_run(sized)
        fill = await executor_paper.execute(sized, int(sim.requotedProfitWei or "0"))
        ev = "trade.executed" if fill.status == "executed" else "trade.failed"
        await bus.publish(config.STREAM_TRADE, ev, fill.model_dump())
        await _log(fill.tradeId, "execution", fill.status,
                   {"out": fill.amountOutWei, "reason": fill.failReason})
        await risk.on_fill(fill.status)
        await portfolio.on_fill(fill, _proposals.get(fill.tradeId, {}))
        _pending.pop(fill.tradeId, None); _proposals.pop(fill.tradeId, None)

async def _log(trade_id: str, agent: str, event: str, payload: dict) -> None:
    await bus.publish(config.STREAM_TRADE, "agent.decision",
                      {"trade_id": trade_id, "agent": agent, "event": event, "payload": payload})

async def run() -> None:
    await portfolio.init()
    print("[orchestrator] lifecycle FSM online")
    async for entry_id, type_, payload in bus.consume(config.STREAM_TRADE, "orchestrator", "orch-1"):
        if not entry_id:
            continue
        try:
            await handle(type_, payload)
        except Exception as e:
            print(f"[orchestrator] error on {type_}: {e}")
        finally:
            await bus.ack(config.STREAM_TRADE, "orchestrator", entry_id)

if __name__ == "__main__":
    asyncio.run(run())

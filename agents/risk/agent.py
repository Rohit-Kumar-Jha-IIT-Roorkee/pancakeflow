"""Risk Management Agent (A4). Gates every proposal and continuously monitors.
It is the only thing that emits trade.approved — proposals can never reach
execution without passing this gate (enforced by the orchestrator topology)."""
from __future__ import annotations
import asyncio, json
from ..common import config, bus, state
from ..common.schemas import TradeProposal, SizedTrade
from . import profiles, limits, anomaly, circuit_breaker
from ..portfolio import ledger, metrics
from ..liquidity import agent as liquidity

_fail_streak = 0

async def _open_position_count() -> int:
    return await bus.get_redis().scard(config.KEY_POSITIONS)

async def gate_proposal(p: TradeProposal) -> None:
    """proposal -> sized/approved or rejected, recorded for the decision graph."""
    profile = profiles.get(config.RISK_PROFILE)
    await _log(p.id, "risk", "gate_start", {"strategy": p.strategy, "bps": p.expProfitBps})

    if await circuit_breaker.current_state() == "TRIPPED":
        return await _reject(p, "circuit breaker tripped")

    # Drawdown gate
    import datetime
    today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    trades = await ledger.all_trades(500)
    today_trades = [t for t in trades if str(t.get("ts", "")) >= today_str]
    summary = metrics.summarize(today_trades)
    current_dd = summary.get("max_drawdown_pct", 0.0)
    a = anomaly.drawdown_breach(current_dd, profile.daily_max_drawdown_pct)
    if a:
        await circuit_breaker.trip(a.detail)
        return await _reject(p, f"drawdown breach: {a.detail}")

    # Token-safety gate
    catalog = await liquidity.get_catalog()
    if p.kind == "cycle":
        for leg in p.legs:
            if not liquidity.is_pool_safe(leg.pool, catalog, profile.allowed_tiers):
                return await _reject(p, f"pool {leg.pool} tier not allowed for profile {profile.name}")

    open_n = await _open_position_count()
    ok, sized, reason = limits.size_and_check(
        int(p.amountInWei or "0"), config.CAPITAL_USD, profile, open_n, p.slippageBps)

    # arb cycles don't take a held position; directional trend trades do
    if p.kind == "directional" and not ok:
        return await _reject(p, reason)
    if p.kind == "cycle" and int(p.amountInWei) > 0 and not ok:
        return await _reject(p, reason)
    if p.strategy in ("cross_pool_arb", "triangular_arb") and not profile.flash_arb_enabled and int(p.amountInWei) > int(config.CAPITAL_USD * 1e18):
        return await _reject(p, "flash arb disabled for profile; size exceeds inventory")

    sized_wei = sized if ok else int(p.amountInWei or "0")
    st = SizedTrade(proposal=p, sizedAmountWei=str(sized_wei), profile=profile.name)
    await bus.publish(config.STREAM_TRADE, "trade.sized", st.model_dump())
    await _log(p.id, "risk", "sized", {"sized": sized_wei, "profile": profile.name, "reason": reason})

async def approve_after_sim(trade_id: str, sized: SizedTrade, sim_passed: bool, sim_reason: str) -> None:
    if not sim_passed:
        return await _reject(sized.proposal, f"simulation failed: {sim_reason}")
    await bus.publish(config.STREAM_TRADE, "trade.approved", sized.model_dump())
    await _log(trade_id, "risk", "approved", {"sized": sized.sizedAmountWei})
    await bus.ui_push("approved", {"id": trade_id, "amount": sized.sizedAmountWei})

async def on_fill(status: str) -> None:
    """Track failure streak -> circuit breaker."""
    global _fail_streak
    _fail_streak = _fail_streak + 1 if status == "failed" else 0
    a = anomaly.consecutive_failures(_fail_streak)
    if a:
        await circuit_breaker.trip(a.detail)
        _fail_streak = 0

async def monitor_loop() -> None:
    """Continuous anomaly watch (oracle divergence) + breaker recovery."""
    while True:
        try:
            pair = await state.get_pair("WBNB", "USDT")
            oracle = await state.get_oracle("BNB/USD")
            if pair and oracle:
                a = anomaly.oracle_divergence(float(pair.get("midPrice", 0)), oracle)
                if a:
                    await circuit_breaker.trip(a.detail)
            await circuit_breaker.maybe_recover()
        except Exception as e:
            print(f"[risk] monitor error: {e}")
        await asyncio.sleep(5)

async def _reject(p: TradeProposal, reason: str) -> None:
    await bus.publish(config.STREAM_TRADE, "trade.rejected", {"id": p.id, "reason": reason})
    await _log(p.id, "risk", "rejected", {"reason": reason})
    await bus.ui_push("rejected", {"id": p.id, "reason": reason})

async def _log(trade_id: str, agent: str, event: str, payload: dict) -> None:
    await bus.publish(config.STREAM_TRADE, "agent.decision",
                      {"trade_id": trade_id, "agent": agent, "event": event, "payload": payload})

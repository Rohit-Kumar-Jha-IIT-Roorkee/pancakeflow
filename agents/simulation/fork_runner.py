"""Pre-execution dry-run (Simulation Agent A7, hot path).
Requotes the cycle against CURRENT reserves the instant before approval, using
the same exact AMM math as the strategy and the contract. This catches the
'looked profitable a block ago, would revert now' failure — the single most
valuable simulation feature. In testnet/live (P4) this also forks via Anvil and
replays the real tx; here we requote deterministically."""
from __future__ import annotations
from ..common import state, config
from ..common.schemas import SizedTrade, SimResult
from ..strategy.arbitrage.cycle_math import evaluate_cycle, get_pool_orientation

async def dry_run(sized: SizedTrade, min_profit_bps: float = 5.0) -> SimResult:
    p = sized.proposal
    if p.kind != "cycle" or not p.legs:
        return SimResult(tradeId=p.id, passed=True, requotedProfitWei="0",
                         requotedProfitBps=0.0, reason="directional; no requote")
    hops = []
    for leg in p.legs:
        pool = await state.get_pool(leg.pool)
        if not pool or ("reserve0" not in pool and "liquidity" not in pool):
            return SimResult(tradeId=p.id, passed=False, requotedProfitWei="0",
                             requotedProfitBps=0.0, reason=f"pool {leg.pool[:8]} missing")
        hops.append(get_pool_orientation(pool, leg.tokenIn))
    amount_in = int(sized.sizedAmountWei)
    ev = evaluate_cycle(hops, amount_in)
    passed = ev.profit_bps >= min_profit_bps

    return SimResult(tradeId=p.id, passed=passed, requotedProfitWei=str(ev.profit),
                     requotedProfitBps=round(ev.profit_bps, 2),
                     reason="requote ok" if passed else f"requote {ev.profit_bps:.1f}bps < {min_profit_bps}")

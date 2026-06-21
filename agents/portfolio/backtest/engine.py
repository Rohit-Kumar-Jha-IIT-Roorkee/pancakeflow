"""Backtester: replays historical reserve snapshots through the SAME arbitrage
math the live strategy uses (no sim-vs-live drift). Reports return, win rate,
and a P&L curve. Works on synthetic data when no history is present."""
from __future__ import annotations
from dataclasses import dataclass, field
from ...strategy.arbitrage.cycle_math import amount_out_with_fee, optimal_two_hop_input, evaluate_cycle

@dataclass
class BacktestResult:
    trades: int = 0
    wins: int = 0
    total_profit_wei: int = 0
    equity_curve: list[int] = field(default_factory=list)
    @property
    def win_rate(self) -> float:
        return round(self.wins / self.trades * 100, 1) if self.trades else 0.0

def run_two_pool(snapshots_a: list[dict], snapshots_b: list[dict],
                 min_bps: float = 10.0) -> BacktestResult:
    """For each aligned snapshot pair, check if a 2-pool arb existed and 'take' it."""
    res = BacktestResult()
    equity = 0
    n = min(len(snapshots_a), len(snapshots_b))
    for i in range(n):
        a, b = snapshots_a[i], snapshots_b[i]
        ra0, ra1 = int(a["reserve0"]), int(a["reserve1"])
        rb0, rb1 = int(b["reserve0"]), int(b["reserve1"])
        # try WBNB->USDT on B, USDT->WBNB on A (and the reverse); take the better
        best = 0; best_amt = 0
        for (h0, h1) in [((rb0, rb1, 2, 25), (ra1, ra0, 2, 25)), ((ra0, ra1, 2, 25), (rb1, rb0, 2, 25))]:
            amt = optimal_two_hop_input(h0[0], h0[1], h0[3], h1[0], h1[1], h1[3])
            if amt <= 0: continue
            ev = evaluate_cycle([h0, h1], amt)
            if ev.profit_bps >= min_bps and ev.profit > best:
                best, best_amt = ev.profit, amt
        if best > 0:
            res.trades += 1; res.wins += 1; res.total_profit_wei += best
            equity += best
        res.equity_curve.append(equity)
    return res

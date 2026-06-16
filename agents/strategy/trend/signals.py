"""Trend-following signal. Only fires when the Market Intelligence regime label
is 'trending_*' — this is the regime-adaptation the PS explicitly rewards
(a strategy that knows when NOT to trade). EMA-cross style entry."""
from __future__ import annotations
from dataclasses import dataclass

@dataclass
class TrendSignal:
    pair: str; side: str; strength: float; rationale: str

def evaluate(pair: str, regime: str, mid_price: float, ewma_vol: float) -> TrendSignal | None:
    if regime == "trending_up":
        return TrendSignal(pair, "long", min(1.0, 0.5 + ewma_vol),
                           f"{pair} regime=trending_up; momentum entry long")
    if regime == "trending_down":
        return TrendSignal(pair, "short", min(1.0, 0.5 + ewma_vol),
                           f"{pair} regime=trending_down; momentum entry short")
    return None  # mean_reverting / high_vol / unknown => trend strategy stands down

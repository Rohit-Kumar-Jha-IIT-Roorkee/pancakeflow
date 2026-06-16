"""Risk profiles — config consumed by the Risk Agent. Maps the PS's
conservative/moderate/aggressive tolerance to concrete numeric limits."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Profile:
    name: str
    max_pos_pct_capital: float     # max single trade as % of capital
    max_concurrent: int
    daily_max_drawdown_pct: float
    slippage_cap_bps: int
    flash_arb_enabled: bool
    allowed_tiers: tuple[str, ...]

PROFILES = {
    "conservative": Profile("conservative", 2.0, 3, 3.0, 30, False, ("blue-chip",)),
    "moderate":     Profile("moderate", 5.0, 6, 7.0, 75, True, ("blue-chip", "mid-cap")),
    "aggressive":   Profile("aggressive", 10.0, 12, 15.0, 150, True, ("blue-chip", "mid-cap", "degen")),
}

def get(name: str) -> Profile:
    return PROFILES.get(name, PROFILES["moderate"])

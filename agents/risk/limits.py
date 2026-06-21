"""Pre-trade gate: sizing + hard checks. Returns (ok, sized_wei, reason)."""
from __future__ import annotations
from .profiles import Profile

def size_and_check(proposal_amount_wei: int, capital_usd: float, profile: Profile,
                   open_positions: int, slippage_bps: int,
                   start_token_usd: float = 1.0) -> tuple[bool, int, str]:
    if open_positions >= profile.max_concurrent:
        return (False, 0, f"max concurrent positions ({profile.max_concurrent}) reached")
    if slippage_bps > profile.slippage_cap_bps:
        return (False, 0, f"slippage {slippage_bps}bps > cap {profile.slippage_cap_bps}")

    # cap trade size to profile's % of capital
    max_usd = capital_usd * profile.max_pos_pct_capital / 100.0
    max_wei = int(max_usd / max(start_token_usd, 1e-9) * 1e18)
    
    if proposal_amount_wei <= 0:
        sized = max_wei
    else:
        sized = min(proposal_amount_wei, max_wei) if max_wei > 0 else proposal_amount_wei
        
    if sized <= 0:
        return (False, 0, "sized to zero")
    return (True, sized, f"sized to {sized/1e18:.4f} (cap {profile.max_pos_pct_capital}% capital)")

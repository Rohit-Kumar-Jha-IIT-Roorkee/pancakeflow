"""Exact AMM math for arbitrage. Deterministic, unit-tested, no LLM.
Mirrors the on-chain ArbExecutor V2 fee math (0.25% => 9975/10000)."""
from __future__ import annotations
from dataclasses import dataclass
import math

V2_FEE_NUM = 9975
V2_FEE_DEN = 10000

def amount_out_with_fee(amount_in: int, reserve_in: int, reserve_out: int, fee_bps: int = 25) -> int:
    """Constant-product output with dynamic fee. Integer math = matches contract."""
    if amount_in <= 0 or reserve_in <= 0 or reserve_out <= 0:
        return 0
    a_with_fee = amount_in * (10000 - fee_bps)
    return (a_with_fee * reserve_out) // (reserve_in * 10000 + a_with_fee)

def cycle_output(amount_in: int, hops: list[tuple[int, int, int, int]]) -> int:
    """Run amount_in through a list of (reserve_in, reserve_out, pool_type, fee_bps) hops."""
    amt = amount_in
    for r_in, r_out, ptype, fee in hops:
        amt = amount_out_with_fee(amt, r_in, r_out, fee)
    return amt

def get_pool_orientation(pool: dict, token_in: str) -> tuple[int, int, int, int]:
    """Return (reserve_in, reserve_out, poolType, feeBps) for a swap of token_in through this pool."""
    ptype = int(pool.get("poolType", 2))
    fee = int(pool.get("feeBps", 25))
    if ptype == 3:
        liq = int(pool.get("liquidity", 0))
        sqrt_px96 = int(pool.get("sqrtPriceX96", 0))
        r0 = (liq << 96) // sqrt_px96 if sqrt_px96 > 0 else 0
        r1 = (liq * sqrt_px96) >> 96
    else:
        r0, r1 = int(pool.get("reserve0", 0)), int(pool.get("reserve1", 0))
        
    t0 = pool.get("token0", "").lower()
    return (r0, r1, ptype, fee) if token_in.lower() == t0 else (r1, r0, ptype, fee)

def optimal_two_hop_input(ra_in: int, ra_out: int, f_a: int, rb_in: int, rb_out: int, f_b: int) -> int:
    """Closed-form optimal input for a 2-hop cycle with variable fees.
    Maximizes (out - in). Derived from the product of two CP curves.
    f_a and f_b are fee_bps (e.g. 25). Returns 0 if no profitable size exists."""
    fa = (10000 - f_a) / 10000.0
    fb = (10000 - f_b) / 10000.0
    
    # effective combined reserves; standard arb sizing formula
    num = math.sqrt(fa * fb * ra_in * rb_in * ra_out * rb_out) - ra_in * rb_in
    den = fa * (rb_in + fa * ra_out)
    if den <= 0:
        return 0
    x = num / den
    return max(0, int(x))

@dataclass
class CycleEval:
    amount_in: int
    amount_out: int
    profit: int
    profit_bps: float

def evaluate_cycle(hops: list[tuple[int, int, int, int]], amount_in: int) -> CycleEval:
    out = cycle_output(amount_in, hops)
    profit = out - amount_in
    bps = (profit / amount_in * 10000) if amount_in > 0 else 0.0
    return CycleEval(amount_in, out, profit, bps)

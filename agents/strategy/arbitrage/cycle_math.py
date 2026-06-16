"""Exact AMM math for arbitrage. Deterministic, unit-tested, no LLM.
Mirrors the on-chain ArbExecutor V2 fee math (0.25% => 9975/10000)."""
from __future__ import annotations
from dataclasses import dataclass
import math

V2_FEE_NUM = 9975
V2_FEE_DEN = 10000

def v2_amount_out(amount_in: int, reserve_in: int, reserve_out: int) -> int:
    """Constant-product output with 0.25% fee. Integer math = matches contract."""
    if amount_in <= 0 or reserve_in <= 0 or reserve_out <= 0:
        return 0
    a_with_fee = amount_in * V2_FEE_NUM
    return (a_with_fee * reserve_out) // (reserve_in * V2_FEE_DEN + a_with_fee)

def cycle_output(amount_in: int, hops: list[tuple[int, int]]) -> int:
    """Run amount_in through a list of (reserve_in, reserve_out) V2 hops."""
    amt = amount_in
    for r_in, r_out in hops:
        amt = v2_amount_out(amt, r_in, r_out)
    return amt

def optimal_two_hop_input(ra_in: int, ra_out: int, rb_in: int, rb_out: int) -> int:
    """Closed-form optimal input for a 2-hop V2->V2 cycle (start token -> X -> start).
    Maximizes (out - in). Derived from the product of two CP curves with fee f.
    Returns 0 if no profitable size exists."""
    f = V2_FEE_NUM / V2_FEE_DEN
    # effective combined reserves; standard arb sizing formula
    # x* = (sqrt(f^2 * ra_in * rb_in * ra_out * rb_out) - ra_in * rb_in) / (f * (rb_in + f * ra_out))
    num = math.sqrt(f * f * ra_in * rb_in * ra_out * rb_out) - ra_in * rb_in
    den = f * (rb_in + f * ra_out)
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

def evaluate_cycle(hops: list[tuple[int, int]], amount_in: int) -> CycleEval:
    out = cycle_output(amount_in, hops)
    profit = out - amount_in
    bps = (profit / amount_in * 10000) if amount_in > 0 else 0.0
    return CycleEval(amount_in, out, profit, bps)

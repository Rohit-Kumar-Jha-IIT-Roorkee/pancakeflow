"""Validates AMM math against the SAME pool values verified in P2's EVM harness:
poolB 1000 WBNB / 1.15M USDT, poolA 1000 WBNB / 1.0M USDT.
Profitable cycle WBNB->USDT(B)->WBNB(A) returned 0.6607 WBNB on 5 WBNB on-chain."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from cycle_math import v2_amount_out, cycle_output, optimal_two_hop_input, evaluate_cycle

E18 = 10**18

def test_matches_onchain_profit():
    # leg0: WBNB->USDT on poolB (rIn=1000 WBNB, rOut=1.15M USDT)
    # leg1: USDT->WBNB on poolA (rIn=1.0M USDT, rOut=1000 WBNB)
    hops = [(1000*E18, 1_150_000*E18), (1_000_000*E18, 1000*E18)]
    ev = evaluate_cycle(hops, 5*E18)
    profit_wbnb = ev.profit / E18
    assert 0.65 < profit_wbnb < 0.67, f"expected ~0.6607, got {profit_wbnb}"
    print(f"  cycle profit on 5 WBNB = {profit_wbnb:.4f} WBNB (matches on-chain 0.6607)")

def test_losing_direction_negative():
    hops = [(1_000_000*E18, 1000*E18), (1000*E18, 1_150_000*E18)]  # reversed
    # this is USDT-start nonsense; check the OTHER reversed cycle is unprofitable
    hops2 = [(1000*E18, 1_000_000*E18), (1_150_000*E18, 1000*E18)]  # A then B in WBNB
    ev = evaluate_cycle(hops2, 5*E18)
    assert ev.profit < 0, f"reversed cycle should lose, got {ev.profit/E18}"
    print(f"  reversed cycle profit = {ev.profit/E18:.4f} WBNB (correctly negative)")

def test_optimal_sizing_beats_naive():
    ra_in, ra_out = 1000*E18, 1_150_000*E18   # poolB WBNB->USDT
    rb_in, rb_out = 1_000_000*E18, 1000*E18   # poolA USDT->WBNB
    x = optimal_two_hop_input(ra_in, ra_out, rb_in, rb_out)
    hops = [(ra_in, ra_out), (rb_in, rb_out)]
    ev_opt = evaluate_cycle(hops, x)
    ev_5 = evaluate_cycle(hops, 5*E18)
    assert ev_opt.profit >= ev_5.profit, "optimal size must not be worse than arbitrary 5"
    print(f"  optimal input = {x/E18:.2f} WBNB -> profit {ev_opt.profit/E18:.4f} WBNB "
          f"(vs {ev_5.profit/E18:.4f} at size 5)")

def test_zero_and_edge():
    assert v2_amount_out(0, 100, 100) == 0
    assert v2_amount_out(100, 0, 100) == 0
    assert cycle_output(10**18, []) == 10**18  # no hops = passthrough
    print("  edge cases ok")

if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print(f"PASS {name}")
    print("\nall cycle_math tests passed")

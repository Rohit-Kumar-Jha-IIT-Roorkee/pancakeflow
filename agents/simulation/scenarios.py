"""What-if scenario engine (BONUS). Transforms reserves/gas and re-evaluates."""
from __future__ import annotations
from ..strategy.arbitrage.cycle_math import evaluate_cycle

def what_if(hops: list[tuple[int, int]], amount_in: int,
            liquidity_mult: float = 1.0, gas_mult: float = 1.0,
            base_gas_wei: int = 0) -> dict:
    scaled = [(int(a * liquidity_mult), int(b * liquidity_mult)) for a, b in hops]
    ev = evaluate_cycle(scaled, amount_in)
    gas = int(base_gas_wei * gas_mult)
    return {"liquidity_mult": liquidity_mult, "gas_mult": gas_mult,
            "profit_wei": ev.profit, "profit_bps": round(ev.profit_bps, 2),
            "net_after_gas_wei": ev.profit - gas}

"""Paper execution (Execution Agent A3, paper mode). Simulates a fill at the
requoted price with a slippage haircut. Identical interface to the TS testnet/
live executor (services/execution) so swapping modes changes nothing upstream.
This is the P3 demo path; P4 adds real testnet submission."""
from __future__ import annotations
from ..common.schemas import SizedTrade, Fill
from ..strategy.arbitrage.cycle_math import evaluate_cycle
from ..common import state

async def execute(sized: SizedTrade, requoted_profit_wei: int) -> Fill:
    p = sized.proposal
    amount_in = int(sized.sizedAmountWei or "0")
    if p.kind == "directional":
        return Fill(tradeId=p.id, status="executed", mode="paper",
                    amountInWei=str(amount_in), amountOutWei=str(amount_in), gasWei=p.gasEstWei)
    # cycle: re-evaluate against current reserves, apply slippage haircut
    hops = []
    for leg in p.legs:
        pool = await state.get_pool(leg.pool)
        if not pool:
            return Fill(tradeId=p.id, status="failed", mode="paper", failReason="pool gone")
        r0, r1 = int(pool["reserve0"]), int(pool["reserve1"])
        # orient by the pool's own token0 — matches scanner + simulation
        hops.append((r0, r1) if leg.tokenIn.lower() == pool["token0"].lower() else (r1, r0))
    ev = evaluate_cycle(hops, amount_in)
    haircut = ev.amount_out * p.slippageBps // 10000
    out = ev.amount_out - haircut
    if out <= amount_in:
        return Fill(tradeId=p.id, status="failed", mode="paper",
                    amountInWei=str(amount_in), failReason="slippage erased profit")
    return Fill(tradeId=p.id, status="executed", mode="paper",
                amountInWei=str(amount_in), amountOutWei=str(out), gasWei=p.gasEstWei)

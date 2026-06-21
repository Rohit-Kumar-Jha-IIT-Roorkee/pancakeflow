"""Paper execution (Execution Agent A3, paper mode). Simulates a fill at the
requoted price with a slippage haircut. Identical interface to the TS testnet/
live executor (services/execution) so swapping modes changes nothing upstream.
This is the P3 demo path; P4 adds real testnet submission."""
from __future__ import annotations
from ..common.schemas import SizedTrade, Fill
from ..strategy.arbitrage.cycle_math import evaluate_cycle, get_pool_orientation, amount_out_with_fee
from ..common import state, config

async def execute(sized: SizedTrade, requoted_profit_wei: int) -> Fill:
    """Executes a simulated fill.
    Note: Directional P&L is strictly zero in paper mode because there is no true simulated future timeframe to close the position. Real P&L requires a position close event."""
    p = sized.proposal
    amount_in = int(sized.sizedAmountWei or "0")
    if p.kind == "directional":
        return Fill(tradeId=p.id, status="executed", mode="paper",
                    amountInWei=str(amount_in), amountOutWei=str(amount_in), gasWei=p.gasEstWei)
    # cycle: re-evaluate against current reserves, apply slippage haircut
    hops = []
    pools = []
    for leg in p.legs:
        pool = await state.get_pool(leg.pool)
        if not pool:
            return Fill(tradeId=p.id, status="failed", mode="paper", failReason="pool gone")
        hops.append(get_pool_orientation(pool, leg.tokenIn))
        pools.append((pool, leg.tokenIn))
    ev = evaluate_cycle(hops, amount_in)
    haircut = ev.amount_out * p.slippageBps // 10000
    out = ev.amount_out - haircut
    if out <= amount_in:
        return Fill(tradeId=p.id, status="failed", mode="paper",
                    amountInWei=str(amount_in), failReason="slippage erased profit")

    # Update reserves in Redis so the next scan sees depleted liquidity.
    # Without this, pools stay frozen and every trade is a guaranteed win.
    await _update_reserves(p.legs, hops, amount_in)

    return Fill(tradeId=p.id, status="executed", mode="paper",
                amountInWei=str(amount_in), amountOutWei=str(out), gasWei=p.gasEstWei)


async def _update_reserves(legs, hops, amount_in: int) -> None:
    """Write post-trade reserves back to Redis using the constant-product formula."""
    from ..common.bus import get_redis
    r = get_redis()
    cur = amount_in
    for leg, (r_in, r_out, ptype, fee_bps) in zip(legs, hops):
        if r_in <= 0 or r_out <= 0:
            break
        out = amount_out_with_fee(cur, r_in, r_out, fee_bps)
        # Determine direction: token_in == token0 → 0→1 (reserve0 up, reserve1 down)
        pool_raw = await state.get_pool(leg.pool)
        if not pool_raw:
            break
        t0 = pool_raw.get("token0", "").lower()
        if leg.tokenIn.lower() == t0:
            new_r0, new_r1 = r_in + cur, r_out - out
        else:
            new_r0, new_r1 = r_out - out, r_in + cur
        key = f"mkt:pool:{config.CHAIN}:{leg.pool.lower()}"
        await r.hset(key, mapping={"reserve0": str(max(1, new_r0)), "reserve1": str(max(1, new_r1))})
        cur = out

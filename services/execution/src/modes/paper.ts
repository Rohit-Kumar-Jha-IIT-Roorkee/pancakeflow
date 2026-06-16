import type { SizedTrade, Fill } from "../types.js";
/** Paper fill — mirrors agents/orchestrator/executor_paper.py. The TS service
 *  also supports paper mode so the whole pipeline can run language-agnostically. */
export async function paperFill(sized: SizedTrade): Promise<Fill> {
  const p = sized.proposal;
  const amt = sized.sizedAmountWei;
  // optimistic: trust the upstream sim's requote (orchestrator already gated)
  return { tradeId: p.id, status: "executed", mode: "paper",
    amountInWei: amt, amountOutWei: p.expProfitWei !== "0"
      ? (BigInt(amt) + BigInt(p.expProfitWei)).toString() : amt,
    gasWei: p.gasEstWei };
}

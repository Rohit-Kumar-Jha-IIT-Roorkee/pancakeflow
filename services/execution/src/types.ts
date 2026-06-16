/** Local mirrors (kept in sync with @pancakeflow/shared-types & Pydantic). */
export interface ProposalLeg {
  pool: string; tokenIn: string; tokenOut: string;
  symbolIn: string; symbolOut: string; poolType: 2 | 3;
}
export interface TradeProposal {
  id: string; chain: string; strategy: string; kind: "cycle" | "directional";
  legs: ProposalLeg[]; amountInWei: string; expProfitWei: string; expProfitBps: number;
  gasEstWei: string; confidence: number; riskScore: number; slippageBps: number; rationale: string;
}
export interface SizedTrade { proposal: TradeProposal; sizedAmountWei: string; profile: string; }
export interface Fill {
  tradeId: string; status: "executed" | "failed"; mode: "paper" | "testnet" | "live";
  txHash?: string; amountInWei: string; amountOutWei: string; gasWei: string; failReason?: string;
}

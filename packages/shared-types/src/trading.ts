import { z } from "zod";
import { ChainId } from "./market.js";

export const StrategyId = z.enum(["cross_pool_arb", "triangular_arb", "trend_follow"]);
export const TradeKind = z.enum(["cycle", "directional"]);

export const ProposalLeg = z.object({
  pool: z.string(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  symbolIn: z.string(),
  symbolOut: z.string(),
  poolType: z.union([z.literal(2), z.literal(3)]),
});

export const TradeProposal = z.object({
  id: z.string(),
  ts: z.number(),
  chain: ChainId,
  strategy: StrategyId,
  kind: TradeKind,
  legs: z.array(ProposalLeg),          // cycle: closed loop; directional: single leg
  pair: z.string().nullable(),          // directional only
  side: z.enum(["long", "short"]).nullable(),
  amountInWei: z.string(),              // proposed size (start-token wei)
  expProfitWei: z.string(),
  expProfitBps: z.number(),
  gasEstWei: z.string(),
  confidence: z.number(),               // 0..1
  riskScore: z.number(),                // 0..1 (higher = riskier)
  slippageBps: z.number(),
  ttlSec: z.number(),
  rationale: z.string(),
});
export type TradeProposal = z.infer<typeof TradeProposal>;

export const TradeEventType = z.enum([
  "trade.proposed", "trade.sized", "trade.rejected",
  "simulation.result", "trade.approved",
  "trade.executed", "trade.failed",
  "risk.circuit_breaker",
]);
export type TradeEventType = z.infer<typeof TradeEventType>;

import { z } from "zod";
import { ChainId, Regime } from "./market.js";

/** Envelope for every message on Redis Stream `events:market`. */
export const MarketEventType = z.enum([
  "market.tick",            // pool state changed (Sync / V3 Swap)
  "market.swap",            // individual swap observed
  "market.whale_alert",
  "market.regime_change",
  "market.gas",
  "market.oracle_divergence",
  "pool.catalog_updated",
]);
export type MarketEventType = z.infer<typeof MarketEventType>;

export const WhaleAlert = z.object({
  chain: ChainId,
  pool: z.string(),
  txHash: z.string(),
  usdValue: z.number(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  blockNumber: z.number(),
});
export type WhaleAlert = z.infer<typeof WhaleAlert>;

export const RegimeChange = z.object({
  chain: ChainId,
  pair: z.string(),
  from: Regime,
  to: Regime,
});
export type RegimeChange = z.infer<typeof RegimeChange>;

export const MarketEvent = z.object({
  id: z.string(),                       // uuid — consumer idempotency key
  type: MarketEventType,
  ts: z.number(),
  source: z.string(),                   // sourceRegistry id that produced it
  payload: z.record(z.unknown()),
});
export type MarketEvent = z.infer<typeof MarketEvent>;

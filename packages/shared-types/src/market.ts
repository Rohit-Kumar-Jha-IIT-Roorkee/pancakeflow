import { z } from "zod";

/** The frozen spine: every shape that crosses a service boundary lives here.
 *  Python agents mirror these with Pydantic (agents/common/schemas.py). */

export const ChainId = z.enum(["bsc", "bsc-testnet", "ethereum", "arbitrum"]);
export type ChainId = z.infer<typeof ChainId>;

export const PoolType = z.union([z.literal(2), z.literal(3)]); // V2 | V3
export type PoolType = z.infer<typeof PoolType>;

export const Regime = z.enum(["trending_up", "trending_down", "mean_reverting", "high_vol", "unknown"]);
export type Regime = z.infer<typeof Regime>;

/** Redis hash mkt:pool:{chain}:{addr} — bigints serialized as decimal strings. */
export const PoolState = z.object({
  chain: ChainId,
  address: z.string(),
  poolType: PoolType,
  token0: z.string(),
  token1: z.string(),
  feeBps: z.number(),            // V2: 25 (0.25%); V3: fee tier in bps
  reserve0: z.string(),          // V2 only ("0" for V3)
  reserve1: z.string(),
  sqrtPriceX96: z.string(),      // V3 only ("0" for V2)
  liquidity: z.string(),         // V3 in-range liquidity
  tick: z.number().nullable(),
  midPrice: z.number(),          // token1 per token0, decimal-adjusted
  blockNumber: z.number(),
  updatedAt: z.number(),         // unix ms
});
export type PoolState = z.infer<typeof PoolState>;

/** Redis hash mkt:pair:{chain}:{symbol0}:{symbol1} */
export const PairState = z.object({
  chain: ChainId,
  pair: z.string(),              // "WBNB/USDT"
  midPrice: z.number(),
  ewmaVol: z.number(),           // annualized, from tick-level returns
  volumeZ: z.number(),           // 1h volume z-score vs trailing 24h
  regime: Regime,
  updatedAt: z.number(),
});
export type PairState = z.infer<typeof PairState>;

export const GasState = z.object({
  chain: ChainId,
  gasPriceWei: z.string(),
  baseFeeWei: z.string().nullable(),
  updatedAt: z.number(),
});
export type GasState = z.infer<typeof GasState>;

export const PoolCatalogEntry = z.object({
  chain: ChainId,
  address: z.string(),
  poolType: PoolType,
  token0: z.string(),
  token1: z.string(),
  symbol0: z.string(),
  symbol1: z.string(),
  feeBps: z.number(),
  tvlUsd: z.number().nullable(),
  tier: z.enum(["blue-chip", "mid-cap", "degen", "unrated"]), // refined by Agent A6 in P5
});
export type PoolCatalogEntry = z.infer<typeof PoolCatalogEntry>;

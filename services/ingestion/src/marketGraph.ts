import type { PoolState, PairState, Regime } from "@pancakeflow/shared-types";
import { bySymbol } from "@pancakeflow/chain-config";
import { redis, KEYS } from "./redis.js";

/** The Market State Graph: nodes = tokens, edges = pools.
 *  Stored as flat Redis hashes (fast, language-neutral for the Python agents).
 *  Single-writer (this service) → no lock contention; agents are readers. */

const Q96 = 2 ** 96;

export function v2Mid(reserve0: bigint, reserve1: bigint, dec0: number, dec1: number): number {
  if (reserve0 === 0n) return 0;
  return (Number(reserve1) / 10 ** dec1) / (Number(reserve0) / 10 ** dec0);
}

export function v3Mid(sqrtPriceX96: bigint, dec0: number, dec1: number): number {
  const p = (Number(sqrtPriceX96) / Q96) ** 2;       // token1 per token0, raw units
  return p * 10 ** (dec0 - dec1);
}

export async function writePool(p: PoolState): Promise<void> {
  await redis.hset(KEYS.pool(p.chain, p.address), {
    ...p,
    tick: p.tick === null ? "" : String(p.tick),
    poolType: String(p.poolType),
    midPrice: String(p.midPrice),
    blockNumber: String(p.blockNumber),
    updatedAt: String(p.updatedAt),
    feeBps: String(p.feeBps),
  });
}

export async function writePair(
  chain: PairState["chain"], s0: string, s1: string,
  fields: { midPrice: number; ewmaVol: number; regime: Regime },
): Promise<void> {
  await redis.hset(KEYS.pair(chain, s0, s1), {
    chain, pair: `${s0}/${s1}`,
    midPrice: String(fields.midPrice),
    ewmaVol: String(fields.ewmaVol),
    volumeZ: "0",                       // wired in P5 when 1h aggregates exist
    regime: fields.regime,
    updatedAt: String(Date.now()),
  });
}

export function pairKey(s0: string, s1: string): string { return `${s0}/${s1}`; }
export const tokenDecimals = (symbol: string): number => bySymbol(symbol).decimals;

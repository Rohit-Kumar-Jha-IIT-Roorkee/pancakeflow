import { byAddress } from "@pancakeflow/chain-config";
import { redis, KEYS } from "../redis.js";

/** USD-size a swap using simple anchors: stables = $1, WBNB = oracle BNB/USD,
 *  others priced via their WBNB pair mid if we track one. Extensible by design. */
export async function estimateUsd(tokenAddr: string, rawAmount: bigint): Promise<number | null> {
  const t = byAddress(tokenAddr);
  if (!t) return null;
  const amount = Number(rawAmount) / 10 ** t.decimals;
  if (t.stable) return amount;

  if (t.symbol === "WBNB") {
    const px = await oracleBnbUsd();
    return px ? amount * px : null;
  }
  // generic: TOKEN/WBNB pair mid * BNB/USD
  const pairRaw = await redis.hget(KEYS.pair("bsc", t.symbol, "WBNB"), "midPrice");
  const bnb = await oracleBnbUsd();
  if (pairRaw && bnb) return amount * parseFloat(pairRaw) * bnb;
  return null;
}

async function oracleBnbUsd(): Promise<number | null> {
  const v = await redis.hget(KEYS.oracle("bsc", "BNB/USD"), "price");
  return v ? parseFloat(v) : null;
}

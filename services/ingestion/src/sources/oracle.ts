import type { PublicClient } from "viem";
import { chainlinkAggregatorAbi, CHAINLINK_BNB_USD } from "@pancakeflow/chain-config";
import { redis, KEYS } from "../redis.js";
import { publish } from "../publisher.js";
import { sources } from "../sourceRegistry.js";
import { CHAIN } from "../config.js";

/** Chainlink anchor price. Risk Agent compares pool mids against this:
 *  divergence > threshold ⇒ market.oracle_divergence ⇒ defensive posture. */
let cachedDecimals: number | null = null;
const DIVERGENCE_BPS = 300; // 3%

export async function pollOracle(client: PublicClient): Promise<void> {
  const t0 = performance.now();
  try {
    cachedDecimals ??= await client.readContract({
      address: CHAINLINK_BNB_USD, abi: chainlinkAggregatorAbi, functionName: "decimals",
    });
    const [, answer, , updatedAt] = await client.readContract({
      address: CHAINLINK_BNB_USD, abi: chainlinkAggregatorAbi, functionName: "latestRoundData",
    });
    sources.record("oracle:chainlink:bnbusd", performance.now() - t0, true);
    const price = Number(answer) / 10 ** cachedDecimals;
    const staleSec = Math.floor(Date.now() / 1000) - Number(updatedAt);
    await redis.hset(KEYS.oracle(CHAIN, "BNB/USD"),
      { price: String(price), staleSec: String(staleSec), updatedAt: String(Date.now()) });

    // divergence check vs our own WBNB/USDT pool mid
    const poolMid = await redis.hget(KEYS.pair(CHAIN, "WBNB", "USDT"), "midPrice");
    if (poolMid) {
      const divBps = Math.abs(parseFloat(poolMid) - price) / price * 10_000;
      if (divBps > DIVERGENCE_BPS) {
        await publish("market.oracle_divergence", "oracle:chainlink:bnbusd",
          { pair: "WBNB/USDT", poolMid: parseFloat(poolMid), oracle: price, divBps: Math.round(divBps) });
      }
    }
  } catch {
    sources.record("oracle:chainlink:bnbusd", performance.now() - t0, false);
  }
}

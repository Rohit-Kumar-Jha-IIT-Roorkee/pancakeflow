import type { PublicClient } from "viem";
import { redis, KEYS } from "../redis.js";
import { publish } from "../publisher.js";
import { sources } from "../sourceRegistry.js";
import { CHAIN } from "../config.js";

export async function pollGas(client: PublicClient): Promise<void> {
  const t0 = performance.now();
  try {
    const gasPrice = await client.getGasPrice();
    let baseFee: bigint | null = null;
    try {
      const block = await client.getBlock();
      baseFee = block.baseFeePerGas ?? null;
    } catch { /* BSC pre-EIP1559 nodes */ }
    sources.record("rpc:bsc:gas", performance.now() - t0, true);
    await redis.hset(KEYS.gas(CHAIN), {
      chain: CHAIN, gasPriceWei: gasPrice.toString(),
      baseFeeWei: baseFee?.toString() ?? "", updatedAt: String(Date.now()),
    });
    await publish("market.gas", "rpc:bsc:gas", { chain: CHAIN, gasPriceWei: gasPrice.toString() });
  } catch {
    sources.record("rpc:bsc:gas", performance.now() - t0, false);
  }
}

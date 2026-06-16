import { parseAbiItem, type PublicClient } from "viem";
import { type SeedPool, bySymbol } from "@pancakeflow/chain-config";
import { cfg, CHAIN } from "../config.js";
import { publish } from "../publisher.js";
import { v2Mid, v3Mid, writePair, pairKey } from "../marketGraph.js";
import { updateVol } from "../analytics/volatility.js";
import { pushPrice, classify } from "../analytics/regime.js";
import { estimateUsd } from "../analytics/whaleDetector.js";
import { logger } from "../logger.js";

const syncEvent = parseAbiItem("event Sync(uint112 reserve0, uint112 reserve1)");
const swapV2Event = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)");
const swapV3Event = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)");

/** Block-fresh updates: Sync gives V2 reserves the instant they change; V3 Swap
 *  carries the post-trade sqrtPrice. This is what makes signals < 1 block stale
 *  instead of subgraph-stale (10–60s). */
export function subscribePoolEvents(ws: PublicClient, pools: SeedPool[]): Array<() => void> {
  const v2 = pools.filter((p) => p.poolType === 2);
  const v3 = pools.filter((p) => p.poolType === 3);
  const byAddr = new Map(pools.map((p) => [p.address.toLowerCase(), p]));
  const unsubs: Array<() => void> = [];

  if (v2.length) {
    unsubs.push(ws.watchEvent({
      address: v2.map((p) => p.address), event: syncEvent,
      onLogs: async (logs) => {
        for (const log of logs) {
          const p = byAddr.get(log.address.toLowerCase());
          if (!p || log.args.reserve0 === undefined || log.args.reserve1 === undefined) continue;
          const d0 = bySymbol(p.symbol0).decimals, d1 = bySymbol(p.symbol1).decimals;
          const mid = v2Mid(log.args.reserve0, log.args.reserve1, d0, d1);
          await onPriceTick(p, mid, Number(log.blockNumber ?? 0n));
        }
      },
      onError: (e) => logger.warn({ e: String(e) }, "ws Sync subscription error"),
    }));

    unsubs.push(ws.watchEvent({
      address: v2.map((p) => p.address), event: swapV2Event,
      onLogs: async (logs) => {
        for (const log of logs) {
          const p = byAddr.get(log.address.toLowerCase());
          if (!p) continue;
          const { amount0In = 0n, amount1In = 0n } = log.args;
          const t0 = bySymbol(p.symbol0), t1 = bySymbol(p.symbol1);
          const [tokenIn, amtIn] = amount0In > 0n ? [t0.address, amount0In] : [t1.address, amount1In];
          await maybeWhaleAlert(p, tokenIn, amtIn, log.transactionHash ?? "", Number(log.blockNumber ?? 0n));
        }
      },
      onError: (e) => logger.warn({ e: String(e) }, "ws SwapV2 subscription error"),
    }));
  }

  if (v3.length) {
    unsubs.push(ws.watchEvent({
      address: v3.map((p) => p.address), event: swapV3Event,
      onLogs: async (logs) => {
        for (const log of logs) {
          const p = byAddr.get(log.address.toLowerCase());
          if (!p || log.args.sqrtPriceX96 === undefined) continue;
          const d0 = bySymbol(p.symbol0).decimals, d1 = bySymbol(p.symbol1).decimals;
          const mid = v3Mid(log.args.sqrtPriceX96, d0, d1);
          await onPriceTick(p, mid, Number(log.blockNumber ?? 0n));
          const { amount0 = 0n, amount1 = 0n } = log.args;
          const t0 = bySymbol(p.symbol0), t1 = bySymbol(p.symbol1);
          const [tokenIn, amtIn] = amount0 > 0n ? [t0.address, amount0] : [t1.address, amount1];
          await maybeWhaleAlert(p, tokenIn, amtIn < 0n ? -amtIn : amtIn, log.transactionHash ?? "", Number(log.blockNumber ?? 0n));
        }
      },
      onError: (e) => logger.warn({ e: String(e) }, "ws SwapV3 subscription error"),
    }));
  }
  return unsubs;
}

async function onPriceTick(p: SeedPool, mid: number, blockNumber: number): Promise<void> {
  if (!Number.isFinite(mid) || mid <= 0) return;
  const key = pairKey(p.symbol0, p.symbol1);
  const vol = updateVol(key, mid);
  pushPrice(key, mid);
  const { regime, changed, prev } = classify(key, vol);
  await writePair(CHAIN, p.symbol0, p.symbol1, { midPrice: mid, ewmaVol: vol, regime });
  await publish("market.tick", "rpc:bsc:ws", { pool: p.address, pair: key, mid, vol, regime, blockNumber });
  if (changed && prev !== "unknown") {
    await publish("market.regime_change", "rpc:bsc:ws", { chain: CHAIN, pair: key, from: prev, to: regime });
  }
}

async function maybeWhaleAlert(p: SeedPool, tokenIn: string, amtIn: bigint, txHash: string, blockNumber: number): Promise<void> {
  const usd = await estimateUsd(tokenIn, amtIn);
  if (usd !== null && usd >= cfg.WHALE_USD_THRESHOLD) {
    await publish("market.whale_alert", "rpc:bsc:ws",
      { chain: CHAIN, pool: p.address, txHash, usdValue: Math.round(usd), tokenIn, blockNumber });
  }
}

import { createPublicClient, fallback, http, webSocket, type Abi, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { pairV2Abi, poolV3Abi, type SeedPool, bySymbol } from "@pancakeflow/chain-config";
import type { PoolState } from "@pancakeflow/shared-types";
import { cfg, CHAIN } from "../config.js";
import { sources } from "../sourceRegistry.js";
import { v2Mid, v3Mid, writePool } from "../marketGraph.js";
import { logger } from "../logger.js";

/** HTTP client with scored fallback. onFetchResponse hooks feed the source registry,
 *  so transport ordering reflects *measured* latency/reliability over time. */
function instrumentedHttp(url: string, id: string) {
  return http(url, {
    onFetchRequest: () => { timers.set(id, performance.now()); },
    onFetchResponse: (res) => {
      const t0 = timers.get(id);
      sources.record(id, t0 ? performance.now() - t0 : 500, res.ok);
    },
  });
}
const timers = new Map<string, number>();

export function makeHttpClient(): PublicClient {
  const urls: Array<[string, string]> = [["rpc:bsc:1", cfg.BSC_RPC_HTTP_1]];
  if (cfg.BSC_RPC_HTTP_2) urls.push(["rpc:bsc:2", cfg.BSC_RPC_HTTP_2]);
  const ranked = sources.rank(urls.map(([id]) => id));
  const ordered = ranked
    .map((id) => urls.find(([uid]) => uid === id)!)
    .map(([id, url]) => instrumentedHttp(url, id));
  return createPublicClient({ chain: bsc, transport: fallback(ordered, { rank: false }) });
}

export function makeWsClient(): PublicClient | null {
  if (!cfg.BSC_RPC_WS) return null;
  return createPublicClient({ chain: bsc, transport: webSocket(cfg.BSC_RPC_WS, { reconnect: true }) });
}

/** Multicall refresh of all tracked pools — one round trip per block.
 *  This is the freshness backstop; WS events update in between. */
export async function refreshPools(client: PublicClient, pools: SeedPool[], blockNumber: bigint): Promise<void> {
  type Call = { address: `0x${string}`; abi: Abi; functionName: string };
  const contracts: Call[] = pools.flatMap((p): Call[] =>
    p.poolType === 2
      ? [{ address: p.address, abi: pairV2Abi as Abi, functionName: "getReserves" }]
      : [
          { address: p.address, abi: poolV3Abi as Abi, functionName: "slot0" },
          { address: p.address, abi: poolV3Abi as Abi, functionName: "liquidity" },
        ],
  );

  const t0 = performance.now();
  const results = await client.multicall({ contracts, allowFailure: true });
  sources.record("rpc:bsc:multicall", performance.now() - t0, true);

  let i = 0;
  const now = Date.now();
  for (const p of pools) {
    const t0i = bySymbol(p.symbol0), t1i = bySymbol(p.symbol1);
    const base: Omit<PoolState, "reserve0" | "reserve1" | "sqrtPriceX96" | "liquidity" | "tick" | "midPrice"> = {
      chain: CHAIN, address: p.address.toLowerCase(), poolType: p.poolType,
      token0: t0i.address, token1: t1i.address, feeBps: p.feeBps,
      blockNumber: Number(blockNumber), updatedAt: now,
    };
    try {
      if (p.poolType === 2) {
        const r = results[i++]!;
        if (r.status !== "success") continue;
        const [r0, r1] = r.result as readonly [bigint, bigint, number];
        await writePool({ ...base, reserve0: r0.toString(), reserve1: r1.toString(),
          sqrtPriceX96: "0", liquidity: "0", tick: null,
          midPrice: v2Mid(r0, r1, t0i.decimals, t1i.decimals) });
      } else {
        const slot = results[i++]!, liq = results[i++]!;
        if (slot.status !== "success") continue;
        const s = slot.result as readonly [bigint, number, number, number, number, number, boolean];
        await writePool({ ...base, reserve0: "0", reserve1: "0",
          sqrtPriceX96: s[0].toString(),
          liquidity: liq.status === "success" ? String(liq.result as bigint) : "0",
          tick: s[1],
          midPrice: v3Mid(s[0], t0i.decimals, t1i.decimals) });
      }
    } catch (err) {
      logger.warn({ pool: p.address, err: String(err) }, "pool refresh failed");
    }
  }
}

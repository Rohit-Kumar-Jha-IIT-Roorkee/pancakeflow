import type { PoolCatalogEntry } from "@pancakeflow/shared-types";
import { BSC_SEED_POOLS, bySymbol } from "@pancakeflow/chain-config";
import { redis, KEYS } from "../redis.js";
import { publish } from "../publisher.js";
import { sources } from "../sourceRegistry.js";
import { cfg, CHAIN } from "../config.js";
import { logger } from "../logger.js";

/** Pool catalog (slow path). Subgraph when configured; static seed otherwise.
 *  A naive TVL-based tier is assigned here; Agent A6 (P5) overwrites with the
 *  full token-safety + age + fee-APR model. */
const QUERY = `{
  pairs(first: 100, orderBy: reserveUSD, orderDirection: desc) {
    id reserveUSD
    token0 { id symbol decimals } token1 { id symbol decimals }
  }
}`;

export async function refreshCatalog(): Promise<void> {
  let entries: PoolCatalogEntry[];
  if (cfg.SUBGRAPH_URL_V2) {
    entries = (await fromSubgraph()) ?? fromSeed();
  } else {
    entries = fromSeed();
  }
  const pipe = redis.pipeline();
  for (const e of entries) pipe.hset(KEYS.catalog(CHAIN), e.address.toLowerCase(), JSON.stringify(e));
  await pipe.exec();
  await publish("pool.catalog_updated", cfg.SUBGRAPH_URL_V2 ? "subgraph:v2" : "static:seed", { count: entries.length });
}

function tierFromTvl(tvlUsd: number | null): PoolCatalogEntry["tier"] {
  if (tvlUsd === null) return "unrated";
  if (tvlUsd > 5_000_000) return "blue-chip";
  if (tvlUsd > 250_000) return "mid-cap";
  return "degen";
}

function fromSeed(): PoolCatalogEntry[] {
  return BSC_SEED_POOLS.map((p) => ({
    chain: CHAIN, address: p.address.toLowerCase(), poolType: p.poolType,
    token0: bySymbol(p.symbol0).address, token1: bySymbol(p.symbol1).address,
    symbol0: p.symbol0, symbol1: p.symbol1, feeBps: p.feeBps,
    tvlUsd: null, tier: "blue-chip",          // seed list is hand-picked majors
  }));
}

async function fromSubgraph(): Promise<PoolCatalogEntry[] | null> {
  const t0 = performance.now();
  try {
    const res = await fetch(cfg.SUBGRAPH_URL_V2!, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`subgraph http ${res.status}`);
    const json = (await res.json()) as {
      data?: { pairs: Array<{ id: string; reserveUSD: string;
        token0: { id: string; symbol: string }; token1: { id: string; symbol: string } }> };
    };
    sources.record("subgraph:v2", performance.now() - t0, true);
    if (!json.data) return null;
    return json.data.pairs.map((p) => ({
      chain: CHAIN, address: p.id.toLowerCase(), poolType: 2 as const,
      token0: p.token0.id, token1: p.token1.id,
      symbol0: p.token0.symbol, symbol1: p.token1.symbol, feeBps: 25,
      tvlUsd: parseFloat(p.reserveUSD), tier: tierFromTvl(parseFloat(p.reserveUSD)),
    }));
  } catch (err) {
    sources.record("subgraph:v2", performance.now() - t0, false);
    logger.warn({ err: String(err) }, "subgraph catalog failed; using seed");
    return null;
  }
}

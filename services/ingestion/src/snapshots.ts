import pg from "pg";
import { BSC_SEED_POOLS } from "@pancakeflow/chain-config";
import { redis, KEYS } from "./redis.js";
import { cfg, CHAIN } from "./config.js";
import { logger } from "./logger.js";

/** Periodic dump of the hot graph into Timescale — the backtester's raw feed.
 *  DB is optional in P1: service degrades gracefully to Redis-only. */
let pool: pg.Pool | null = null;

export function initDb(): void {
  if (!cfg.DATABASE_URL) { logger.warn("DATABASE_URL unset — snapshots disabled"); return; }
  pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 3 });
}

export async function snapshotPools(): Promise<void> {
  if (!pool) return;
  const rows: unknown[][] = [];
  for (const p of BSC_SEED_POOLS) {
    const h = await redis.hgetall(KEYS.pool(CHAIN, p.address));
    if (!h.updatedAt) continue;
    rows.push([new Date(), CHAIN, p.address.toLowerCase(), Number(h.poolType ?? p.poolType),
      h.reserve0 ?? "0", h.reserve1 ?? "0", h.sqrtPriceX96 ?? "0",
      parseFloat(h.midPrice ?? "0"), Number(h.blockNumber ?? 0)]);
  }
  if (!rows.length) return;
  const values = rows.map((_, i) =>
    `($${i * 9 + 1},$${i * 9 + 2},$${i * 9 + 3},$${i * 9 + 4},$${i * 9 + 5},$${i * 9 + 6},$${i * 9 + 7},$${i * 9 + 8},$${i * 9 + 9})`).join(",");
  await pool.query(
    `INSERT INTO pool_snapshots (time, chain, pool, pool_type, reserve0, reserve1, sqrt_price_x96, mid_price, block_number) VALUES ${values}`,
    rows.flat(),
  );
}

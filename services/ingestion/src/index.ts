import { BSC_SEED_POOLS } from "@pancakeflow/chain-config";
import { cfg } from "./config.js";
import { redis } from "./redis.js";
import { logger } from "./logger.js";
import { sources } from "./sourceRegistry.js";
import { makeHttpClient, makeWsClient, refreshPools } from "./sources/rpc.js";
import { subscribePoolEvents } from "./sources/rpcWs.js";
import { pollGas } from "./sources/gas.js";
import { pollOracle } from "./sources/oracle.js";
import { pollCex } from "./sources/cexRef.js";
import { refreshCatalog } from "./sources/subgraph.js";
import { initDb, snapshotPools } from "./snapshots.js";

/** Agent A1 (Market Intelligence) — the body. Boot order:
 *  1. infra connections  2. catalog  3. per-block refresh loop
 *  4. WS event subscriptions  5. slow pollers  6. snapshots
 *  Every loop is independent: one source dying degrades, never kills. */
async function main(): Promise<void> {
  await redis.connect();
  initDb();
  logger.info({ pools: BSC_SEED_POOLS.length }, "ingestion starting (BNB mainnet, read-only)");

  const httpClient = makeHttpClient();
  await refreshCatalog();

  // Per-block multicall refresh — freshness backstop for all tracked pools.
  const unwatchBlocks = httpClient.watchBlockNumber({
    emitOnBegin: true,
    onBlockNumber: async (bn) => {
      try { await refreshPools(httpClient, BSC_SEED_POOLS, bn); }
      catch (err) { logger.warn({ err: String(err) }, "block refresh failed"); }
    },
    onError: (e) => logger.warn({ e: String(e) }, "block watcher error"),
  });

  // WS push path (sub-block freshness). Optional: degrade to polling if no WS url.
  const ws = makeWsClient();
  const unsubs = ws ? subscribePoolEvents(ws, BSC_SEED_POOLS) : [];
  if (!ws) logger.warn("BSC_RPC_WS unset — running in polling-only mode");

  const timers = [
    setInterval(() => void pollGas(httpClient), cfg.GAS_POLL_MS),
    setInterval(() => void pollOracle(httpClient), cfg.ORACLE_POLL_MS),
    setInterval(() => void pollCex(), cfg.CEX_POLL_MS),
    setInterval(() => void refreshCatalog(), cfg.CATALOG_POLL_MS),
    setInterval(() => void snapshotPools(), cfg.SNAPSHOT_INTERVAL_MS),
    setInterval(() => void sources.flushToRedis(), 10_000),
  ];

  const shutdown = (): void => {
    logger.info("shutting down");
    unwatchBlocks();
    unsubs.forEach((u) => u());
    timers.forEach(clearInterval);
    void redis.quit().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => { logger.error({ err: String(err) }, "fatal"); process.exit(1); });

import { Redis } from "ioredis";
import { cfg } from "./config.js";

export const redis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

export const KEYS = {
  pool: (chain: string, addr: string) => `mkt:pool:${chain}:${addr.toLowerCase()}`,
  pair: (chain: string, s0: string, s1: string) => `mkt:pair:${chain}:${s0}:${s1}`,
  gas: (chain: string) => `mkt:gas:${chain}`,
  oracle: (chain: string, pair: string) => `mkt:oracle:${chain}:${pair}`,
  cex: (symbol: string) => `mkt:cex:${symbol}`,
  catalog: (chain: string) => `mkt:pools:catalog:${chain}`,   // hash addr -> PoolCatalogEntry json
  sources: `mkt:sources:health`,                              // hash sourceId -> score json
  stream: `events:market`,
} as const;

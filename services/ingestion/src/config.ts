import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  BSC_RPC_HTTP_1: z.string().url().default("https://bsc-dataseed1.binance.org"),
  BSC_RPC_HTTP_2: z.string().url().optional(),
  BSC_RPC_WS: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().optional(),
  SUBGRAPH_URL_V2: z.string().optional(),
  BINANCE_API: z.string().default("https://api.binance.com"),
  WHALE_USD_THRESHOLD: z.coerce.number().default(50_000),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().default(15_000),
  GAS_POLL_MS: z.coerce.number().default(5_000),
  ORACLE_POLL_MS: z.coerce.number().default(5_000),
  CEX_POLL_MS: z.coerce.number().default(5_000),
  CATALOG_POLL_MS: z.coerce.number().default(60_000),
});

export const cfg = Env.parse(process.env);
export const CHAIN = "bsc" as const; // P1 scope: BNB mainnet read-only signals

import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  EXEC_MODE: z.enum(["paper", "testnet", "live"]).default("testnet"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BSC_TESTNET_RPC: z.string().default("https://data-seed-prebsc-1-s1.binance.org:8545"),
  BSC_RPC_HTTP_1: z.string().default("https://bsc-dataseed1.binance.org"),
  // MEV-protected private RPC (48 Club / bloXroute / Pancake MEV Guard). Falls back to public.
  PRIVATE_RPC: z.string().optional(),
  EXECUTOR_PK: z.string().optional(),          // signer key — ONLY lives here
  ARB_EXECUTOR_ADDR: z.string().optional(),    // deployed ArbExecutor (from P2 deploy)
  MAX_RETRIES: z.coerce.number().default(2),
});
export const cfg = Env.parse(process.env);

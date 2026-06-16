import { BSC_TOKENS } from "./tokens.js";

/** Static seed catalog: highest-liquidity PancakeSwap pools on BNB mainnet.
 *  This is the fallback when no subgraph API key is configured; the subgraph
 *  poller (sources/subgraph.ts) extends this list at runtime.
 *  Addresses are the canonical Pancake V2 pairs / V3 pools — verify on bscscan. */
export interface SeedPool {
  address: `0x${string}`; poolType: 2 | 3; symbol0: string; symbol1: string; feeBps: number;
}

export const BSC_SEED_POOLS: SeedPool[] = [
  // ---- V2 (fee 0.25% = 25 bps) ----
  { address: "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE", poolType: 2, symbol0: "WBNB", symbol1: "USDT", feeBps: 25 },
  { address: "0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16", poolType: 2, symbol0: "WBNB", symbol1: "BUSD", feeBps: 25 },
  { address: "0x0eD7e52944161450477ee417DE9Cd3a859b14fD0", poolType: 2, symbol0: "CAKE", symbol1: "WBNB", feeBps: 25 },
  { address: "0x7EFaEf62fDdCCa950418312c6C91Aef321375A00", poolType: 2, symbol0: "USDT", symbol1: "BUSD", feeBps: 25 },
  { address: "0x74E4716E431f45807DCF19f284c7aA99F18a4fbc", poolType: 2, symbol0: "ETH",  symbol1: "WBNB", feeBps: 25 },
  // ---- V3 ----
  { address: "0x36696169C63e42cd08ce11f5deeBbCeBae652050", poolType: 3, symbol0: "WBNB", symbol1: "USDT", feeBps: 5 },
  { address: "0x133B3D95bAD5405d14d53473671200e9342896BF", poolType: 3, symbol0: "CAKE", symbol1: "WBNB", feeBps: 25 },
];

export const seedTokenFor = (symbol: string) => BSC_TOKENS[symbol];

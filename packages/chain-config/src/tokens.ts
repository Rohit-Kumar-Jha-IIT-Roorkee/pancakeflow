/** Core BNB Chain token set (mainnet). Allowlist seed for the conservative risk tier.
 *  NOTE: verify addresses against bscscan before any live use — standard practice. */
export interface TokenInfo { address: `0x${string}`; symbol: string; decimals: number; stable?: boolean }

export const BSC_TOKENS: Record<string, TokenInfo> = {
  WBNB: { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", decimals: 18 },
  USDT: { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18, stable: true },
  BUSD: { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", symbol: "BUSD", decimals: 18, stable: true },
  USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18, stable: true },
  CAKE: { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", symbol: "CAKE", decimals: 18 },
  ETH:  { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", symbol: "ETH",  decimals: 18 },
  BTCB: { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB", decimals: 18 },
};

export const bySymbol = (s: string): TokenInfo => {
  const t = BSC_TOKENS[s];
  if (!t) throw new Error(`unknown token symbol ${s}`);
  return t;
};
export const byAddress = (a: string): TokenInfo | undefined =>
  Object.values(BSC_TOKENS).find((t) => t.address.toLowerCase() === a.toLowerCase());

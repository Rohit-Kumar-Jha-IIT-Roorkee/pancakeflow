/** Minimal ArbExecutor ABI — must match contracts/src/ArbExecutor.sol. */
export const arbExecutorAbi = [
  { type: "function", name: "executeCycle", stateMutability: "nonpayable",
    inputs: [
      { name: "legs", type: "tuple[]", components: [
        { name: "pool", type: "address" }, { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" }, { name: "poolType", type: "uint8" } ] },
      { name: "amountIn", type: "uint256" }, { name: "minProfit", type: "uint256" } ],
    outputs: [{ name: "profit", type: "uint256" }] },
  { type: "function", name: "flashArb", stateMutability: "nonpayable",
    inputs: [
      { name: "flashPool", type: "address" },
      { name: "legs", type: "tuple[]", components: [
        { name: "pool", type: "address" }, { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" }, { name: "poolType", type: "uint8" } ] },
      { name: "borrowAmount", type: "uint256" }, { name: "minProfit", type: "uint256" } ],
    outputs: [] },
  { type: "function", name: "pause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "event", name: "CycleExecuted", inputs: [
      { name: "startToken", type: "address", indexed: true },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "profit", type: "uint256", indexed: false },
      { name: "legs", type: "uint256", indexed: false } ] },
] as const;

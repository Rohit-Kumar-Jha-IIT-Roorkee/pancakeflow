# Limitations & Known Issues

While PancakeFlow implements rigorous risk controls and exact EVM simulation, there are several unhandled edge cases that make this unsuitable for raw mainnet deployment without modifications.

## 1. MEV & Sandwich Attack Risk
The current execution module broadcasts transactions to the public mempool. On a highly competitive chain like BSC or Ethereum, an unprotected arbitrage transaction *will* be seen by searchers and likely sandwiched or front-run.
**Fix**: Integrate a private RPC endpoint (like Flashbots, bloXroute, or MEV-Share) to bypass the public mempool.

## 2. Infrastructure Resilience (Single Point of Failure)
The entire system currently assumes a single Redis instance and single node deployments for the agents. If the orchestrator node crashes mid-trade, the trade state is left in limbo.
**Fix**: Deploy multiple consumers via Redis Consumer Groups and implement distributed locks and crash-recovery logic.

## 3. Slippage & Non-Atomic Hedging
The backtester and simulator assume the state at the block tip will exactly match the state at execution time. However, pool reserves can drift between simulation and inclusion.
**Fix**: The smart contracts must enforce strict slippage bounds (`amountOutMin`). Currently, the system relies on exact simulations but does not implement dynamic slippage calculation based on mempool volatility.

## 4. Gas Spikes
The agent sizes trades using a static or moving average gas price. During high congestion, the execution may fail due to underpriced gas, or profit may be entirely consumed by gas fees.
**Fix**: Dynamic EIP-1559 gas fee estimation specifically tailored for the next block.

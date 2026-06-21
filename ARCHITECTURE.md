# Architecture

PancakeFlow is an autonomous, multi-agent trading system built for PancakeSwap V2/V3. The system consists of three distinct layers:

## 1. The Body (TypeScript/Node.js)
Handles the high-frequency deterministic operations:
- **Ingestion (`@pancakeflow/ingestion`)**: Subscribes to blockchain RPCs, parses raw events, and pushes standard pool state updates to Redis (`mkt:pools:catalog:{chain}`).
- **Execution (`@pancakeflow/execution`)**: Monitors the `events:trade` Redis stream. When a `trade.approved` event arrives with a signed transaction or specific calldata, it routes the execution to the blockchain via `viem`.

## 2. The Brain (Python/FastAPI Swarm)
The intelligence layer uses an event-driven architecture powered by Redis streams.
- **`agents/strategy`**: Scans the real-time pool graph looking for negative-cycle arbitrage opportunities. Emits `trade.proposed`.
- **`agents/risk`**: The unskippable risk gate. Enforces daily drawdown limits, maximum exposure, and approves/rejects trades. Emits `trade.sized` or `trade.rejected`.
- **`agents/simulation`**: Runs a deterministic requote dry-run before submission; Anvil fork simulation is gated behind a flag and deferred for the paper demo.
- **`agents/orchestrator`**: The definitive state machine graph enforcing the topology. A trade MUST pass `proposed -> sized -> simulation -> approved -> execution`.

## 3. The Dashboard (Next.js/React)
Provides real-time observability into the agent swarm:
- **Timeline DAG**: React Flow visualization of agent decisions.
- **Trade Ledger**: Real-time ledger of executed paper and live trades.
- **Backtesting**: Historical simulation interface.

## Core Infrastructure
- **Redis**: The backbone. Acts as the event bus (Streams), state store (Hashes), and rate-limiter backend.
- **TimescaleDB / Postgres**: Long-term persistent storage for market tick data and trade history.
- **Anvil (Foundry)**: Bundled for optional local EVM fork dry-runs (gated behind a flag); the paper-demo path uses deterministic requote without Anvil.

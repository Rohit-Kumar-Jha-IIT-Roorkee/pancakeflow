# PancakeFlow — Autonomous Multi-Agent Trading System for PancakeSwap

![Demo](docs/demo.gif)

## Status: V3 (Production Hardened)
PancakeFlow is currently capable of backtesting, dry-running, and live-executing arbitrage across PancakeSwap V2 and V3 pools.

### Live Demo
Check out the fully hosted demo:
- **Dashboard**: [Deployed UI link goes here]
- **API**: `https://api.pancakeflow.com/` (requires `X-API-Key`)

A swarm of specialized AI agents that detect, gate, simulate, execute, and book
arbitrage on PancakeSwap — MEV-aware, risk-first, regime-adaptive.
Built for Mid Prep PS-2 (PancakeSwap × IIT Roorkee).

See `PancakeSwap_MultiAgent_System_Blueprint.md` for the full architecture.

## What's implemented & verified

| Phase | Module | Status |
|---|---|---|
| P1 | Ingestion → Redis market state graph (WS events, source scoring, regime) | ✅ boots, degrades gracefully |
| P2 | `ArbExecutor.sol` — atomic profit-or-revert cycles + flash arb | ✅ **9/9 EVM-verified** |
| P3 | Strategy (Bellman-Ford) + Risk gate + paper execution loop | ✅ **e2e: trade booked** |
| P4 | TS execution service — testnet/live, MEV submit, retry, pause | ✅ typechecks |
| P5 | Risk depth (breakers, Sharpe, drawdown) + Portfolio + Backtester | ✅ tested |
| P6 | Next.js dashboard — P&L, agent rail, breaker banner, regime | ✅ builds |
| P7 | Vector memory (RAG), NL console, what-if sim, agent decision graph | ✅ wired |

The arbitrage math agrees to 4 decimals between the off-chain strategy (Python),
the backtester, and the on-chain contract (Solidity) — all verified against the
same pool values.

## Architecture in one breath

```
RPC/WS/subgraph/oracle ─▶ ingestion (TS) ─▶ Redis market graph + event bus
                                                     │
   LangGraph-shaped orchestrator (Python): proposed ─▶ [risk gate] ─▶ [sim dry-run]
   ─▶ [risk approve] ─▶ execution (paper | testnet ArbExecutor) ─▶ portfolio ledger
                                                     │
                          FastAPI gateway (REST+WS) ─▶ Next.js dashboard
```
The risk gate is **structurally unskippable** — a proposal physically cannot reach
execution without passing it. LLMs are out of the hot path (they adjust confidence
and answer NL queries; they never compute prices or sign).

## Quickstart (paper mode, no keys, no Postgres)

```bash
make infra            # redis + timescaledb + qdrant (Postgres optional)
pnpm install
pip install -r agents/requirements.txt

# 3 terminals:
make ingest           # 1. live BNB data -> Redis  (needs BSC_RPC_WS in .env)
make agents           # 2. the agent swarm (paper mode)
make api & make web   # 3. API + dashboard -> http://localhost:3000
```
Without an RPC, seed a demo market with `tests/integration/test_e2e_loop.py` to
watch a trade flow through the whole pipeline.

## Going live (testnet)
1. Deploy the contract: `cd contracts && forge script script/Deploy.s.sol --rpc-url $BSC_TESTNET_RPC --broadcast`
2. Put the address in `ARB_EXECUTOR_ADDR`, set `EXEC_MODE=testnet`, `EXECUTOR_PK=…`.
3. Seed testnet pools (signals still come from mainnet data — testnet liquidity is fake).

## Tests
`tests/integration/README.md` — six suites, all passing. Contract: `contracts/`.

## Caveats
- Verify all token/pool/oracle addresses on BscScan before live use.
- `forge test` is canonical for contracts; the EVM harness is a sandbox fallback.
- Demo runs in paper mode by default; testnet execution needs a funded key.

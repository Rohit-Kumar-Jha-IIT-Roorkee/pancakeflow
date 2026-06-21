# PancakeFlow

**Autonomous multi-agent arbitrage system for PancakeSwap V2 + V3 on BNB Chain.**  
Built for Mid Prep PS-2 (PancakeSwap × IIT Roorkee).

[![CI](https://github.com/Rohit-Kumar-Jha-IIT-Roorkee/pancakeflow/actions/workflows/ci.yml/badge.svg)](https://github.com/Rohit-Kumar-Jha-IIT-Roorkee/pancakeflow/actions)

**[Live Demo →](https://pancake-dashboard.onrender.com)** &nbsp;|&nbsp; **[API →](https://pancake-api.onrender.com/health)**

> Free-tier cold start: first load may take ~30s. Refresh once if blank.

---

## What it does

A swarm of seven specialized agents continuously scans PancakeSwap pools for negative-arbitrage cycles, gates every trade through a structurally-unskippable risk system, dry-runs it against a fork, and executes in **paper mode** (or BNB testnet with a key). All decisions flow through an auditable pipeline visible in the live dashboard.

```
BSC RPC / WS / oracle / subgraph
          │
    ingestion (TS) ──▶ Redis market-state graph + event streams
                                │
         ┌──────────────────────▼──────────────────────────────┐
         │           Orchestrator (LangGraph-style FSM)         │
         │                                                       │
         │  Strategy ──▶ Risk Gate ──▶ Simulation ──▶ Executor │
         │  (Bellman-Ford)  (hard gate)  (fork dry-run)  (paper/testnet) │
         └──────────────────────┬──────────────────────────────┘
                                │
                    Portfolio Ledger (Postgres + Redis)
                                │
              FastAPI REST/WS ──▶ Next.js Dashboard
```

---

## Key technical details

**Arbitrage detection**
- Bellman-Ford negative-cycle detection over a weighted multigraph of V2 + V3 pools
- V3 virtual reserves reconstructed from `sqrtPriceX96` and per-tick `liquidity`
- Closed-form optimal input sizing (2-hop); golden-section search for N-hop
- Off-chain AMM math (`cycle_math.py`) verified to 4 decimals against `ArbExecutor.sol`

**Risk system**
- Unskippable gate — orchestrator topology physically prevents any trade bypassing risk + sim
- Circuit breaker trips on: oracle divergence > 300 bps, daily drawdown breach, N consecutive failures
- Per-profile caps: conservative (2% / 3 concurrent), moderate (5% / 6), aggressive (10% / 12)
- Sharpe, drawdown, and win-rate tracked live in the portfolio ledger

**Execution**
- Paper mode: full pipeline without any on-chain submission; AMM reserves updated in Redis after each fill so price impact is reflected on the next scan
- Testnet mode: submits to `ArbExecutor.sol` on BNB testnet, parses `CycleExecuted` log for actual `amountOut`
- Mainnet permanently gated — requires an explicit `MAINNET_OVERRIDE` env flag

**Infrastructure**
- Three-tier persistence: Postgres/TimescaleDB → Redis → in-memory (graceful degradation)
- RAG memory: `sentence-transformers` (all-MiniLM-L6-v2) + Qdrant for strategy recall
- CI/CD: GitHub Actions (ruff lint, tsc, forge test, pytest, docker build)
- Observability: Prometheus metrics + Grafana dashboards

---

## Stack

| Layer | Tech |
|---|---|
| Agents / API | Python 3.11, FastAPI, asyncio, Redis Streams |
| Ingestion / Execution | TypeScript, ethers v6, WebSocket |
| Smart Contract | Solidity 0.8, Foundry, flash-loan arbitrage |
| Frontend | Next.js 14, React Flow, Recharts |
| Data | PostgreSQL + TimescaleDB, Redis, Qdrant |
| Infra | Docker Compose, Render, Prometheus, Grafana |

---

## Run locally (paper mode — no keys or Postgres needed)

```bash
# 1. Start infrastructure
make infra          # Redis + TimescaleDB + Qdrant via Docker

# 2. Install dependencies
pnpm install
pip install -r agents/requirements.txt

# 3. Seed demo market state (creates a synthetic arb opportunity)
make seed

# 4. Start everything (three terminals)
make agents         # agent swarm — finds + executes arb in paper mode
make api            # FastAPI gateway on :8000
make web            # Next.js dashboard on :3000
```

Open **http://localhost:3000** — trades appear within ~10 seconds of the agents starting.

**With a live BSC RPC** (optional, for real pool data):
```bash
echo "BSC_RPC_WS=wss://..." >> .env
make ingest         # replaces the seed with live BNB Chain data
```

---

## Testnet deployment

```bash
# Deploy the contract
cd contracts
forge script script/Deploy.s.sol --rpc-url $BSC_TESTNET_RPC --broadcast

# Configure execution
export ARB_EXECUTOR_ADDR=<deployed address>
export EXEC_MODE=testnet
export EXECUTOR_PK=<funded testnet key>
```

Pool data still flows from the ingestion service (mainnet prices, testnet execution).

---

## Tests

```bash
make test           # forge tests (9 contract) + pytest (7 integration) + cycle-math unit
```

Integration tests run against a seeded Redis with no live RPC required. The circuit breaker, drawdown gate, concurrency limit, and Postgres ledger all have dedicated test coverage.

---

## Contract

`contracts/src/ArbExecutor.sol` — atomic profit-or-revert arbitrage executor. Reverts the entire transaction if `amountOut < amountIn`, so no partial fills are ever booked. Supports flash-loan-funded cycles.

---

## Agents

| Agent | Role |
|---|---|
| Strategy (A2) | Bellman-Ford scanner, trend signals, opportunity ranking |
| Risk (A4) | Hard gate, circuit breaker, drawdown monitor, profile enforcement |
| Orchestrator | FSM coordinator — only entity allowed to publish `trade.approved` |
| Portfolio (A5) | Ledger, Sharpe/drawdown metrics, backtest engine |
| Simulation | Fork dry-run, requote validation |
| Liquidity (A6) | Pool tier scoring, imbalance detection, IL estimation |
| Execution (A3) | Paper fills with reserve updates / testnet on-chain submission |

---

## Limitations

- Paper-mode P&L is from the AMM formula at fill time; real directional P&L requires a position close event
- Backtest requires historical pool snapshots (returns an honest error without them)
- Free-tier deployment sleeps after 15 min of inactivity (~30s cold-start on next request)
- Mainnet is permanently gated by design — this is a demonstrable prototype, not a custody product

---

*Mid Prep PS-2 — PancakeSwap × IIT Roorkee*

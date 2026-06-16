# PancakeFlow — Autonomous Multi-Agent Trading System for PancakeSwap
### Full System Blueprint: Architecture → Design → Implementation Roadmap
*Mid Prep PS-2 · PancakeSwap × IIT Roorkee · Technical GC 2026*

---

# STEP 1 — Requirement Analysis

## 1.1 Reading the Problem Statement Correctly

> ⚠️ Note: the PDF's "Introduction" paragraph (conference organizer) is boilerplate from a different PS. The **actual problem statement** is the AI-powered autonomous trading agent system for PancakeSwap. Everything below targets that.

**One-line restatement:** Build a swarm of specialized, coordinating AI agents that — given chains, capital, a strategy category, and a risk profile — autonomously discover, evaluate, execute, and manage trades on PancakeSwap while surviving MEV, gas costs, latency, and regime shifts.

## 1.2 Inputs (Given)

| Input | Values | Architectural implication |
|---|---|---|
| Supported chains | BNB Chain (primary), Ethereum, Arbitrum | Multi-chain RPC abstraction; chain-specific gas models |
| Initial capital | Simulated or testnet | Paper-trading engine + BNB testnet execution path must both exist |
| Strategy category | Arbitrage, trend-following, LP, MEV-aware | Pluggable strategy interface — strategies are modules, not the system |
| Risk tolerance | Conservative / Moderate / Aggressive | Risk profile = config object consumed by Risk + Strategy agents |

## 1.3 Core Objectives

1. **Autonomy** — full loop (sense → decide → act → learn) with no human in the loop, but with human-readable transparency.
2. **Specialized multi-agent architecture** — 6 mandatory agents + 1 highly recommended (Simulation), each with a single responsibility.
3. **Profit-seeking under constraints** — every decision nets out gas, slippage, and MEV risk.
4. **Risk-first design** — circuit breakers, drawdown limits, anomaly detection are not optional add-ons; they gate execution.
5. **Adaptivity** — regime detection drives strategy parameter changes (the PS explicitly penalizes hardcoded rules).
6. **Observability** — dashboard with P&L, trade history, agent decision visibility.

## 1.4 Constraints & Assumptions

**Constraints (from PS):**
- Real-time aggregation across fragmented sources (subgraphs, RPCs, oracles).
- Block-level latency sensitivity for arbitrage.
- Adversarial mempool (front-running, sandwiches) — must be MEV-aware.
- Gas must be a first-class input to every trade decision.
- Markets are non-stationary — regime detection required.
- IL modeling required if LP strategy is in scope.

**Assumptions we make (state these to judges):**
- Demo runs on **BNB Chain testnet** for live execution + **mainnet data, simulated fills** for realistic strategy signals (testnet liquidity is fake, so signals from testnet prices are meaningless — this is a key insight most teams miss).
- PancakeSwap V2 + V3 pools are in scope; Infinity/v4 optional.
- "AI agent" = LLM-orchestrated decision layer over deterministic quant primitives. LLMs reason about context and select/parameterize strategies; they never compute prices or sign transactions directly (hallucination containment).
- Capital is small enough that our own market impact is negligible except via slippage modeling.

## 1.5 Expected Deliverables

1. Working multi-agent system (7 agents) with real-time coordination.
2. On-chain data pipeline (subgraph + RPC + oracle ingestion).
3. At least one fully working strategy end-to-end (we choose **cross-pool/triangular arbitrage** as primary — it's objectively demonstrable: profit is atomic and provable). Trend-following as secondary for multi-strategy bonus.
4. Execution layer with MEV protection, gas estimation, retries, testnet support.
5. Risk framework: position limits, stop-loss, drawdown circuit breakers.
6. Dashboard: live P&L, trade log, strategy breakdown, agent decision graph (bonus).
7. Backtesting against historical PancakeSwap data.
8. Bonus targets: vector-DB agent memory, NL interface ("show me arbitrage on BNB now"), simulation what-ifs, agent collaboration visualization.

## 1.6 End-to-End Workflow (the lifecycle of one trade)

```
 (1) INGEST            (2) UNDERSTAND          (3) DECIDE
 Subgraphs/RPCs  ───▶  Market Intelligence ──▶ Strategy Agent
 WebSocket logs        builds Market State     scores opportunities
 Oracle prices         Graph + regime label    (profit, confidence, risk)
                                                      │ proposed trade
                                                      ▼
 (6) LEARN             (5) ACCOUNT             (4) GATE & EXECUTE
 Memory/vector DB ◀──  Portfolio Agent    ◀──  Risk Agent approves/sizes
 Backtest feedback     records fill, P&L,      → Simulation dry-run
 Regime→strategy       gas, updates metrics    → Execution Agent routes,
 performance model                               MEV-protects, submits tx
```

Continuous loops on top of the per-trade loop: Liquidity & Pool Analysis Agent continuously re-maps pools/risk tiers; Risk Agent continuously monitors exposure & anomalies (can fire circuit breaker at any time, preempting everything); Simulation Agent replays strategies nightly against history.

---

# STEP 2 — Architecture Design: The Hard Questions, Answered

### Q1. What goes on-chain vs off-chain?

| Concern | Placement | Why |
|---|---|---|
| Agent reasoning, signals, ML/LLM | **Off-chain** | Cost, latency, iteration speed. Chains can't run inference. |
| Market data aggregation | **Off-chain** | Must merge multiple chains/sources; sub-second cadence. |
| Swap execution | **On-chain** (via Router / our executor contract) | The only thing that *must* be on-chain. |
| Atomic multi-hop arbitrage | **On-chain custom contract** | Atomicity is the only real defense against leg risk: either the whole cycle profits or it reverts. |
| Risk limits | **Both** | Soft limits off-chain (fast, rich); hard caps on-chain in the executor (max spend per tx, profit-or-revert) as a tamper-proof backstop. |
| P&L, analytics, dashboards | Off-chain | Read-heavy, no trust requirement. |
| Funds custody | On-chain wallet / optional Vault contract | Keys held by execution service in KMS/env; vault adds withdraw-only-to-owner safety. |

**Design principle: minimal on-chain surface.** Judges reward working systems; every extra contract is audit surface and demo risk.

### Q2. Which smart contracts are actually required?

Strictly, **zero** — PancakeSwap's deployed Router/SmartRouter can execute swaps from an EOA. But one custom contract, `ArbExecutor`, is *practically mandatory* for the arbitrage strategy because it gives (a) atomic multi-leg cycles with `minProfit`-or-revert, (b) flash-swap capability (capital efficiency: borrow leg 1 from the pool itself), (c) an on-chain circuit-breaker backstop. Everything else is optional (Step 3).

### Q3. Is a backend necessary? Yes — three reasons:

1. **Stateful, latency-sensitive loops.** Mempool/event listeners and the market state graph must run hot, 24/7, with sub-second reaction. That's a daemon, not a request handler.
2. **Coordination substrate.** Agents need a shared bus + shared state; that's backend infrastructure.
3. **Key security.** The signing key lives in one hardened execution service, never in the browser or an LLM context.

### Q4. Can anything be serverless?

Yes, selectively: backtest jobs, nightly pool re-scans, report generation, the NL-query endpoint — all stateless and bursty → fine as serverless functions/jobs. The hot path (ingestion → strategy → execution) must **not** be serverless: cold starts of 100ms–2s are fatal when arbitrage windows are 1–3 blocks (~3–9s on BNB).

### Q5. How do agents communicate and coordinate?

**Hybrid: shared state + event bus + orchestrator.**

- **Shared Market State Graph** (Redis): the single source of truth Market Intelligence maintains; all agents read it. Pull model for state.
- **Event bus** (Redis Streams / NATS): push model for things that demand reaction — `opportunity.detected`, `trade.proposed`, `trade.approved`, `trade.executed`, `risk.circuit_breaker`. Streams give us replay + consumer groups (audit trail = agent decision graph for the bonus).
- **Orchestrator (LangGraph)**: deterministic state machine for the trade lifecycle (proposal → risk gate → simulation → execution → accounting). LLM agents are *nodes* in the graph; the graph topology is code, not LLM whim. This is the correct safety posture: an LLM can refuse a trade but can never skip the risk gate.

### Q6. Datastores

| Store | Tech | Role |
|---|---|---|
| Hot state | **Redis** | Market state graph, pool reserves cache, gas price, open positions, pub/sub + streams |
| Time series | **TimescaleDB** (Postgres extension) | Candles, pool snapshots, trades, P&L — hypertables + continuous aggregates; SQL for analytics; one DB engine for both relational and TS data (ops simplicity for a hackathon) |
| Relational | Same Postgres | Trades, positions, strategy configs, agent decision log |
| Vector memory | **Qdrant** (or pgvector to cut a service) | Embedded "trade memos": context, decision, rationale, outcome → RAG for the Strategy agent's memory (bonus) |
| Object store | Local FS / S3 | Backtest artifacts, model checkpoints |

### Q7. External data sources & APIs

- **RPCs**: BNB Chain (primary + fallback: public, Ankr, QuickNode), BNB testnet, Ethereum, Arbitrum. WebSocket subscriptions for `Sync`/`Swap` events — this beats polling subgraphs by 10–60s.
- **PancakeSwap subgraphs** (The Graph): V2/V3 pool discovery, historical volume/fees, TVL — for the slow path (pool mapping, backtests), never for live pricing.
- **Price oracles**: Chainlink feeds on BNB (sanity anchor: detect depegs/oracle divergence), Binance public API for CEX reference price (stat-arb signal + anomaly detection).
- **Gas**: `eth_gasPrice` / `eth_feeHistory` per chain, tracked as time series.
- **MEV protection**: BNB Chain private tx RPCs (48 Club Privacy RPC / bloXroute "protected" endpoints / PancakeSwap's own MEV Guard RPC where available). On Ethereum: Flashbots Protect. Verify current endpoints at build time.
- Optional bonus: Twitter/Telegram sentiment via lightweight scraper agent.

### Q8. Security, scalability, fault tolerance

**Security:** private key only in Execution service (env/KMS), never in LLM prompts; on-chain `minProfit`/`maxSpend` guards; allow-listed token set per risk profile (no honeypot tokens — run static checks: ownership renounced? transfer tax?); rate-limit + spend caps per hour; all agent outputs validated by Pydantic/Zod schemas before acting.

**Scalability:** stateless agent workers scale horizontally off consumer groups; Redis/Timescale handle hackathon scale trivially; per-chain ingestion workers shard naturally.

**Fault tolerance:** RPC fallback rotation with health scoring (PS explicitly asks to prioritize sources by latency/freshness/reliability — implement as a scored source registry); idempotent event handlers (event IDs); transaction watcher with retry/replace-by-fee; circuit breaker defaults to **trading halted** if Risk Agent heartbeat is lost (fail-closed); paper-trading fallback if testnet is down during demo.

---

# STEP 3 — Smart Contract Design

## 3.1 Contract Inventory

| # | Contract | Status | Responsibility |
|---|---|---|---|
| C1 | `ArbExecutor` | **Mandatory** (for arbitrage strategy) | Atomic multi-hop swap cycles + flash-swap arbitrage with profit-or-revert |
| C2 | `TradingVault` | Optional (recommended) | Holds capital; only owner can withdraw; only whitelisted executor can trade |
| C3 | `RiskGuard` (library/module inside C1) | Mandatory (as logic, not separate deploy) | On-chain hard limits: maxNotionalPerTx, token allowlist, pause flag |
| C4 | `LPManager` | Optional (only if LP strategy attempted) | Mint/burn/rebalance V3 positions via NonfungiblePositionManager |
| — | PancakeSwap Router / SmartRouter / Quoter / Factory / Pairs | External (already deployed) | Swap execution, quoting, pool discovery |

## 3.2 C1 — ArbExecutor (the heart of on-chain logic)

**Responsibilities**
- `executeCycle(SwapLeg[] legs, uint256 amountIn, uint256 minProfit)` — performs an N-leg swap cycle (e.g., WBNB→BUSD→CAKE→WBNB) in one transaction; computes `balanceAfter - balanceBefore`; **reverts unless ≥ minProfit**. Reverted arb = only gas lost, never inventory loss.
- `flashArb(...)` — initiates a V2 `swap()` with non-empty calldata (flash swap) or V3 flash; repays within callback; keeps spread. Lets us demo arbitrage far larger than our capital.
- Owner-only: `pause()/unpause()`, `setAllowedToken()`, `setMaxNotional()`, `rescueTokens()`.
- Callbacks: `pancakeCall` (V2), `pancakeV3FlashCallback` — **must validate `msg.sender` is a real Factory-derived pool** (classic vuln otherwise).

**Interface sketch**
```solidity
struct SwapLeg { address pool; address tokenIn; address tokenOut; uint8 poolType; /* V2|V3 */ uint24 fee; }

interface IArbExecutor {
    function executeCycle(SwapLeg[] calldata legs, uint256 amountIn, uint256 minProfit)
        external returns (uint256 profit);
    function flashArb(address flashPool, uint256 borrowAmount, SwapLeg[] calldata legs, uint256 minProfit) external;
    function pause() external; function unpause() external;
}
```

**Interactions:** Execution Agent (off-chain) builds the leg array from the Strategy Agent's opportunity → calls `executeCycle` via private RPC → contract pulls/loops tokens through PancakeSwap Pair/Pool contracts → emits `CycleExecuted(profit, gasUsed)` → ingestion picks the event up → Portfolio Agent books it.

## 3.3 C2 — TradingVault (optional)

`deposit/withdraw` (owner), `approveExecutor(address)`, per-day spend limit. Interaction: ArbExecutor pulls funds from vault under allowance. Cut from scope if time-pressed — an EOA wallet with small testnet balance is acceptable for demo; say so explicitly in the README to show the tradeoff was deliberate.

## 3.4 C4 — LPManager (optional)

Wraps Pancake V3 `NonfungiblePositionManager`: open position in range [tickLower, tickUpper], collect fees, exit when Liquidity Agent signals range breach. Only build if LP strategy is your second strategy; IL math itself stays off-chain.

---

# STEP 4 — AI Multi-Agent System Design

**Framework decision:** LangGraph (Python) for orchestration. Each agent = a node with (a) deterministic tools (quant math, chain calls) and (b) an optional LLM reasoning step. Critical loops (price math, sizing formulas, risk checks) are pure code; the LLM layer does regime interpretation, strategy selection, parameter tuning, anomaly triage, NL interface, and trade memos. This "LLM decides *which* and *why*, code computes *how much*" split is the strongest answer to "context-aware, not hardcoded rules" without gambling the demo on hallucinated arithmetic.

## 4.1 Agent Specifications

### A1 — Market Intelligence Agent
- **In:** WS event streams (Sync/Swap per pool), oracle prices, gas feeds, CEX reference prices.
- **Out (writes):** Market State Graph in Redis — nodes = tokens/pools, edges = pool reserves & fees; per-pair volatility (EWMA σ), volume z-scores, whale-swap alerts (> $N swaps), **regime label** {trending↑, trending↓, mean-reverting, high-vol/chaotic} via rolling Hurst exponent + ADX + realized vol, refreshed each block.
- **Memory:** rolling windows in Redis; snapshots → Timescale every 15s.
- **Tools:** viem/web3 multicall batcher, source-health scorer (latency/freshness/agreement → weight per PS requirement).
- **Emits:** `market.tick`, `market.regime_change`, `market.whale_alert`.
- **LLM use:** none in hot path; periodic "market narrative" summary for dashboard/NL interface.

### A2 — Strategy Agent
- **In:** Market State Graph, regime label, pool tiers from A6, trade memos from vector DB.
- **Core logic:**
  - *Arbitrage scanner (primary):* Bellman-Ford for negative log-price cycles over the pool graph (triangular + cross-pool V2↔V3 same-pair); exact V2 (x·y=k incl. 0.25% fee) and V3 (tick-walk via QuoterV2) output math; **optimal input size** computed analytically for 2-leg V2 cycles, golden-section search otherwise; expected profit net of gas estimate.
  - *Trend follower (secondary):* EMA cross + regime filter (only trades when regime = trending) — demonstrates multi-strategy + regime adaptation cheaply.
- **Out:** `TradeProposal{strategy, legs|pair, direction, sizeRange, limitPrice, slippageBps, expectedProfit, confidence, riskScore, rationale}` → ranked queue.
- **Memory (bonus):** RAG over past trade memos — "last 5 times we took CAKE/WBNB arb in high-vol regime, 2 reverted on slippage" → LLM adjusts confidence/slippage.
- **Emits:** `trade.proposed`.

### A3 — Execution Agent
- **In:** `trade.approved` (only — cannot act on proposals directly).
- **Logic:** route choice (direct vs multi-hop vs ArbExecutor cycle vs flash); gas estimate + simulate via `eth_call`/local fork **before** signing; nonce manager; submit through private RPC when MEV-sensitive; watcher with timeout → RBF retry (max 2) → abort; testnet/live/paper mode switch.
- **Out:** `trade.executed{txHash, fillPrice, gasUsed, status}` or `trade.failed{reason}`.
- **LLM use:** none. Fully deterministic. (Say this proudly to judges — it's a feature.)

### A4 — Risk Management Agent
- **In:** every `trade.proposed`; continuous portfolio state; market anomaly signals.
- **Logic:** position sizing = f(risk profile) — e.g., conservative: ≤2% capital/trade, daily VaR cap, max 3 concurrent positions; aggressive: ≤10%, flash arb enabled. Pre-trade checks: exposure per token/chain, correlation to open positions, slippage sanity, token allowlist. Continuous: real-time P&L, Sharpe, max drawdown; anomaly detectors (price gap >x σ vs oracle, liquidity −50% in N blocks, oracle staleness, depeg) → defensive actions (cancel pending, tighten limits) → **circuit breaker**: auto-pause all trading + on-chain `pause()` under extreme conditions; cooldown + human-ack to resume.
- **Out:** `trade.approved` (with final size) / `trade.rejected{reason}` / `risk.circuit_breaker`.
- **LLM use:** anomaly *triage* narrative only; the breaker triggers are hard-coded thresholds.

### A5 — Portfolio & Performance Agent
- **In:** `trade.executed`, fills, gas, fees; Timescale history.
- **Logic:** double-entry trade ledger; FIFO cost basis; realized/unrealized P&L; win rate, avg profit/trade, profit-after-gas, per-strategy breakdown; Sharpe/Sortino/maxDD; backtest runner (replays historical subgraph swaps + pool states through Strategy Agent code paths — same code, historical data: no sim-vs-live drift); models regime→strategy performance and capital→returns curves.
- **Out:** REST/WS API consumed by dashboard; nightly performance memo → vector DB.

### A6 — Liquidity & Pool Analysis Agent
- **In:** subgraph pool lists, factory `PairCreated`/`PoolCreated` events, reserve snapshots.
- **Logic:** map all active V2/V3 pools across chains; rank by fee APR vs TVL; flag imbalanced reserves (arb seeds for A2); detect new-pool launches (early-mover signal — but gated by honeypot/token-safety checks); risk-tier pools {blue-chip, mid-cap, degen} via TVL/age/token-safety score; IL estimator: `IL(r) = 2√r/(1+r) − 1` scenario grid + fee-offset projection for LP strategies.
- **Out:** `pools.catalog` (Redis hash), `pool.new_launch`, `pool.imbalance` events.

### A7 — Simulation & Backtesting Agent (highly recommended — build it)
- **In:** candidate `TradeProposal`s (pre-execution dry-run), historical datasets, what-if parameters.
- **Logic:** (a) hot-path dry-run: fork BNB chain with Anvil at latest block, replay the exact tx, confirm profit ≥ threshold — this single feature kills most "looked profitable, reverted live" failures; (b) offline: strategy variant comparison, parameter sweeps, confidence intervals via block-bootstrap; (c) what-ifs: gas ×2, liquidity −50%, vol ×3 → re-run scenario engine.
- **Out:** `simulation.result{pass|fail, expectedProfit, CI}`; what-if dashboards.

## 4.2 Collaboration: one arbitrage trade, end to end

```
A1 detects reserve imbalance after whale swap ──▶ market.tick
A6 had tier-tagged both pools (blue-chip)     ──▶ pools.catalog
A2 finds WBNB→USDT→CAKE→WBNB cycle, +0.41% net gas, conf 0.83 ──▶ trade.proposed
A4 sizes it to 4% of capital (moderate profile), checks exposure ──▶ ok
A7 forks chain, replays tx: +0.38% realized ──▶ simulation.pass
A4 final approval ──▶ trade.approved
A3 builds ArbExecutor.executeCycle calldata, minProfit set, private RPC ──▶ tx
Chain: cycle executes atomically, CycleExecuted event
A1 ingests event ──▶ A5 books P&L, updates dashboard
A5 writes trade memo (context+outcome) ──▶ vector DB ──▶ A2's future confidence
A4 recomputes drawdown/exposure ──▶ loop continues
```

---

# STEP 5 — Complete Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Chains | BNB testnet (live exec) + BNB/ETH/Arb mainnet (read-only data) | PS requirement; realistic signals need mainnet data |
| Contracts | **Solidity 0.8.x + Foundry** | Forge tests against mainnet forks = same tool as Simulation Agent; fast |
| Chain client | **viem** (TS) + **web3.py** where Python agents need direct reads | Type-safe, multicall, WS |
| Backend services | **TypeScript / Node 20** for ingestion + execution (event-driven, WS-native); **Python 3.11 + FastAPI** for agents/API | Each language where it's strongest |
| AI / agents | **LangGraph + LangChain**, Claude/GPT-4-class API for reasoning nodes, **Pydantic** schemas on all LLM outputs | Deterministic graph topology, replayable state |
| RL (bonus) | Stable-Baselines3 PPO on backtest env (strategy parameter tuning) | Cheap to bolt onto backtester |
| Hot store / bus | **Redis 7** (state + Streams as message bus) | One infra piece for both; consumer groups; replay |
| DB | **PostgreSQL 16 + TimescaleDB** (+ pgvector if dropping Qdrant) | Hypertables, continuous aggregates, SQL analytics |
| Vector DB | **Qdrant** | Simple Docker, payload filtering |
| Frontend | **Next.js 14 + TypeScript + Tailwind + shadcn/ui + Recharts + React Flow** (agent decision graph) + WS live updates | Fast to build, looks production-grade |
| Monitoring | **Prometheus + Grafana** + structured JSON logs (pino/structlog) + OpenTelemetry traces tagged by `tradeId` | The trade-lifecycle trace doubles as the agent-decision visualization |
| DevOps | Docker Compose (demo), GitHub Actions CI, Turborepo + pnpm monorepo | One-command spin-up for judges |

---

# STEP 6 — Production-Grade Monorepo Structure

```
pancakeflow/
├── package.json  pnpm-workspace.yaml  turbo.json  docker-compose.yml  .env.example  Makefile
├── contracts/                      # Foundry project
│   ├── src/{ArbExecutor.sol, TradingVault.sol, LPManager.sol,
│   │        interfaces/{IPancakeRouter.sol, IPancakePair.sol, IPancakeV3Pool.sol},
│   │        libraries/{SwapMath.sol, SafetyChecks.sol}}
│   ├── test/{ArbExecutor.t.sol, FlashArb.fork.t.sol, Vault.t.sol}
│   ├── script/{Deploy.s.sol, ConfigureExecutor.s.sol}
│   └── foundry.toml
├── services/
│   ├── ingestion/                  # TS — data pipeline (Agent A1's body)
│   │   └── src/{index.ts, sources/{rpcWs.ts, subgraph.ts, oracle.ts, cexRef.ts, gas.ts},
│   │            sourceRegistry.ts            # latency/freshness/reliability scoring
│   │            marketGraph.ts               # Redis state graph writer
│   │            regime.ts  volatility.ts  whaleDetector.ts  publisher.ts}
│   ├── execution/                  # TS — Agent A3's body (holds keys)
│   │   └── src/{index.ts, router.ts, gasOracle.ts, nonceManager.ts,
│   │            mevProtect.ts, txWatcher.ts, modes/{live.ts, testnet.ts, paper.ts},
│   │            arbExecutorClient.ts}
│   └── api/                        # Python FastAPI — REST+WS gateway for dashboard & NL queries
│       └── app/{main.py, routers/{portfolio.py, trades.py, market.py, agents.py, nl.py}, ws.py}
├── agents/                         # Python — LangGraph brain
│   ├── orchestrator/{graph.py, states.py, gates.py}          # trade lifecycle FSM
│   ├── market_intel/{agent.py, narrative.py}
│   ├── strategy/{agent.py, arbitrage/{scanner.py, cycle_math.py, sizing.py},
│   │             trend/{signals.py}, proposals.py, memory_rag.py}
│   ├── risk/{agent.py, limits.py, anomaly.py, circuit_breaker.py, profiles.py}
│   ├── portfolio/{agent.py, ledger.py, metrics.py, backtest/{engine.py, data_loader.py, whatif.py}}
│   ├── liquidity/{agent.py, pool_mapper.py, tiering.py, il_model.py, token_safety.py}
│   ├── simulation/{agent.py, fork_runner.py, scenarios.py}
│   └── common/{bus.py, state.py, schemas.py, llm.py, config.py}
├── apps/web/                       # Next.js dashboard
│   └── src/{app/{page.tsx, trades/, strategies/, agents/, simulate/},
│            components/{PnlChart.tsx, TradeTable.tsx, AgentGraph.tsx,
│                        RegimeBadge.tsx, CircuitBreakerBanner.tsx, NlConsole.tsx},
│            lib/{api.ts, ws.ts}}
├── packages/                       # shared libraries
│   ├── shared-types/        # zod schemas mirrored to Pydantic (events, proposals, trades)
│   ├── chain-config/        # addresses, ABIs, per-chain params
│   └── pancake-sdk-utils/   # quoting helpers, pool math (TS)
├── infra/{docker/, grafana/dashboards/, prometheus/, github-actions/ci.yml}
├── data/{migrations/  seeds/  historical/}     # SQL migrations, backtest datasets
├── tests/{e2e/  load/}
└── docs/{ARCHITECTURE.md  RUNBOOK.md  DEMO_SCRIPT.md  API.md  CONTRACTS.md}
```

---

# STEP 7 — Final System Blueprint (Diagrams)

## 7.1 High-Level Architecture
```
┌────────────────────────────── EXTERNAL ──────────────────────────────┐
│  BNB/ETH/Arb RPCs (WS+HTTP) · Pancake Subgraphs · Chainlink · CEX px │
└──────┬───────────────────────────────────────────────────────────────┘
       ▼
┌──────────────────┐   writes    ┌─────────────────────────────────────┐
│ INGESTION (TS)   ├────────────▶│  REDIS: Market State Graph + Streams│
│ source registry  │             └──────┬──────────────────────────────┘
│ regime/vol calc  │                    │ read/subscribe
└──────────────────┘                    ▼
                      ┌───────────────────────────────────────────────┐
                      │        LANGGRAPH ORCHESTRATOR (Python)        │
                      │  A2 Strategy → A4 Risk → A7 Sim → A4 Final    │
                      │  A1 narrative · A6 pools · A5 portfolio       │
                      └───────┬───────────────────────────┬───────────┘
                              │ trade.approved            │ metrics
                              ▼                           ▼
                    ┌──────────────────┐        ┌──────────────────────┐
                    │ EXECUTION (TS)   │        │ Timescale + Qdrant   │
                    │ keys·MEV·nonce   │        └─────────┬────────────┘
                    └────────┬─────────┘                  │
                             ▼                            ▼
                   ┌───────────────────┐        ┌──────────────────────┐
                   │ ArbExecutor.sol   │        │ FastAPI ⇄ Next.js UI │
                   │ → Pancake pools   │        │  (REST + WebSocket)  │
                   └───────────────────┘        └──────────────────────┘
```

## 7.2 Data Flow
```
WS Sync/Swap events ─▶ ingestion ─▶ Redis graph (block-fresh reserves)
Subgraph (poll 60s) ─▶ pool catalog ─▶ A6 tiering ─▶ Redis pools.catalog
Oracle/CEX (poll 5s) ─▶ anchor prices ─▶ anomaly detector (A4)
Every fill event ─▶ Timescale trades hypertable ─▶ A5 metrics ─▶ UI WS push
Nightly: Timescale history ─▶ A7 backtests ─▶ performance memos ─▶ Qdrant
```

## 7.3 Agent Communication Flow (bus topics)
```
market.tick ─┬▶ A2 (scan)        trade.proposed ─▶ A4 ─▶ trade.sized ─▶ A7
             └▶ A4 (anomaly)     simulation.result ─▶ A4 ─▶ trade.approved ─▶ A3
pool.imbalance ─▶ A2             trade.executed/failed ─▶ A5, A2(memo), A4
market.regime_change ─▶ A2,A4    risk.circuit_breaker ─▶ ALL (A3 halts, UI banner)
```

## 7.4 Contract Interaction Flow
```
A3 ── executeCycle(legs,minProfit) ──▶ ArbExecutor ──▶ Pair1.swap → Pair2.swap → Pair3.swap
                                          │ profit ≥ minProfit? ──no──▶ REVERT (gas only)
                                          └─ yes ─▶ emit CycleExecuted ─▶ ingestion ─▶ A5
flashArb: ArbExecutor ◀─ flash borrow ─ PoolX … legs … repay PoolX, keep spread
```

## 7.5 Deployment Architecture (demo)
```
docker-compose: [redis] [timescaledb] [qdrant] [prometheus] [grafana]
                [ingestion] [execution] [agents-orchestrator] [api] [web]
Contracts → BNB testnet (Foundry script).  Anvil fork container for A7.
Prod path (mention to judges): k8s, per-service autoscale, KMS keys, multi-region RPC.
```

---

# STEP 8 — Implementation Plan (Lead Engineer view)

## 8.1 Milestones (designed for a hackathon timeline; scale to your real window)

| Phase | Goal | Exit criterion |
|---|---|---|
| **P0** Foundations | Monorepo, docker-compose infra, shared schemas, chain-config, CI | `make up` boots redis/timescale/qdrant; zod+pydantic schemas round-trip |
| **P1** Data spine | Ingestion service + Market State Graph + pool catalog | Live BNB mainnet reserves in Redis < 1 block stale; 200+ pools cataloged |
| **P2** Contracts | ArbExecutor + fork tests + testnet deploy | Fork test executes a profitable 3-leg cycle; deployed address in chain-config |
| **P3** Trade loop v1 | Strategy scanner → Risk gate → Execution (paper mode) | A detected mainnet imbalance produces a booked paper trade end-to-end |
| **P4** Live-ish | Testnet execution + tx watcher + Anvil dry-run (A7 hot path) | Testnet tx confirmed, P&L booked from on-chain event |
| **P5** Risk & Portfolio depth | Circuit breakers, drawdown, Sharpe, ledger, backtester | Breaker fires on injected flash-crash; backtest report renders |
| **P6** Dashboard | P&L, trades, regime badge, agent decision graph, breaker banner | Judge-ready UI on live data |
| **P7** Bonus | Vector memory, NL console, what-if sim UI, trend strategy, RL sweep | Each lands independently; cut from the bottom if late |

**Build order rationale / dependency graph:** schemas+infra → everything; ingestion → strategy (needs data); contracts ∥ ingestion (independent, parallelize across teammates); execution needs contracts + proposals; risk gate before any live execution (never demo without it); dashboard last-but-continuous (read APIs stabilize in P3).

## 8.2 Top Risks & Mitigations

1. **Testnet liquidity is garbage** → signals from mainnet data, execution on testnet against pools we seed ourselves in a setup script; paper mode as demo fallback. *Decide this early; it shapes the demo script.*
2. **RPC rate limits / flakiness mid-demo** → multi-provider source registry with health scoring + cached last-good state; pre-recorded backtest segment as plan C.
3. **LLM latency in hot path** → LLMs out of the hot path by design (only A2 confidence-adjust + narratives, both async/cacheable).
4. **Arb opportunities scarce during the live demo** → demo on replayed historical bursts (A7) + lower minProfit threshold on seeded testnet pools.
5. **Key/funds mishap** → testnet only; spend caps in code *and* contract; pause switch on dashboard.
6. **Scope explosion** → LPManager, cross-chain arb, RL are explicitly cut-first items.

## 8.3 Component Specs (contract-level detail)

### Ingestion Service
- **Purpose:** Agent A1's body — turn fragmented sources into one fresh state graph.
- **Functional:** subscribe WS logs for top-N pools; multicall `getReserves`/`slot0` refresh per block; poll subgraph (60s) for catalog; poll gas (5s), oracle (5s), CEX (5s); score sources; publish events.
- **Interface (Redis):**
  - `mkt:pool:{chain}:{addr}` hash → {token0, token1, r0, r1, sqrtPriceX96, fee, blockNumber, ts}
  - `mkt:pair:{chain}:{t0}:{t1}` → {midPx, vol1h, volz, regime}
  - `mkt:gas:{chain}` → {fast, std, baseFee, ts} · Stream `events:market`
- **DB:** Timescale `pool_snapshots(time, chain, pool, r0, r1, px, tvl)` hypertable, 15s cadence.

### Strategy Agent
- **API (internal):** `scan(graph) -> list[TradeProposal]`; `TradeProposal` (Pydantic) = {id, strategy, chain, legs[], amountInRange, expProfitWei, expProfitBps, gasEstWei, confidence∈[0,1], riskScore∈[0,1], slippageBps, ttlBlocks, rationale}.
- **Sizing math:** for a 2-pool V2 cycle, optimal input `x* = (√(k·p) − r_in)/…` solved in `cycle_math.py` (closed form); N-leg → golden-section on net-profit(x).

### Risk Agent
- **Profiles (config):**
```yaml
conservative: {maxPosPctCapital: 2, maxConcurrent: 3, dailyMaxDrawdownPct: 3,  slippageCapBps: 30,  flashArb: false, tiers: [blue-chip]}
moderate:     {maxPosPctCapital: 5, maxConcurrent: 6, dailyMaxDrawdownPct: 7,  slippageCapBps: 75,  flashArb: true,  tiers: [blue-chip, mid-cap]}
aggressive:   {maxPosPctCapital: 10,maxConcurrent: 12,dailyMaxDrawdownPct: 15, slippageCapBps: 150, flashArb: true,  tiers: [blue-chip, mid-cap, degen]}
```
- **Breaker triggers (hard-coded):** drawdown ≥ profile cap · oracle-vs-pool divergence > 3% · pool liquidity −50% in 20 blocks · 3 consecutive failed txs · stale data > 30s.

### Execution Service
- **API:** consumes `trade.approved`; `POST /admin/pause`; emits `trade.executed|failed`.
- **Tx pipeline:** build calldata → `eth_call` simulate → (MEV-sensitive? private RPC : public) → sign → watch (timeout 3 blocks) → RBF ×2 → final status.

### Portfolio / API
- **Schema (Postgres/Timescale):**
```sql
trades(id, ts, chain, strategy, legs jsonb, amount_in numeric, amount_out numeric,
       gas_wei numeric, status, tx_hash, realized_pnl numeric, proposal jsonb);
positions(id, token, chain, qty, cost_basis, opened_ts, closed_ts);
pnl_snapshots(time, equity, realized, unrealized, drawdown) -- hypertable
agent_events(time, trade_id, agent, event, payload jsonb)    -- decision graph source
```
- **REST:** `GET /portfolio/summary` `GET /trades?strategy=` `GET /market/state` `GET /agents/timeline?tradeId=` `POST /nl/query` · **WS:** `/ws/live` pushes {pnl, newTrade, regime, breaker}.

---

# STEP 9 — Code Generation Roadmap (file-by-file)

**1. Contracts** — `ArbExecutor.sol` (cycle loop, flash callbacks, guards, events) · `SafetyChecks.sol` (pool-address derivation validation) · `ArbExecutor.t.sol` (unit: minProfit revert, allowlist) · `FlashArb.fork.t.sol` (mainnet-fork happy path) · `Deploy.s.sol`.

**2. Ingestion** — `sources/rpcWs.ts` (log subscriptions, reconnect) · `sourceRegistry.ts` (EWMA latency + freshness + agreement score; pick best per query) · `marketGraph.ts` (atomic Redis writes per block) · `regime.ts` (Hurst+ADX+vol classifier) · `whaleDetector.ts` · `publisher.ts` (Streams).

**3. Agent framework** — `common/bus.py` (Streams consumer groups, idempotency) · `common/schemas.py` (Pydantic mirrors of zod) · `common/llm.py` (schema-validated LLM calls, retries, cache) · `orchestrator/graph.py` (LangGraph: propose→risk→simulate→approve→execute→book; checkpointed state) · `orchestrator/gates.py` (hard gates as pure functions).

**4. Data pipelines** — `data/migrations/00x_*.sql` · `portfolio/backtest/data_loader.py` (subgraph historical swaps → parquet) · seeds for testnet pools (`script/SeedTestnetPools.s.sol`).

**5. Execution engine** — `router.ts` (direct vs multihop vs cycle calldata builder) · `mevProtect.ts` (private RPC client + fallback) · `nonceManager.ts` · `txWatcher.ts` (RBF logic) · `modes/paper.ts` (fills at simulated price w/ slippage model — keep identical interface to live).

**6. Risk engine** — `limits.py` (pre-trade checks) · `anomaly.py` (z-score + oracle divergence detectors) · `circuit_breaker.py` (state machine: ARMED→TRIPPED→COOLDOWN; also calls contract `pause()`).

**7. Portfolio & analytics** — `ledger.py` (double-entry booking from chain events) · `metrics.py` (Sharpe/Sortino/maxDD/win-rate, profit-after-gas) · `backtest/engine.py` (event-replay through real strategy code) · `whatif.py` (gas×2, liq−50% scenario transforms).

**8. Frontend** — `PnlChart` (equity curve + drawdown shading) · `TradeTable` (live WS) · `AgentGraph` (React Flow fed by `agent_events` — the per-trade decision DAG; this is your bonus showpiece) · `RegimeBadge` · `CircuitBreakerBanner` (red, impossible to miss — judges love visible safety) · `NlConsole` (POST /nl/query → A2/A5 tools).

**9. DevOps** — `docker-compose.yml` (all services + infra) · `Makefile` (`make up / seed / demo / backtest`) · `ci.yml` (forge test, pytest, tsc, eslint) · Grafana dashboard JSON (ingest lag, tx success rate, agent loop latency).

---

# STEP 10 — Build Execution Plan

The architecture above is deliberately complete enough that module construction is mechanical. Build proceeds in the P0→P7 order with these integration contracts frozen first (they are the spine — freeze them on day one and everything composes):

1. **Event schemas** (`shared-types` / `common/schemas.py`) — every message on the bus.
2. **Redis key map** (§8.3 Ingestion interface).
3. **`TradeProposal` and `trade.*` lifecycle states.**
4. **`IArbExecutor` ABI.**

Each module then has: design recap → code → unit tests → integration test against the spine → demo checkpoint. Generated module-by-module in exactly the Step 9 order.

**Demo script for judges (90 seconds):** open dashboard → show live regime + market graph → whale swap hits a seeded testnet pool → AgentGraph animates proposal→risk→sim→approve → testnet tx hash on BscScan → P&L ticks up → trigger injected flash-crash → circuit breaker banner + on-chain pause → NL console: "show me arbitrage opportunities on BNB right now."


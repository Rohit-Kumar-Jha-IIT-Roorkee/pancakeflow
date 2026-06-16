# CLAUDE.md — PancakeFlow project guide

Orientation for any Claude session working on this repo. The full build roadmap lives in
**`plan.md`**; the original architecture is in **`PancakeSwap_MultiAgent_System_Blueprint.md`**.

## What this is
An autonomous **multi-agent arbitrage system for PancakeSwap** (Mid Prep PS-2, PancakeSwap ×
IIT Roorkee). A swarm of specialized agents detect → gate → simulate → execute → book
arbitrage on BNB Chain, MEV-aware and risk-first. **Goal of current work:** finish it into a
polished, **resume-grade, industry-level prototype** that runs in **paper + BNB testnet**,
**mainnet-capable but gated OFF by default**. Not a custody product, not handling stranger
funds — a credible, demonstrable showpiece.

## How we work (read this before doing anything)
- A **separate engineer implements the code, one phase at a time** from `plan.md`.
- **Claude's job is to PLAN and to REVIEW** — not to implement, unless explicitly asked.
- Reviews happen in **fresh sessions**: the user says "review phase N"; review that phase's
  diff against the phase's tasks + exit criterion in `plan.md`, the invariants below, and the
  review checklist below. Return concrete, file-referenced findings (severity-ordered). The
  engineer applies fixes; re-review if asked.

### Review checklist (apply to every phase)
1. Meets the phase's stated **exit criterion**, with tests that actually prove it?
2. **Invariants intact** (see below)?
3. **Real logic vs. stub/mock/hardcoded** — flag anything that only *looks* finished.
4. Reuses the existing utilities/patterns named in the plan instead of re-implementing?
5. **Security/safety**: signing key stays only in the execution service; mainnet stays gated;
   no secret committed (check diffs for keys, `.env` contents).
6. Tests/CI green; no regression in the existing **6 integration tests + 9 contract tests**.

## Invariants — DO NOT BREAK
- **Risk gate is structurally unskippable.** The orchestrator (`agents/orchestrator/graph.py`)
  is the ONLY thing that may publish `trade.approved` / `trade.executed`. No new code may
  publish those directly, or emit `trade.approved` without passing the risk gate + sim.
- **Off-chain math ↔ on-chain math agreement.** `agents/strategy/arbitrage/cycle_math.py` must
  stay in agreement with `contracts/src/ArbExecutor.sol` (verified to 4 decimals today). Any
  new pricing (e.g. V3) must add a test asserting equality to N decimals.
- **LLM is out of the hot path** and `agents/common/llm.py:22` already uses a **valid current**
  model id (`claude-sonnet-4-6`). Do NOT change it to a `claude-3-5-*` id. For LLM/API work,
  consult the `claude-api` skill for the current message format.
- **Mainnet stays gated.** `EXEC_MODE=live` must be refused unless an explicit override is set.

## Architecture map
- `agents/` — Python "brain" (LangGraph-shaped orchestrator + agents): `orchestrator/`,
  `strategy/` (arbitrage Bellman-Ford + trend), `risk/` (gate, circuit breaker, anomaly,
  profiles), `portfolio/` (ledger, metrics, backtest), `simulation/` (fork dry-run, scenarios),
  `liquidity/` (A6 — **currently an empty stub, Phase 1 fills it**), `common/` (bus, schemas,
  state, llm, config).
- `services/ingestion/` (TS) — A1's body: BNB WS Sync/Swap subs, source-health scoring, regime
  classifier, oracle/CEX/gas/subgraph sources → Redis market state graph + streams.
- `services/execution/` (TS) — A3's body, holds the key: `modes/paper.ts`, `modes/onchain.ts`,
  nonce manager, eth_call simulate, RBF retry, private-RPC hook.
- `services/api/` (Python FastAPI) — REST + WS gateway for the dashboard + NL console.
- `apps/web/` (Next.js) — dashboard; sub-routes `/trades /strategies /agents /simulate` are
  **empty, Phase 3 fills them**.
- `packages/` — `shared-types` (zod, mirrored to Pydantic), `chain-config` (addresses/ABIs).
- `contracts/` — Foundry: `ArbExecutor.sol` (atomic profit-or-revert + flash arb), tests, EVM
  harness fallback, deploy script.
- `data/migrations/` — Postgres/Timescale DDL (`trades`, `positions`, `pnl_snapshots`,
  `agent_events`). **The DDL exists**; it just needs to be applied.
- `tests/integration/` — 6 real e2e suites (seeded Redis, no live RPC needed).

## Current reality (audit summary — what's real vs. gap)
~80% built and genuinely working in paper mode. **Real:** arbitrage math, contracts (9/9
tests), unskippable orchestrator, ingestion, paper+onchain execution, dashboard, API, DB
migrations, integration tests. **Gaps the 3 phases fix:**
- Position-tracking set (`config.KEY_POSITIONS`) never written → concurrency limit never fires.
- Daily-drawdown breaker defined in profiles but never enforced as a gate.
- `agents/liquidity/` (A6) empty — one of the mandatory agents.
- V3 pools not scanned; trend strategy not booked end-to-end; RAG embeddings are fake hashes.
- No CI, no monitoring, no API auth/health checks, no hosted demo; empty dashboard sub-routes.

## Roadmap (detail in `plan.md`)
- **Phase 1 — Make the claims true:** position tracking, drawdown gate, Postgres ledger applied,
  implement A6 liquidity agent, tests proving the gates.
- **Phase 2 — PS-deliverable depth:** V3 scanning, finish trend strategy, real embeddings/RAG +
  richer NL, hardened testnet execution (mainnet gated), surface the backtester in UI.
- **Phase 3 — Industry polish + hosted demo:** CI/CD, Prometheus+Grafana + tracing + health
  checks, API auth/rate-limit, finish dashboard + React Flow agent DAG, hosted testnet/paper
  demo, docs + honest README.

## Run / test (Windows; PowerShell-friendly)
- Infra + install: `make infra` then `pnpm install` and `pip install -r agents/requirements.txt`.
- Run pieces: `make ingest`, `make agents`, `make api`, `make web` (dashboard → :3000).
- Tests: `make test` (forge/EVM-harness + pytest + cycle-math). Integration suites in
  `tests/integration/` run on seeded Redis without live RPC.
- Default mode is **paper** (no keys, no Postgres needed).

## Conventions
- Each bus message is schema-validated: zod in `packages/shared-types`, mirrored to Pydantic in
  `agents/common/schemas.py` — keep both sides in sync.
- Persistence is three-tier (Postgres → Redis → in-memory); preserve graceful degradation.
- TS for event-driven/WS-native services; Python for agents/API. Use each where it's strongest.

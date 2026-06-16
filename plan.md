# PancakeFlow — From Hackathon Build to Industry-Grade Resume Prototype

## Context

PancakeFlow is an autonomous multi-agent arbitrage system for PancakeSwap, built for
Mid Prep PS-2 (PancakeSwap × IIT Roorkee). A reality audit of the codebase shows it is
**genuinely ~80% built — not a mockup**: the arbitrage math (Bellman-Ford negative-cycle
detection, V2 constant-product pricing, closed-form optimal sizing) is verified to 4
decimals against `ArbExecutor.sol` (9/9 contract tests pass); the orchestrator's risk
gate is structurally unskippable; ingestion has real BNB WS Sync/Swap subscriptions,
source-health scoring, a regime classifier and Chainlink oracle divergence; execution
has real paper + on-chain modes; and there's a working Next.js dashboard, FastAPI gateway,
DB migrations, docker-compose, and 6 passing integration tests.

**Goal (per user):** finish this into a polished, **resume-grade** prototype that is
"industry-level standard" and maps cleanly to the problem statement's deliverables. It
should run convincingly in **paper + BNB testnet**, be **mainnet-capable but gated OFF by
default** (no audit/custody work now — that's "later"), and close the real correctness and
polish gaps so every claim in the README survives scrutiny by a recruiter or interviewer.
Scope is "what the problem statement asks for + what makes it credible," not gold-plating.

This plan delivers that in **3 phases**: (1) make the claims true (correctness + the one
missing mandatory agent), (2) depth that matches the PS deliverables (V3, second strategy,
real AI memory, hardened testnet path), (3) industry-grade polish + a hosted demo anyone
can view.

### Working model & review workflow (how this gets built)
- This plan is delivered into the repo as **`plan.md`** (full detail) and summarized into
  **`CLAUDE.md`** (loaded automatically by every Claude session, including reviews).
- A **separate engineer implements one phase at a time** from this plan.
- After each phase, a **fresh Claude review session** reviews that phase's diff against:
  (a) the phase's tasks and **exit criterion** below, (b) the **do-not-break invariants**, and
  (c) general correctness/quality. The review returns findings; the engineer applies changes;
  re-review if needed before moving to the next phase.
- **Review checklist (apply every phase):**
  1. Does the phase meet its stated exit criterion, with tests that actually prove it?
  2. Are the do-not-break invariants intact (risk-gate unskippability, off-chain↔on-chain math
     agreement, valid LLM model id)?
  3. Real logic vs. stub/mock/hardcoded — flag anything that only *looks* done.
  4. Does it match existing patterns (schemas, bus, three-tier persistence) and reuse the
     utilities named in each task instead of re-implementing?
  5. Security/safety: keys never leave the execution service; mainnet stays gated off;
     no secret committed.
  6. Tests/CI green; no regressions in the existing 6 integration tests + 9 contract tests.

### The real gaps the audit found (what this plan fixes)
- Position-tracking set (`config.KEY_POSITIONS`) is never written → concurrency limit never fires.
- Daily-drawdown circuit breaker is defined in profiles but **never enforced** as a gate
  (the PS explicitly requires drawdown breakers to gate execution).
- `agents/liquidity/` is an **empty stub** — yet A6 (Liquidity & Pool Analysis) is one of the
  6 mandatory agents. The "7 agents" claim currently has a hole.
- V3 pools are **not scanned** (`scanner.py` builds V2 edges only); PS scope is V2 **+ V3**.
- Trend-following strategy is half-wired (directional path exists in risk/portfolio but no
  end-to-end booking); PS rewards a working **second strategy**.
- RAG memory uses **fake hash-based embeddings**; the "agent memory" bonus isn't genuine.
- No CI, no monitoring/Grafana, no API auth, no health checks, no hosted demo.
- Empty dashboard sub-routes (`/trades`, `/agents`, `/simulate`, `/strategies`) and no
  React Flow agent-decision DAG (a named PS bonus showpiece).

### Do-NOT-break notes for implementers
- `agents/common/llm.py:22` already uses a **valid current** model id (`claude-sonnet-4-6`).
  Do not "downgrade" it to a `claude-3-5-*` id. When touching LLM code, consult the
  `claude-api` skill for the current message format.
- The risk gate's unskippability comes from the orchestrator topology
  (`agents/orchestrator/graph.py`) being the **only** publisher of `trade.approved`. Preserve
  that invariant — never let any new code publish `trade.approved`/`trade.executed` directly.
- The off-chain math (`cycle_math.py`) must stay in agreement with `ArbExecutor.sol`. Any
  V3 pricing added must be cross-checked the same way (test asserts equality to N decimals).

---

## Phase 1 — Make the claims true (correctness + complete the 7th agent)

Goal: every safety claim the README makes is actually enforced, and all 7 mandatory agents
are real. Exit criterion: new tests prove the concurrency limit, the drawdown breaker, and
the Postgres ledger tier all fire end-to-end; A6 produces real pool intelligence consumed by
the scanner.

1. **Position tracking (close the silent hole).**
   - On a successful fill, add the position/trade id to `config.KEY_POSITIONS`; remove it when
     the cycle closes (arb cycles are atomic → add-then-remove around the booking; directional
     trades stay until exit). Write this in the orchestrator booking path
     (`agents/orchestrator/graph.py` where `portfolio.on_fill` is called) and/or
     `agents/orchestrator/executor_paper.py`, mirroring the TS side in
     `services/execution/src/index.ts`.
   - Reuse: `agents/risk/agent.py:_open_position_count()` already reads the set via `scard`;
     this just needs writers. No interface change.

2. **Enforce daily drawdown as a real pre-trade gate.**
   - The profile field `dailyMaxDrawdownPct` (`agents/risk/profiles.py`) is currently cosmetic.
     Add a drawdown check to the gate: compute current-day drawdown from equity (reuse
     `agents/portfolio/metrics.py` max-drawdown logic + `pnl_snapshots`), and have
     `agents/risk/agent.py:gate_proposal` reject when drawdown ≥ profile cap, also tripping
     `agents/risk/circuit_breaker.py`. Extend `agents/risk/anomaly.py` with a `drawdown_breach`
     detector to keep all breaker triggers in one place.

3. **Guarantee the Postgres ledger tier actually works.**
   - `agents/portfolio/ledger.py:init()` creates a pool but assumes the schema exists. Make it
     idempotently apply `data/migrations/001_tables.sql` + `002_timescale.sql` on startup (or
     have a small migration runner the agents/api call). Verify `record_trade` → `all_trades`
     round-trips on real Postgres, not just the Redis/in-memory fallback.

4. **Implement the Liquidity & Pool Analysis Agent (A6) for real** (`agents/liquidity/`).
   - Pool mapping + risk-tiering: the TVL-based tiering already exists in
     `services/ingestion/src/sources/subgraph.ts` (blue-chip/mid-cap/degen) — have A6 read the
     `pools.catalog` it writes and expose it to the strategy + risk profiles (profiles already
     reference `tiers`).
   - Imbalance detection: emit `pool.imbalance` seeds that bias the scanner toward fresh
     opportunities (consume in `agents/strategy/arbitrage/agent.py`).
   - IL estimator: the closed-form `IL(r) = 2√r/(1+r) − 1` grid (cheap, no on-chain work) for
     the LP-readiness story.
   - Token-safety gate: simple checks (allowlist + tier) so degen pools are excluded for
     conservative/moderate profiles. This makes the "honeypot-aware" claim real at low cost.

5. **Strengthen the test suite to prove the gates.**
   - Extend `tests/integration/` so tests assert: concurrency limit rejects the N+1 trade;
     injected drawdown trips the breaker and halts trading; Postgres ledger tier persists and
     reads back. Keep them runnable without live RPC (seeded Redis, as today).

---

## Phase 2 — Depth that matches the problem-statement deliverables

Goal: turn the "in scope" claims (V3, multi-strategy, agent memory, testnet execution) into
working features. Exit criterion: a V2↔V3 same-pair arb is detected and sized; a trend trade
books end-to-end; RAG recall uses real embeddings; a testnet tx confirms and books P&L from
the on-chain event with mainnet gated off.

1. **V3 pool scanning** (`agents/strategy/arbitrage/scanner.py`, `cycle_math.py`).
   - Add V3 pricing via QuoterV2 (or tick/sqrtPrice math for single-tick moves) so the scanner
     builds V3 edges alongside V2 and finds cross-pool V2↔V3 same-pair cycles. Keep
     `evaluate_cycle` as the common evaluator; inject a per-leg pricing function by `poolType`.
   - Cross-check: a new test asserts V3 quote agreement (same pattern as `test_cycle_math.py`).
   - V3 pool addresses/ABIs already partly exist in `packages/chain-config` and
     ingestion's `v3Mid()`; reuse them.

2. **Finish the trend-following strategy end-to-end** (`agents/strategy/trend/signals.py`).
   - Wire the directional path all the way through: proposal → risk gate (directional sizing,
     which already exists) → sim → execution (directional fill path already in
     `executor_paper.py`) → portfolio booking + position open/close. Gate it on regime =
     trending (regime classifier already produces this). Delivers the multi-strategy bonus.

3. **Real AI memory + richer NL** (`agents/strategy/memory_rag.py`, `services/api/app/main.py`).
   - Replace hash-based embeddings with a real embedding model (local sentence-transformer or
     an embeddings API) and store memos in Qdrant (already in docker-compose). RAG recall in
     `agents/strategy/agent.py:_adjust_confidence` then genuinely surfaces "last 5 CAKE arbs
     reverted." Upgrade the NL console to route through the LLM (`llm.py`) for free-form
     queries while keeping deterministic answers for arbitrage/regime/pnl.

4. **Harden the testnet execution path; keep mainnet gated.**
   - Make the PS P4 exit criterion real: a seed-testnet-pools script
     (`contracts/script/SeedTestnetPools.s.sol`), `EXEC_MODE=testnet` submits via
     `services/execution/src/modes/onchain.ts`, the `CycleExecuted` event is ingested, and
     `agents/portfolio` books P&L from the on-chain event.
   - Mainnet: leave all wiring present but `EXEC_MODE=live` **disabled by default** with a loud
     guard + README warning (no audit/KMS now). Add a real fork dry-run in
     `agents/simulation/fork_runner.py` (Anvil fork at latest block) behind a flag, so the
     "simulate before submit" story is demonstrable on testnet.

5. **Surface the backtester** (PS deliverable #7).
   - The engine in `agents/portfolio/backtest/` works but isn't surfaced. Add an API endpoint +
     a `/simulate` dashboard view that runs a backtest over `pool_snapshots` and renders the
     equity curve + win rate. Reuse `backtest/engine.py` and the existing Recharts setup.

---

## Phase 3 — Industry-grade polish + a demo anyone can view

Goal: it *looks and operates* like a real product under scrutiny, and a recruiter can open a
URL and watch it work. Exit criterion: CI green on every push; Grafana shows live metrics;
hosted testnet+paper demo reachable; docs + honest README + demo script/video done.

1. **CI/CD** (`.github/workflows/ci.yml`).
   - Run `forge test` (fallback to the EVM harness), `pytest` over `tests/`, `tsc` typecheck
     for the TS services/packages, and lint. Wire `make test` into it. Add build of all
     Docker images.

2. **Observability** (`infra/`).
   - Prometheus + Grafana (already namechecked in the blueprint, not present): dashboards for
     ingest lag, tx success rate, agent loop latency, P&L. Structured JSON logs (pino/structlog
     already partly used) + OpenTelemetry traces tagged by `tradeId` — this trace doubles as the
     agent-decision visualization. Add `HEALTHCHECK`/non-root `USER` to the Dockerfiles.

3. **API hardening** (`services/api/`).
   - API-key/JWT auth + rate limiting on `/nl/query` and write endpoints so a public demo can't
     drain RPC quota. Add request-body validation (Pydantic models) on endpoints that take dicts.

4. **Finish the dashboard** (`apps/web/src/app/*`).
   - Build out the empty sub-routes `/trades`, `/strategies`, `/agents`, `/simulate`. Add the
     **React Flow agent-decision DAG** fed by `agent_events` (the named PS bonus showpiece) and
     a what-if sim UI. Add loading/error states. Reuse existing `lib/api.ts`, `lib/ws.ts`,
     `AgentRail`, `PnlChart`, `CircuitBreakerBanner`.

5. **Hosted demo + one-command spin-up.**
   - Ensure `docker compose up` boots the whole stack clean. Deploy a read-only **testnet+paper**
     demo (a small VPS/Render/Fly + managed Redis/Postgres) reachable at a URL. Ship a demo seed
     script and the scripted 90-second moment (whale swap → proposal→gate→sim→approve on the DAG
     → testnet tx on BscScan → P&L tick → injected flash-crash → breaker banner + on-chain pause
     → NL query). Record a short demo GIF/video for the README.

6. **Docs + honesty pass** (`docs/`, `README.md`).
   - `ARCHITECTURE.md`, `RUNBOOK.md`, `DEMO_SCRIPT.md`, a short `SECURITY.md` (key handling,
     mainnet-gated rationale). Rewrite the README status table to the **accurate** post-Phase-1/2
     reality (replace any overstated "verified" with precise, defensible language). This honesty
     is itself a resume signal.

---

## Verification (end to end)

- **Per-phase tests:** `make test` (forge/EVM-harness + pytest + tsc) green after each phase;
  Phase-1 adds gate-enforcement tests; Phase-2 adds V3-quote agreement + trend-booking +
  testnet-event-booking tests.
- **Local stack:** `make infra && docker compose up` → open `http://localhost:3000`, seed a
  market (`tests/integration/test_e2e_loop.py` path), watch a trade flow proposal→gate→sim→
  approve→book on the dashboard; trigger an injected flash-crash and confirm the breaker banner
  + halt.
- **Testnet:** deploy `ArbExecutor` + seed pools, set `EXEC_MODE=testnet`, confirm a real tx
  hash on BscScan and P&L booked from the on-chain `CycleExecuted` event.
- **Gates:** automated assertions that the N+1 concurrent trade is rejected, the drawdown
  breaker trips on injected drawdown, and degen pools are excluded for conservative profiles.
- **Ops:** CI passes on a fresh clone; Grafana dashboards populate; the hosted demo URL loads
  and shows live paper/testnet activity; API rejects unauthenticated write calls.
- **Mainnet safety:** confirm `EXEC_MODE=live` is refused unless an explicit override is set,
  with the warning surfaced.

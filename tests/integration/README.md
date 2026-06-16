# Integration tests (verified passing)

Run from repo root with Redis up (`make infra`):
```bash
python3 agents/strategy/arbitrage/test_cycle_math.py   # AMM math vs on-chain numbers
python3 tests/integration/test_scanner.py              # Bellman-Ford arb detection
python3 tests/integration/test_backtest.py             # historical replay
python3 tests/integration/test_breaker.py              # circuit breaker (needs Redis)
python3 tests/integration/test_e2e_loop.py             # full agent trade loop (needs Redis)
python3 tests/integration/test_fullstack.py            # + FastAPI (start API on :8000 first)
```
All six pass. Contract suite: `contracts/` via `forge test` or `contracts/test/evm-harness`.

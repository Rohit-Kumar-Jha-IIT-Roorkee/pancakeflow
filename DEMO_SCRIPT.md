# PancakeFlow Demo Script

Follow these steps to demonstrate the full capabilities of the PancakeFlow autonomous trading system.

## 1. Setup

1. Start the stack: `docker compose up -d`
2. Start the Python agents: `python -m agents.main`
3. Start the dashboard: `cd apps/web && pnpm dev`

## 2. Seed Mock Data

Run the seeding script to populate the system with a fake catalog and synthetic pool updates:
```bash
./scripts/demo_seed.sh
```

## 3. The Dashboard

Open [http://localhost:3000](http://localhost:3000)

### /trades
Watch the Trade Ledger. You will see paper trades executing as the strategies identify opportunities from the seeded data. Note the `P&L` column and the `Status` changing from `proposed` to `executed`.

### /agents
Navigate to the Agent Decision DAG. This React Flow diagram visualizes the life cycle of every trade decision.
- Orange (`--signal`) nodes indicate a proposed trade.
- Blue (`--info`) nodes indicate a simulation dry-run.
- Green (`--pos`) nodes indicate approval and successful execution.
- Red (`--neg`) nodes indicate a rejection at the risk gate or a failed simulation.

### /strategies
View the active risk profiles. You can see the current market regime (e.g. `ranging`, `trending_up`) which dictates active strategies, and the Circuit Breaker status (which defaults to `ARMED` and trips to `TRIPPED` if loss thresholds are breached).

### /simulate
Run the Backtester. Click "Run Backtest (30d)". The UI will query the FastAPI endpoint, simulating trades over historical data, and return equity curve charts and summary metrics (Trades, Win Rate, Net Profit).

## 4. Testing the API

The API is hardened with an `X-API-Key`.
To test the Natural Language Interface:
```bash
curl -X POST http://localhost:8000/nl/query \
     -H "Content-Type: application/json" \
     -H "X-API-Key: demo-key" \
     -d '{"q": "show me arbitrage opportunities on BNB right now"}'
```
You should see rate limiting in action if you run this more than 10 times a minute.

## 5. Observability

Check the Prometheus metrics at `http://localhost:8000/metrics`.
Check Grafana at `http://localhost:3001` (if configured) for system dashboards.

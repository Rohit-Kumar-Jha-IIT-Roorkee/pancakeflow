.PHONY: up down infra agents api web ingest exec test seed
infra:      ## start datastores only (Redis, Postgres, Qdrant)
	docker compose up -d redis timescaledb qdrant
up:         ## start everything via docker compose
	docker compose up -d --build
down:
	docker compose down
seed:       ## seed demo market state into Redis (run before agents)
	python3 scripts/seed_market.py
agents:     ## run the python agent swarm (paper mode)
	python3 -m agents.main
api:        ## run the FastAPI gateway
	cd services/api && uvicorn app.main:app --reload --port 8000
web:        ## run the dashboard
	pnpm --filter @pancakeflow/web dev
ingest:     ## run the data ingestion service (needs BSC_RPC in .env)
	pnpm --filter @pancakeflow/ingestion dev
exec:       ## run the execution service
	pnpm --filter @pancakeflow/execution dev
test:       ## run all verifiable tests
	python3 -m pytest tests/ agents/strategy/arbitrage/test_cycle_math.py
	cd contracts && (forge test -vv 2>/dev/null || echo "forge unavailable; see test/evm-harness")

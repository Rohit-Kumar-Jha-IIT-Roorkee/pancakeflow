-- Plain-Postgres DDL. Runs on stock Postgres (tests) and Timescale (prod).
CREATE TABLE IF NOT EXISTS pool_snapshots (
  time           TIMESTAMPTZ NOT NULL,
  chain          TEXT        NOT NULL,
  pool           TEXT        NOT NULL,
  pool_type      SMALLINT    NOT NULL,
  reserve0       NUMERIC,
  reserve1       NUMERIC,
  sqrt_price_x96 NUMERIC,
  mid_price      DOUBLE PRECISION,
  block_number   BIGINT
);
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_pool ON pool_snapshots (chain, pool, time DESC);

CREATE TABLE IF NOT EXISTS trades (
  id           TEXT PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  chain        TEXT NOT NULL,
  strategy     TEXT NOT NULL,
  kind         TEXT NOT NULL,                -- cycle | directional
  legs         JSONB,
  amount_in    NUMERIC,
  amount_out   NUMERIC,
  gas_wei      NUMERIC,
  status       TEXT NOT NULL,                -- executed | failed
  mode         TEXT NOT NULL,                -- paper | testnet | live
  tx_hash      TEXT,
  realized_pnl_usd DOUBLE PRECISION,
  proposal     JSONB
);
CREATE INDEX IF NOT EXISTS idx_trades_ts ON trades (ts DESC);

CREATE TABLE IF NOT EXISTS positions (
  id          TEXT PRIMARY KEY,
  ts_open     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ts_close    TIMESTAMPTZ,
  chain       TEXT NOT NULL,
  pair        TEXT NOT NULL,
  side        TEXT NOT NULL,                 -- long | short
  qty         NUMERIC NOT NULL,
  entry_price DOUBLE PRECISION NOT NULL,
  exit_price  DOUBLE PRECISION,
  strategy    TEXT NOT NULL,
  pnl_usd     DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS pnl_snapshots (
  time      TIMESTAMPTZ NOT NULL DEFAULT now(),
  equity_usd DOUBLE PRECISION NOT NULL,
  realized_usd DOUBLE PRECISION NOT NULL,
  drawdown_pct DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_events (
  time     TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_id TEXT,
  agent    TEXT NOT NULL,
  event    TEXT NOT NULL,
  payload  JSONB
);
CREATE INDEX IF NOT EXISTS idx_agent_events_trade ON agent_events (trade_id, time);

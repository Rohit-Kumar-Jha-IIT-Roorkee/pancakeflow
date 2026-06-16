-- Timescale-only extras (docker image runs this after 001; skipped on stock PG).
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('pool_snapshots', 'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('agent_events',  'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('pnl_snapshots', 'time', if_not_exists => TRUE, migrate_data => TRUE);

CREATE MATERIALIZED VIEW IF NOT EXISTS pool_candles_1m
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket, chain, pool,
       first(mid_price, time) AS open, max(mid_price) AS high,
       min(mid_price) AS low,  last(mid_price, time) AS close
FROM pool_snapshots GROUP BY bucket, chain, pool
WITH NO DATA;

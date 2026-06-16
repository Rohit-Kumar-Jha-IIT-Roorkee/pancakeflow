"""Central env config for all Python agents. No magic, no extra deps."""
import os

def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)

REDIS_URL      = env("REDIS_URL", "redis://localhost:6379")
DATABASE_URL   = env("DATABASE_URL", "")          # empty => DB features degrade gracefully
QDRANT_URL     = env("QDRANT_URL", "")            # empty => in-memory vector store
ANTHROPIC_KEY  = env("ANTHROPIC_API_KEY", "")     # empty => rule-based fallbacks only

CHAIN          = env("CHAIN", "bsc")
EXEC_MODE      = env("EXEC_MODE", "paper")        # paper | testnet | live
RISK_PROFILE   = env("RISK_PROFILE", "moderate")  # conservative | moderate | aggressive
CAPITAL_USD    = float(env("CAPITAL_USD", "10000"))

SCAN_INTERVAL_SEC   = float(env("SCAN_INTERVAL_SEC", "3"))
MIN_PROFIT_BPS      = float(env("MIN_PROFIT_BPS", "10"))   # ignore opportunities under 0.10%
MAX_LEGS            = int(env("MAX_LEGS", "3"))

# stream / key names — must match the TS spine (packages/shared-types, services/ingestion)
STREAM_MARKET = "events:market"
STREAM_TRADE  = "events:trade"
UI_CHANNEL    = "ui:push"
KEY_BREAKER   = "risk:breaker"
KEY_OPPS      = "strat:opportunities"
KEY_POSITIONS = "risk:open_positions"

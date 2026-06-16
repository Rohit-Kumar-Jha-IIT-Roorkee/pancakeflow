"""Performance metrics: win rate, profit-after-gas, Sharpe, max drawdown.
Pure functions over a list of trade dicts (realized_pnl_usd, gas, strategy)."""
from __future__ import annotations
import math

def summarize(trades: list[dict]) -> dict:
    closed = [t for t in trades if t.get("status") == "executed"]
    n = len(closed)
    if n == 0:
        return {"trades": 0, "win_rate": 0, "total_pnl_usd": 0, "avg_profit_usd": 0,
                "profit_after_gas_usd": 0, "sharpe": 0, "max_drawdown_pct": 0, "by_strategy": {}}
    pnls = [float(t.get("realized_pnl_usd", 0) or 0) for t in closed]
    gas = [float(t.get("gas_wei", 0) or 0) / 1e18 for t in closed]
    wins = sum(1 for p in pnls if p > 0)
    total = sum(pnls)
    # equity curve -> max drawdown
    equity, peak, max_dd = 0.0, 0.0, 0.0
    for p in pnls:
        equity += p; peak = max(peak, equity)
        if peak > 0:
            max_dd = max(max_dd, (peak - equity) / peak * 100)
    mean = total / n
    sd = math.sqrt(sum((p - mean) ** 2 for p in pnls) / n) if n > 1 else 0.0
    sharpe = (mean / sd * math.sqrt(n)) if sd > 0 else 0.0
    by_strat: dict[str, dict] = {}
    for t, p in zip(closed, pnls):
        s = t.get("strategy", "?")
        d = by_strat.setdefault(s, {"trades": 0, "pnl": 0.0})
        d["trades"] += 1; d["pnl"] += p
    return {"trades": n, "win_rate": round(wins / n * 100, 1), "total_pnl_usd": round(total, 2),
            "avg_profit_usd": round(mean, 2), "profit_after_gas_usd": round(total - sum(gas), 2),
            "sharpe": round(sharpe, 2), "max_drawdown_pct": round(max_dd, 2), "by_strategy": by_strat}

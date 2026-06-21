"""Anomaly detectors -> defensive signals. Pure functions, hard thresholds."""
from __future__ import annotations
from dataclasses import dataclass

@dataclass
class Anomaly:
    kind: str; severity: str; detail: str

def oracle_divergence(pool_mid: float, oracle: float, max_bps: int = 300) -> Anomaly | None:
    if oracle <= 0: return None
    bps = abs(pool_mid - oracle) / oracle * 10000
    if bps > max_bps:
        return Anomaly("oracle_divergence", "high", f"pool vs oracle {bps:.0f}bps > {max_bps}")
    return None

def liquidity_crash(prev_liq: float, cur_liq: float, drop_pct: float = 50.0) -> Anomaly | None:
    if prev_liq <= 0: return None
    drop = (prev_liq - cur_liq) / prev_liq * 100
    if drop >= drop_pct:
        return Anomaly("liquidity_crash", "critical", f"liquidity -{drop:.0f}%")
    return None

def consecutive_failures(fail_count: int, threshold: int = 3) -> Anomaly | None:
    if fail_count >= threshold:
        return Anomaly("consecutive_failures", "critical", f"{fail_count} failed txs in a row")
    return None

def drawdown_breach(drawdown_pct: float, max_drawdown_pct: float) -> Anomaly | None:
    if drawdown_pct >= max_drawdown_pct:
        return Anomaly("drawdown_breach", "critical", f"drawdown {drawdown_pct:.1f}% >= cap {max_drawdown_pct:.1f}%")
    return None


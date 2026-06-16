"use client";
import { useEffect, useMemo, useState } from "react";
import { getJSON } from "@/lib/api";
import { useLiveFeed } from "@/lib/ws";
import { Stat } from "@/components/Stat";
import { RegimeBadge } from "@/components/RegimeBadge";
import { CircuitBreakerBanner } from "@/components/CircuitBreakerBanner";
import { AgentRail } from "@/components/AgentRail";
import { NlConsole } from "@/components/NlConsole";
import { PnlChart } from "@/components/PnlChart";

const WS = (process.env.NEXT_PUBLIC_API ?? "").replace(/^http/, "ws") + "/ws/live";

interface Summary { trades: number; win_rate: number; total_pnl_usd: number;
  profit_after_gas_usd: number; sharpe: number; max_drawdown_pct: number; by_strategy: Record<string, any> }

export default function Dashboard() {
  const { events, connected } = useLiveFeed(WS || "ws://localhost:8000/ws/live");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [market, setMarket] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [equity, setEquity] = useState<{ i: number; equity: number }[]>([]);

  async function refresh() {
    try {
      setSummary(await getJSON<Summary>("/api/portfolio/summary"));
      setMarket(await getJSON("/api/market/state"));
      setTrades(await getJSON<any[]>("/api/trades?limit=20"));
    } catch { /* API not up yet */ }
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, []);

  // react to live fills: refresh + extend equity curve
  useEffect(() => {
    const fill = events.find((e) => e.kind === "fill");
    if (fill) refresh();
    const sum = events.find((e) => e.kind === "summary");
    if (sum?.data) setSummary(sum.data);
  }, [events]);

  useEffect(() => {
    if (summary) setEquity((prev) => [...prev, { i: prev.length, equity: summary.total_pnl_usd }].slice(-60));
  }, [summary?.total_pnl_usd]);

  const breaker = market?.breaker?.state ?? "ARMED";
  const regime = market?.regime ?? "unknown";
  const recentRail = useMemo(() => events
    .filter((e) => ["proposal", "approved", "rejected", "fill"].includes(e.kind))
    .slice(0, 1).map((e) => ({ type: `trade.${e.kind === "fill" ? e.data?.status : e.kind}`,
      agent: e.kind === "proposal" ? "strategy" : e.kind === "approved" ? "risk" : "execution",
      event: e.kind, ts: e.ts, payload: e.data })), [events]);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 60px" }}>
      {/* hero: thesis is the live desk status, not a big number */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div className="eyebrow">PancakeSwap · Multi-Agent Desk</div>
          <h1 className="mono" style={{ fontSize: 28, fontWeight: 600, marginTop: 6, letterSpacing: "-.02em" }}>
            PancakeFlow<span className="signal">.</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <RegimeBadge regime={regime} />
          <span style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <span className={`pulse ${connected ? "on" : "off"}`} />
            <span className="mono faint" style={{ fontSize: 11 }}>{connected ? "LIVE" : "OFFLINE"}</span>
          </span>
        </div>
      </header>

      <CircuitBreakerBanner state={breaker} reason={market?.breaker?.reason} />

      {/* signature rail: the most recent trade's path through the agents */}
      <div className="panel" style={{ padding: "14px 20px", marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Last trade · agent pipeline</div>
        <AgentRail events={recentRail} />
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <Stat label="Net P&L" value={`$${summary?.total_pnl_usd?.toFixed(2) ?? "0.00"}`}
          accent={(summary?.total_pnl_usd ?? 0) >= 0 ? "var(--pos)" : "var(--neg)"}
          sub={`after gas $${summary?.profit_after_gas_usd?.toFixed(2) ?? "0.00"}`} />
        <Stat label="Trades" value={`${summary?.trades ?? 0}`} sub={`${summary?.win_rate ?? 0}% win rate`} />
        <Stat label="Sharpe" value={`${summary?.sharpe?.toFixed(2) ?? "0.00"}`} />
        <Stat label="Max Drawdown" value={`${summary?.max_drawdown_pct?.toFixed(1) ?? "0.0"}%`}
          accent={(summary?.max_drawdown_pct ?? 0) > 10 ? "var(--neg)" : undefined} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-head"><span className="eyebrow">Equity curve</span>
            <span className="faint mono" style={{ fontSize: 10 }}>net P&L · USD</span></div>
          <div style={{ padding: "12px 8px 8px" }}><PnlChart data={equity} /></div>
        </div>
        <NlConsole />
      </section>

      <div className="panel">
        <div className="panel-head"><span className="eyebrow">Trade log</span>
          <span className="faint mono" style={{ fontSize: 10 }}>{trades.length} recent</span></div>
        <table>
          <thead><tr><th>Strategy</th><th>Mode</th><th>Size</th><th>P&L (USD)</th><th>Status</th><th>Tx</th></tr></thead>
          <tbody>
            {trades.length === 0 && <tr><td colSpan={6} className="faint" style={{ textAlign: "center", padding: 28 }}>
              No trades yet — start the agents to begin scanning.</td></tr>}
            {trades.map((t) => (
              <tr key={t.id}>
                <td className="mono" style={{ fontSize: 12 }}>{t.strategy}</td>
                <td className="dim mono" style={{ fontSize: 11 }}>{t.mode}</td>
                <td className="num">{(Number(t.amount_in) / 1e18).toFixed(3)}</td>
                <td className={`num ${Number(t.realized_pnl_usd) >= 0 ? "pos" : "neg"}`}>
                  {Number(t.realized_pnl_usd) >= 0 ? "+" : ""}{Number(t.realized_pnl_usd).toFixed(4)}</td>
                <td><span className={`tag ${t.status}`}>{t.status}</span></td>
                <td className="faint mono" style={{ fontSize: 11 }}>
                  {t.tx_hash ? `${t.tx_hash.slice(0, 8)}…` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

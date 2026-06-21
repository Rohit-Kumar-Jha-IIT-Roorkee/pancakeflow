"use client";

import { useEffect, useState } from "react";
import { getJSON } from "@/lib/api";

export default function TradesPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getJSON<any[]>("/api/trades?limit=100")
      .then(data => { setTrades(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "32px", maxWidth: "1024px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "24px" }}>Trade Ledger</h1>

      <div className="panel" style={{ overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Trade ID</th>
              <th>Strategy</th>
              <th>Mode</th>
              <th>Status</th>
              <th>P&L (USD)</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-dim)", padding: "32px" }}>Loading…</td></tr>
            )}
            {!loading && trades.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-dim)", padding: "32px" }}>
                No trades yet — run <code>make seed</code> then <code>make agents</code> to start the paper desk.
              </td></tr>
            )}
            {!loading && trades.map((t, i) => (
              <tr key={t.id || i}>
                <td className="dim mono">{t.ts ? new Date(t.ts).toLocaleTimeString() : "—"}</td>
                <td className="mono faint">{(t.id as string)?.substring(0, 8)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{t.strategy}</td>
                <td><span className="tag">{t.mode || "paper"}</span></td>
                <td><span className={`tag ${t.status}`}>{t.status}</span></td>
                <td className={`num ${Number(t.realized_pnl_usd) > 0 ? "pos" : Number(t.realized_pnl_usd) < 0 ? "neg" : "dim"}`}>
                  {Number(t.realized_pnl_usd || 0) >= 0 ? "+" : ""}{Number(t.realized_pnl_usd || 0).toFixed(4)}
                </td>
                <td className="dim mono" style={{ fontSize: "11px" }}>
                  {t.proposal?.rationale || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

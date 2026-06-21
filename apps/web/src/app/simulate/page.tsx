"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { postJSON } from "@/lib/api";

export default function SimulatePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runBacktest = async () => {
    setLoading(true);
    try {
      const data = await postJSON<any>("/api/simulate/backtest", { minBps: 10 });
      const chartData = (data.equityCurve ?? []).map((val: number, i: number) => ({
        index: i,
        equity: val / 1e18,
      }));
      setResult({ ...data, chartData });
    } catch (e) {
      setResult({ error: String(e) });
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "32px", maxWidth: "1024px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px" }}>Backtester</h1>
          <p className="dim" style={{ fontSize: "13px", marginTop: 6 }}>
            Replays arbitrage strategy over historical pool snapshots. Requires
            <code> a_snaps</code> / <code>b_snaps</code> from a data export.
            Without snapshots the API returns an honest zero result.
          </p>
        </div>
        <button
          onClick={runBacktest}
          disabled={loading}
          style={{
            background: "var(--signal)", color: "var(--bg)", border: "none",
            padding: "8px 20px", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1, fontWeight: "bold", flexShrink: 0,
          }}
        >
          {loading ? "Running…" : "Run Backtest"}
        </button>
      </div>

      {!result && !loading && (
        <div style={{ padding: "48px", textAlign: "center", border: "1px dashed var(--line)", borderRadius: "8px", color: "var(--ink-dim)" }}>
          Click Run to simulate strategy performance over historical snapshots.
        </div>
      )}

      {result?.error && (
        <div style={{ padding: "32px", border: "1px dashed var(--neg)", borderRadius: "8px", color: "var(--neg)", fontSize: 13 }}>
          {result.error}
        </div>
      )}

      {result && !result.error && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
            {[
              { label: "Trades", value: result.trades, cls: "pos" },
              { label: "Wins", value: result.wins, cls: "pos" },
              { label: "Win Rate", value: `${result.winRate}%`, cls: "info" },
              { label: "Net Profit (WBNB)", value: (Number(result.totalProfitWei) / 1e18).toFixed(4), cls: "signal" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="panel" style={{ padding: "16px" }}>
                <div className="dim eyebrow">{label}</div>
                <div className={`num ${cls}`} style={{ fontSize: "24px", marginTop: "8px" }}>{value}</div>
              </div>
            ))}
          </div>

          {result.chartData?.length > 0 && (
            <div className="panel" style={{ padding: "24px" }}>
              <div className="panel-head" style={{ border: "none", padding: "0 0 16px 0", fontSize: "16px" }}>Equity Curve</div>
              <div style={{ height: "320px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="index" stroke="var(--ink-dim)" tick={{ fill: "var(--ink-dim)" }} />
                    <YAxis stroke="var(--ink-dim)" tick={{ fill: "var(--ink-dim)" }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--panel)", borderColor: "var(--line)" }}
                      itemStyle={{ color: "var(--ink)" }} />
                    <Line type="monotone" dataKey="equity" stroke="var(--info)" strokeWidth={2}
                      dot={false} activeDot={{ r: 6, fill: "var(--info)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {result.chartData?.length === 0 && (
            <div style={{ padding: "32px", textAlign: "center", border: "1px dashed var(--line)", borderRadius: "8px", color: "var(--ink-dim)", fontSize: 13 }}>
              {result.message || "No historical pool snapshots available. Provide a_snaps and b_snaps to the API endpoint to run a full backtest."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

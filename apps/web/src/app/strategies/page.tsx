"use client";

import { useEffect, useState } from "react";
import { getJSON } from "@/lib/api";

export default function StrategiesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      getJSON("/api/market/state")
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: "32px", maxWidth: "1024px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "24px" }}>Active Strategies & Risk</h1>

      {loading && <div className="dim">Loading state…</div>}

      {!loading && !data && (
        <div className="dim">API unreachable — is <code>make api</code> running?</div>
      )}

      {!loading && data && (
        <div style={{ display: "grid", gap: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            <div className="panel" style={{ padding: "24px" }}>
              <h2 style={{ fontSize: "16px", marginBottom: "16px" }} className="dim eyebrow">
                Market Regime (WBNB/USDT)
              </h2>
              <div style={{ fontSize: "32px", color: "var(--signal)", fontWeight: "bold" }}>
                {(data.regime || "unknown").toUpperCase()}
              </div>
              <p className="dim" style={{ marginTop: "16px", fontSize: "14px" }}>
                Arbitrage scans every cycle regardless of regime.
                Trend-following fires only on <code>trending_up</code> or <code>trending_down</code>.
              </p>
            </div>

            <div className="panel" style={{ padding: "24px" }}>
              <h2 style={{ fontSize: "16px", marginBottom: "16px" }} className="dim eyebrow">
                Circuit Breaker
              </h2>
              <div style={{
                fontSize: "32px",
                color: data.breaker?.state === "TRIPPED" ? "var(--neg)" : "var(--pos)",
                fontWeight: "bold"
              }}>
                {data.breaker?.state || "ARMED"}
              </div>
              {data.breaker?.reason && (
                <p className="neg" style={{ marginTop: "8px", fontSize: "12px" }}>{data.breaker.reason}</p>
              )}
              <p className="dim" style={{ marginTop: "16px", fontSize: "14px" }}>
                Trips on daily drawdown breach or anomaly detection. Halts all execution until reset.
              </p>
            </div>
          </div>

          <div className="panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "16px", marginBottom: "16px" }} className="dim eyebrow">
              Tracked Pools ({data.pools?.length ?? 0})
            </h2>
            {(!data.pools || data.pools.length === 0) ? (
              <div className="dim" style={{ fontSize: "14px" }}>
                No pools seeded yet — run <code>make seed</code> to inject demo market state.
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>Address</th><th>Pair</th><th>Type</th><th>Tier</th><th>Mid Price</th></tr>
                </thead>
                <tbody>
                  {data.pools.map((p: any, i: number) => (
                    <tr key={i}>
                      <td className="mono faint" style={{ fontSize: 11 }}>{(p.address || "").substring(0, 10)}…</td>
                      <td className="mono">{p.symbol0}/{p.symbol1}</td>
                      <td className="dim mono">V{p.poolType || 2}</td>
                      <td><span className="tag">{p.tier || "—"}</span></td>
                      <td className="num">{p.midPrice ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

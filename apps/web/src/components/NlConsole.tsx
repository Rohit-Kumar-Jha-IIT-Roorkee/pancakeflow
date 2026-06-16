"use client";
import { useState } from "react";
import { postJSON } from "@/lib/api";

export function NlConsole() {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a: string }[]>([]);
  const [busy, setBusy] = useState(false);
  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    const query = q; setQ("");
    try {
      const r = await postJSON<{ answer: string }>("/api/nl/query", { q: query });
      setLog((l) => [{ q: query, a: r.answer }, ...l].slice(0, 8));
    } catch { setLog((l) => [{ q: query, a: "API unreachable." }, ...l]); }
    setBusy(false);
  }
  return (
    <div className="panel">
      <div className="panel-head"><span className="eyebrow">Ask the desk</span>
        <span className="faint mono" style={{ fontSize: 10 }}>natural language</span></div>
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="show me arbitrage opportunities on BNB right now"
            className="mono" style={{ flex: 1, background: "var(--panel-2)", border: "1px solid var(--line)",
              borderRadius: 6, padding: "9px 12px", color: "var(--ink)", fontSize: 12 }} />
          <button onClick={ask} disabled={busy} className="mono" style={{ background: "var(--signal)",
            border: "none", borderRadius: 6, padding: "0 16px", color: "#1a1205", fontWeight: 600,
            fontSize: 12, cursor: "pointer" }}>{busy ? "…" : "ASK"}</button>
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {log.map((e, i) => (
            <div key={i} style={{ fontSize: 12 }}>
              <div className="faint mono" style={{ fontSize: 11 }}>→ {e.q}</div>
              <div className="dim" style={{ marginTop: 2 }}>{e.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

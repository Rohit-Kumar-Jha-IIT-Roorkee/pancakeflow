"use client";
/** Signature element: each trade's journey rendered as a horizontal rail through
 *  the agent pipeline. This is the "multi-agent collaboration visualization"
 *  bonus — it encodes the real lifecycle order, not decoration. */
const STAGES = ["strategy", "risk", "simulation", "risk", "execution"] as const;
const STAGE_LABEL: Record<string, string> = {
  strategy: "SCAN", risk: "GATE", simulation: "DRY-RUN", execution: "EXECUTE",
};

export interface RailEvent { type: string; agent?: string; event?: string; ts: number; payload?: any }

export function AgentRail({ events }: { events: RailEvent[] }) {
  // derive which stages have fired from the event log of one trade
  const fired = new Set(events.map((e) => `${e.agent}:${e.event}`));
  const approved = events.some((e) => e.type === "trade.approved");
  const executed = events.some((e) => e.type === "trade.executed");
  const failed = events.some((e) => e.type === "trade.failed" || e.event === "rejected");

  const dots = [
    { key: "scan", on: events.some((e) => e.agent === "strategy" || e.type === "trade.proposed"), label: "SCAN" },
    { key: "gate", on: fired.has("risk:sized") || fired.has("risk:gate_start"), label: "RISK GATE" },
    { key: "sim", on: events.some((e) => e.type === "simulation.result"), label: "SIM" },
    { key: "approve", on: approved, label: "APPROVE" },
    { key: "exec", on: executed, label: "EXECUTE", bad: failed && !executed },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "4px 0" }}>
      {dots.map((d, i) => (
        <div key={d.key} style={{ display: "flex", alignItems: "center", flex: i < dots.length - 1 ? 1 : "0 0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span className="pulse" style={{
              background: d.bad ? "var(--neg)" : d.on ? "var(--signal)" : "var(--ink-faint)",
              opacity: d.on || d.bad ? 1 : 0.4 }} />
            <span className="mono faint" style={{ fontSize: 8, letterSpacing: ".05em" }}>{d.label}</span>
          </div>
          {i < dots.length - 1 && (
            <div style={{ flex: 1, height: 1, margin: "0 6px", marginBottom: 12,
              background: dots[i + 1]!.on ? "var(--signal)" : "var(--line)", opacity: dots[i + 1]!.on ? .6 : 1 }} />
          )}
        </div>
      ))}
    </div>
  );
}

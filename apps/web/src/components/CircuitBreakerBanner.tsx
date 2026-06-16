"use client";
export function CircuitBreakerBanner({ state, reason }: { state: string; reason?: string }) {
  if (state !== "TRIPPED") return null;
  return (
    <div style={{ background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.4)",
      borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
      <span className="pulse" style={{ background: "var(--neg)" }} />
      <strong className="neg mono" style={{ fontSize: 12, letterSpacing: ".05em" }}>CIRCUIT BREAKER · TRADING HALTED</strong>
      <span className="dim" style={{ fontSize: 12 }}>{reason ?? "extreme market condition detected"}</span>
    </div>
  );
}

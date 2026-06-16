"use client";
export function Stat({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="panel" style={{ padding: "14px 16px" }}>
      <div className="eyebrow">{label}</div>
      <div className="num" style={{ fontSize: 26, marginTop: 6, color: accent ?? "var(--ink)" }}>{value}</div>
      {sub && <div className="faint mono" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

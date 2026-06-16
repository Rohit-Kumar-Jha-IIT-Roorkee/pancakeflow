"use client";
const MAP: Record<string, { label: string; color: string }> = {
  trending_up: { label: "TRENDING ↑", color: "var(--pos)" },
  trending_down: { label: "TRENDING ↓", color: "var(--neg)" },
  mean_reverting: { label: "MEAN-REVERTING", color: "var(--info)" },
  high_vol: { label: "HIGH VOLATILITY", color: "var(--signal)" },
  unknown: { label: "WARMING UP", color: "var(--ink-faint)" },
};
export function RegimeBadge({ regime }: { regime: string }) {
  const r = MAP[regime] ?? MAP.unknown;
  return <span className="mono" style={{ fontSize: 11, color: r.color, border: `1px solid ${r.color}33`,
    padding: "3px 9px", borderRadius: 5 }}>{r.label}</span>;
}

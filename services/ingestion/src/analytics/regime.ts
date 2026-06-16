import type { Regime } from "@pancakeflow/shared-types";

/** Regime classifier per pair, from a rolling mid-price window.
 *  Deliberately simple + deterministic (no LLM in the hot path):
 *   - variance ratio VR(q): >1 → momentum/trending, <1 → mean reversion
 *   - EMA slope sign → trend direction
 *   - realized vol percentile → high_vol override
 */
const WINDOW = 240;            // ~12 min of 3s blocks
const Q = 8;                   // variance-ratio aggregation lag

const series = new Map<string, number[]>();
const lastRegime = new Map<string, Regime>();

export function pushPrice(pairKey: string, price: number): void {
  const arr = series.get(pairKey) ?? [];
  arr.push(price);
  if (arr.length > WINDOW) arr.shift();
  series.set(pairKey, arr);
}

function varianceRatio(rets: number[], q: number): number {
  if (rets.length < q * 4) return 1;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const var1 = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  const agg: number[] = [];
  for (let i = 0; i + q <= rets.length; i += q) {
    let s = 0;
    for (let j = i; j < i + q; j++) s += rets[j]!;
    agg.push(s);
  }
  const meanQ = agg.reduce((a, b) => a + b, 0) / agg.length;
  const varQ = agg.reduce((a, b) => a + (b - meanQ) ** 2, 0) / Math.max(1, agg.length - 1);
  return var1 === 0 ? 1 : varQ / (q * var1);
}

export function classify(pairKey: string, annVol: number): { regime: Regime; changed: boolean; prev: Regime } {
  const px = series.get(pairKey) ?? [];
  const prev = lastRegime.get(pairKey) ?? "unknown";
  if (px.length < 60) return { regime: "unknown", changed: false, prev };

  const rets: number[] = [];
  for (let i = 1; i < px.length; i++) rets.push(Math.log(px[i]! / px[i - 1]!));

  const vr = varianceRatio(rets, Q);
  const emaFast = ema(px, 20), emaSlow = ema(px, 80);
  const slope = (emaFast - emaSlow) / emaSlow;

  let regime: Regime;
  if (annVol > 2.5) regime = "high_vol";                       // chaotic — risk agent tightens
  else if (vr > 1.15 && Math.abs(slope) > 0.0005) regime = slope > 0 ? "trending_up" : "trending_down";
  else if (vr < 0.85) regime = "mean_reverting";
  else regime = prev === "unknown" ? "mean_reverting" : prev;  // hysteresis: don't flap

  const changed = regime !== prev;
  lastRegime.set(pairKey, regime);
  return { regime, changed, prev };
}

function ema(xs: number[], n: number): number {
  const k = 2 / (n + 1);
  let e = xs[0]!;
  for (let i = 1; i < xs.length; i++) e = xs[i]! * k + e * (1 - k);
  return e;
}

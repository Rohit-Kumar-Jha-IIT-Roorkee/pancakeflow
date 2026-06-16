/** Tick-level EWMA volatility per pair, annualized.
 *  Fed by observed swap prices; cheap enough to run on every event. */
const LAMBDA = 0.97;
const TICKS_PER_YEAR = 365 * 24 * 60 * 20; // ~3s blocks → rough annualization for tick returns

interface VolState { lastPrice: number; ewmaVar: number }
const state = new Map<string, VolState>();

export function updateVol(pairKey: string, price: number): number {
  const s = state.get(pairKey);
  if (!s || s.lastPrice <= 0) {
    state.set(pairKey, { lastPrice: price, ewmaVar: 0 });
    return 0;
  }
  const r = Math.log(price / s.lastPrice);
  s.ewmaVar = LAMBDA * s.ewmaVar + (1 - LAMBDA) * r * r;
  s.lastPrice = price;
  return Math.sqrt(s.ewmaVar * TICKS_PER_YEAR);
}

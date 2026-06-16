import { redis, KEYS } from "./redis.js";

/** PS requirement: "Prioritize data sources by latency, freshness, historical reliability."
 *  Every source call is recorded; score ∈ [0,1] drives transport ordering and is
 *  mirrored to Redis so other agents (and the dashboard) can see source health. */
interface SourceStats { ewmaLatencyMs: number; successRate: number; lastOkTs: number; calls: number }

const ALPHA = 0.2; // EWMA smoothing

export class SourceRegistry {
  private stats = new Map<string, SourceStats>();

  record(id: string, latencyMs: number, ok: boolean): void {
    const s = this.stats.get(id) ?? { ewmaLatencyMs: latencyMs, successRate: 1, lastOkTs: 0, calls: 0 };
    s.ewmaLatencyMs = ALPHA * latencyMs + (1 - ALPHA) * s.ewmaLatencyMs;
    s.successRate = ALPHA * (ok ? 1 : 0) + (1 - ALPHA) * s.successRate;
    if (ok) s.lastOkTs = Date.now();
    s.calls += 1;
    this.stats.set(id, s);
  }

  /** latency (40%) + freshness (20%) + reliability (40%) */
  score(id: string): number {
    const s = this.stats.get(id);
    if (!s) return 0.5; // unknown sources start neutral
    const latencyScore = Math.max(0, 1 - s.ewmaLatencyMs / 2000);
    const freshness = Math.max(0, 1 - (Date.now() - s.lastOkTs) / 60_000);
    return 0.4 * latencyScore + 0.2 * freshness + 0.4 * s.successRate;
  }

  /** Sort candidate source ids best-first (used to order RPC fallback). */
  rank(ids: string[]): string[] {
    return [...ids].sort((a, b) => this.score(b) - this.score(a));
  }

  async flushToRedis(): Promise<void> {
    const out: Record<string, string> = {};
    for (const [id, s] of this.stats) out[id] = JSON.stringify({ ...s, score: this.score(id) });
    if (Object.keys(out).length) await redis.hset(KEYS.sources, out);
  }
}

export const sources = new SourceRegistry();

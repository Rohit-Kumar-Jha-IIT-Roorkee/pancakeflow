import { redis, KEYS } from "../redis.js";
import { sources } from "../sourceRegistry.js";
import { cfg } from "../config.js";

/** Binance reference prices — second sanity anchor + future stat-arb input. */
const SYMBOLS = ["BNBUSDT", "CAKEUSDT", "ETHUSDT", "BTCUSDT"];

export async function pollCex(): Promise<void> {
  const t0 = performance.now();
  try {
    const url = `${cfg.BINANCE_API}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(SYMBOLS))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`cex http ${res.status}`);
    const rows = (await res.json()) as Array<{ symbol: string; price: string }>;
    sources.record("cex:binance", performance.now() - t0, true);
    const pipe = redis.pipeline();
    for (const r of rows) pipe.hset(KEYS.cex(r.symbol), { price: r.price, updatedAt: String(Date.now()) });
    await pipe.exec();
  } catch {
    sources.record("cex:binance", performance.now() - t0, false);
  }
}

import { redis, STREAM_TRADE, UI_CHANNEL } from "./redis.js";
import { cfg } from "./config.js";
import { logger } from "./logger.js";
import { paperFill } from "./modes/paper.js";
import type { SizedTrade, Fill } from "./types.js";

/** Execution Agent (A3) — the only component holding the signer key. Consumes
 *  trade.approved (never trade.proposed: it physically cannot act on an
 *  unapproved trade), executes in the configured mode, emits trade.executed/
 *  failed. On-chain executor is lazily constructed so paper mode needs no key. */

let onchain: { execute(s: SizedTrade): Promise<Fill>; pause(): Promise<void> } | null = null;
async function getOnchain() {
  if (!onchain) {
    const { OnchainExecutor } = await import("./modes/onchain.js");
    onchain = new OnchainExecutor();
  }
  return onchain;
}

async function execute(sized: SizedTrade): Promise<Fill> {
  if (cfg.EXEC_MODE === "paper") return paperFill(sized);
  try {
    return await (await getOnchain()).execute(sized);
  } catch (e) {
    return { tradeId: sized.proposal.id, status: "failed", mode: cfg.EXEC_MODE,
      amountInWei: sized.sizedAmountWei, amountOutWei: "0", gasWei: "0",
      failReason: String(e).slice(0, 120) };
  }
}

async function publishFill(type: string, fill: Fill): Promise<void> {
  await redis.xadd(STREAM_TRADE, "MAXLEN", "~", "20000", "*",
    "id", crypto.randomUUID(), "type", type, "ts", String(Date.now()),
    "source", "execution", "payload", JSON.stringify(fill));
  await redis.publish(UI_CHANNEL, JSON.stringify({ kind: "fill",
    data: { id: fill.tradeId, status: fill.status, mode: fill.mode, txHash: fill.txHash }, ts: Date.now() }));
}

async function main(): Promise<void> {
  await redis.connect();
  logger.info({ mode: cfg.EXEC_MODE }, "execution service online");
  const group = "execution";
  try { await redis.xgroup("CREATE", STREAM_TRADE, group, "0", "MKSTREAM"); }
  catch (e) { if (!String(e).includes("BUSYGROUP")) throw e; }

  // circuit-breaker subscription: pause on-chain when risk trips
  const sub = redis.duplicate();
  await sub.subscribe(UI_CHANNEL);
  sub.on("message", async (_ch, msg) => {
    try {
      const ev = JSON.parse(msg);
      if (ev.kind === "circuit_breaker" && ev.data?.state === "TRIPPED" && cfg.EXEC_MODE !== "paper") {
        logger.warn("circuit breaker tripped -> pausing ArbExecutor on-chain");
        await (await getOnchain()).pause().catch((e) => logger.error({ e: String(e) }, "pause failed"));
      }
    } catch { /* ignore */ }
  });

  while (true) {
    const resp = await redis.xreadgroup("GROUP", group, "exec-1", "COUNT", "8", "BLOCK", "1000",
      "STREAMS", STREAM_TRADE, ">") as [string, [string, string[]][]][] | null;
    if (!resp) continue;
    for (const [, entries] of resp) {
      for (const [entryId, fields] of entries) {
        const f: Record<string, string> = {};
        for (let i = 0; i + 1 < fields.length; i += 2) f[fields[i]!] = fields[i + 1]!;
        if (f.type === "trade.approved" && f.payload) {
          try {
            const sized = JSON.parse(f.payload) as SizedTrade;
            const fill = await execute(sized);
            await publishFill(fill.status === "executed" ? "trade.executed" : "trade.failed", fill);
            logger.info({ id: fill.tradeId, status: fill.status, tx: fill.txHash }, "fill");
          } catch (e) { logger.error({ e: String(e) }, "execute error"); }
        }
        await redis.xack(STREAM_TRADE, group, entryId);
      }
    }
  }
}
main().catch((e) => { logger.error({ e: String(e) }, "fatal"); process.exit(1); });

import { randomUUID } from "node:crypto";
import type { MarketEventType } from "@pancakeflow/shared-types";
import { redis, KEYS } from "./redis.js";

/** Append an event to the market stream (capped, approximate trim).
 *  Consumers (agents) read via consumer groups => replayable decision trail. */
export async function publish(type: MarketEventType, source: string, payload: Record<string, unknown>): Promise<void> {
  await redis.xadd(
    KEYS.stream, "MAXLEN", "~", "20000", "*",
    "id", randomUUID(), "type", type, "ts", String(Date.now()), "source", source, "payload", JSON.stringify(payload),
  );
}

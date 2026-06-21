import { Redis } from "ioredis";
import { cfg } from "./config.js";
export const redis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
export const STREAM_TRADE = "events:trade";
export const UI_CHANNEL = "ui:push";
export const KEY_POSITIONS = "risk:open_positions";

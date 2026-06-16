"use client";
import { useEffect, useRef, useState } from "react";

export interface UIEvent { kind: string; data: any; ts: number }

/** Subscribes to the API WS, returns the latest event + a rolling log. */
export function useLiveFeed(wsUrl: string) {
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const ref = useRef<WebSocket | null>(null);
  useEffect(() => {
    let stop = false;
    function connect() {
      const ws = new WebSocket(wsUrl);
      ref.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); if (!stop) setTimeout(connect, 1500); };
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as UIEvent;
          setEvents((prev) => [ev, ...prev].slice(0, 200));
        } catch { /* ignore */ }
      };
    }
    connect();
    return () => { stop = true; ref.current?.close(); };
  }, [wsUrl]);
  return { events, connected };
}

"use client";

import { useEffect, useState, useMemo } from "react";
import ReactFlow, { Background, Controls, Handle, Position, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { getJSON } from "@/lib/api";

const CustomNode = ({ data }: { data: any }) => (
  <div style={{
    background: "var(--panel)",
    border: `2px solid ${data.color}`,
    padding: "12px",
    borderRadius: "8px",
    minWidth: "180px",
    color: "var(--ink)",
  }}>
    <Handle type="target" position={Position.Left} style={{ background: "transparent", border: "none" }} />
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: data.color }} />
      <strong className="mono" style={{ fontSize: "12px", textTransform: "uppercase" }}>{data.label}</strong>
    </div>
    <div className="dim mono" style={{ fontSize: "10px" }}>{data.subtext}</div>
    <Handle type="source" position={Position.Right} style={{ background: "transparent", border: "none" }} />
  </div>
);

const nodeTypes = { custom: CustomNode };

function colorFor(type: string): string {
  if (type.includes("proposed")) return "var(--signal)";
  if (type.includes("sized") || type.includes("simulation")) return "var(--info)";
  if (type.includes("approved")) return "var(--pos)";
  if (type.includes("rejected") || type.includes("failed")) return "var(--neg)";
  if (type.includes("executed")) return "#86efac";
  return "var(--line)";
}

export default function AgentsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      getJSON<any[]>("/api/agents/timeline")
        .then(data => { setEvents(data); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!events || events.length === 0) return { nodes: [], edges: [] };

    const byTrade: Record<string, any[]> = {};
    events.forEach(e => {
      const tid = e.trade_id || e.id || e.tradeId;
      if (tid) { (byTrade[tid] = byTrade[tid] || []).push(e); }
    });

    const outNodes: any[] = [];
    const outEdges: any[] = [];
    let yOffset = 50;

    Object.entries(byTrade).forEach(([tid, tradeEvents]) => {
      let xOffset = 50;
      let prevId: string | null = null;
      tradeEvents.forEach((ev, j) => {
        const nodeId = `${tid}-${j}`;
        const color = colorFor(ev.type);
        outNodes.push({
          id: nodeId, type: "custom",
          position: { x: xOffset, y: yOffset },
          data: { label: ev.type.replace("trade.", "").replace("agent.", ""), subtext: tid.substring(0, 8), color },
        });
        if (prevId) {
          outEdges.push({
            id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, animated: true,
            style: { stroke: color, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color },
          });
        }
        prevId = nodeId;
        xOffset += 250;
      });
      yOffset += 150;
    });

    return { nodes: outNodes, edges: outEdges };
  }, [events]);

  return (
    <div style={{ padding: "32px", height: "calc(100vh - 70px)", display: "flex", flexDirection: "column" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "24px", maxWidth: "1024px", margin: "0 auto 24px auto", width: "100%" }}>
        Agent Decision DAG
      </h1>

      <div className="panel" style={{ flexGrow: 1, overflow: "hidden", position: "relative" }}>
        {loading && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--ink-dim)" }}>Loading timeline…</div>
        )}
        {!loading && nodes.length === 0 && (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--ink-dim)", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ marginBottom: 12, fontSize: 20 }}>No agent events yet</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Run <code>make seed</code> to inject demo market state, then <code>make agents</code>
              to start the paper trading desk. Each trade that flows through the pipeline will
              appear here as a live decision graph.
            </div>
          </div>
        )}
        {!loading && nodes.length > 0 && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            style={{ background: "var(--bg)" }}
          >
            <Background color="var(--line)" gap={16} />
            <Controls style={{ background: "var(--panel)", border: "1px solid var(--line)", fill: "var(--ink)" }} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

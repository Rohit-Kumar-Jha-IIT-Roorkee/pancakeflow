"use client";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";

export function PnlChart({ data }: { data: { i: number; equity: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="i" stroke="#5a6172" tick={{ fontSize: 10, fontFamily: "monospace" }} />
        <YAxis stroke="#5a6172" tick={{ fontSize: 10, fontFamily: "monospace" }} />
        <ReferenceLine y={0} stroke="#232936" />
        <Tooltip contentStyle={{ background: "#14171f", border: "1px solid #232936", borderRadius: 6,
          fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8b93a4" }} />
        <Line type="monotone" dataKey="equity" stroke="#f2a93b" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

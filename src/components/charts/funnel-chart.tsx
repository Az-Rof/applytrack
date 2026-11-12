"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FunnelStage } from "@/lib/services/analytics";
import { statusChartColor } from "@/lib/status";

export function FunnelChart({ data }: { data: FunnelStage[] }) {
  const chartData = data.map((d) => ({ stage: d.stage, label: d.label, count: d.count }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 18 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={104}
          />
          <Tooltip
            formatter={(value) => [`${value}`, "Reached"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
            {chartData.map((d, i) => (
              <Cell key={d.stage} fill={statusChartColor(d.stage, i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

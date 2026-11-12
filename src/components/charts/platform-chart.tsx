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

const COLORS = ["#2f7df6", "#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"];

export function PlatformChart({
  data,
}: {
  data: { platform: string; interviewRate: number; applications: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
          <XAxis
            type="number"
            unit="%"
            tickLine={false}
            axisLine={false}
            fontSize={12}
          />
          <YAxis
            type="category"
            dataKey="platform"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={76}
          />
          <Tooltip
            formatter={(value) => [`${value}%`, "Interview rate"]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Bar dataKey="interviewRate" radius={[0, 6, 6, 0]} barSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

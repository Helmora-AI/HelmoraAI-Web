import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UsageBucket } from "../lib/api/types";

export type UsageMetric = "requests" | "tokens" | "cost" | "latency";

export default function UsageChart({ buckets, metric }: { buckets: UsageBucket[]; metric: UsageMetric }) {
  if (!buckets.length) return <div className="chart-empty">Usage history will appear after the first inference request.</div>;

  const ariaLabel = metricLabel(metric);
  if (metric === "tokens") {
    return (
      <div className="usage-chart" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="inputFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ctrl-blue)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--ctrl-blue)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="outputFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ctrl-violet)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--ctrl-violet)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--ctrl-line)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "var(--ctrl-raised)", border: "1px solid var(--ctrl-line)", borderRadius: 8, fontSize: 12 }} />
            <Legend />
            <Area type="monotone" dataKey="input_tokens" name="Input tokens" stroke="var(--ctrl-blue)" fill="url(#inputFill)" strokeWidth={2} />
            <Area type="monotone" dataKey="output_tokens" name="Output tokens" stroke="var(--ctrl-violet)" fill="url(#outputFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (metric === "latency") {
    return (
      <div className="usage-chart" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--ctrl-line)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "var(--ctrl-raised)", border: "1px solid var(--ctrl-line)", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="average_latency_ms" name="Avg latency (ms)" stroke="var(--ctrl-coral)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (metric === "cost") {
    return (
      <div className="usage-chart" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--ctrl-line)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "var(--ctrl-raised)", border: "1px solid var(--ctrl-line)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="cost_usd" name="Known estimated cost (USD)" fill="var(--ctrl-control)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="usage-chart" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--ctrl-line)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "var(--ctrl-raised)", border: "1px solid var(--ctrl-line)", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="requests" name="Requests" fill="var(--ctrl-control)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function metricLabel(metric: UsageMetric): string {
  switch (metric) {
    case "requests": return "Daily request volume over the selected period";
    case "tokens": return "Daily input and output token volume over the selected period";
    case "cost": return "Daily estimated catalog cost in USD over the selected period";
    case "latency": return "Daily average latency in milliseconds over the selected period";
  }
}

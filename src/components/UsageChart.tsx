import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { ReactNode } from "react";
import type { UsageBucket } from "../lib/api/types";

export type UsageMetric = "requests" | "tokens" | "cost" | "latency";

interface UsageChartProps {
  buckets: UsageBucket[];
  metric: UsageMetric;
  height?: number;
}

const axisTick = { fill: "var(--ctrl-faint)", fontSize: 10 };
const tooltipStyle = {
  background: "var(--ctrl-raised)",
  border: "1px solid var(--ctrl-line)",
  borderRadius: 10,
  boxShadow: "var(--ctrl-shadow)",
  fontSize: 12,
};
const chartMargin = { top: 12, right: 8, bottom: 0, left: -12 };

export default function UsageChart({ buckets, metric, height = 240 }: UsageChartProps) {
  if (!buckets.length) return <div className="chart-empty" role="status">Usage history will appear after the first inference request.</div>;

  const label = metricLabel(metric);
  if (metric === "tokens") {
    return (
      <ChartShell label={label} height={height}>
        <AreaChart data={buckets} margin={chartMargin}>
          <defs>
            <linearGradient id="inputFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ctrl-blue)" stopOpacity={0.34} />
              <stop offset="100%" stopColor="var(--ctrl-blue)" stopOpacity={0.015} />
            </linearGradient>
            <linearGradient id="outputFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ctrl-violet)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--ctrl-violet)" stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <ChartGrid />
          <ChartAxes />
          <ChartTooltip formatter={(value) => formatCompact(Number(value))} />
          <Legend iconType="circle" iconSize={7} />
          <Area type="monotone" dataKey="input_tokens" name="Input tokens" stroke="var(--ctrl-blue)" fill="url(#inputFill)" strokeWidth={2} animationDuration={500} />
          <Area type="monotone" dataKey="output_tokens" name="Output tokens" stroke="var(--ctrl-violet)" fill="url(#outputFill)" strokeWidth={2} animationDuration={620} />
        </AreaChart>
      </ChartShell>
    );
  }

  if (metric === "latency") {
    return (
      <ChartShell label={label} height={height}>
        <LineChart data={buckets} margin={chartMargin}>
          <ChartGrid />
          <ChartAxes />
          <ChartTooltip formatter={(value) => [`${Math.round(Number(value))} ms`, "Average latency"]} />
          <Line type="monotone" dataKey="average_latency_ms" name="Avg latency" stroke="var(--ctrl-coral)" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls animationDuration={580} />
        </LineChart>
      </ChartShell>
    );
  }

  if (metric === "cost") {
    return (
      <ChartShell label={label} height={height}>
        <ComposedChart data={buckets} margin={chartMargin}>
          <ChartGrid />
          <ChartAxes />
          <ChartTooltip formatter={(value, name) => name === "Known estimate" ? [formatCost(Number(value)), name] : [Number(value), name]} />
          <Legend iconType="circle" iconSize={7} />
          <Bar dataKey="cost_usd" name="Known estimate" fill="var(--ctrl-control)" radius={[5, 5, 0, 0]} animationDuration={500} />
          <Line type="monotone" dataKey="unknown_cost_requests" name="Unknown pricing" stroke="var(--ctrl-amber)" strokeWidth={1.8} dot={false} animationDuration={620} />
        </ComposedChart>
      </ChartShell>
    );
  }

  return (
    <ChartShell label={label} height={height}>
      <BarChart data={buckets} margin={chartMargin}>
        <ChartGrid />
        <ChartAxes />
        <ChartTooltip />
        <Legend iconType="circle" iconSize={7} />
        <Bar dataKey="successful" stackId="status" name="Successful" fill="var(--ctrl-control)" animationDuration={450} />
        <Bar dataKey="failed" stackId="status" name="Failed" fill="var(--ctrl-danger)" animationDuration={520} />
        <Bar dataKey="cancelled" stackId="status" name="Cancelled" fill="var(--ctrl-faint)" animationDuration={580} />
        <Bar dataKey="partial" stackId="status" name="Partial" fill="var(--ctrl-amber)" radius={[4, 4, 0, 0]} animationDuration={640} />
      </BarChart>
    </ChartShell>
  );
}

function ChartShell({ label, height, children }: { label: string; height: number; children: ReactNode }) {
  return (
    <div className="usage-chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
}

function ChartTooltip(props: Partial<TooltipProps>) {
  return <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} {...props} />;
}

function ChartGrid() {
  return <CartesianGrid stroke="var(--ctrl-line)" strokeDasharray="3 5" vertical={false} />;
}

function ChartAxes() {
  return (
    <>
      <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} minTickGap={22} tickFormatter={formatAxisDate} />
      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={42} tickFormatter={(value) => formatCompact(Number(value))} />
    </>
  );
}

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatDate(value: unknown): string {
  return formatAxisDate(String(value));
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCost(value: number): string {
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function metricLabel(metric: UsageMetric): string {
  switch (metric) {
    case "requests": return "Daily request outcomes over the selected period";
    case "tokens": return "Daily input and output token volume over the selected period";
    case "cost": return "Daily estimated catalog cost and unknown pricing coverage over the selected period";
    case "latency": return "Daily average latency in milliseconds over the selected period";
  }
}

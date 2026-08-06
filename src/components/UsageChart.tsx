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
import { formatAxisValue, formatTooltipValue, type UsageMetric } from "../lib/usageChartStats";
import { prefersReducedMotion } from "../lib/reducedMotion";

export type { UsageMetric } from "../lib/usageChartStats";

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

  const reduced = prefersReducedMotion();
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
          <ChartAxes metric={metric} />
          <ChartTooltip metric={metric} />
          <ChartLegend />
          <Area type="monotone" dataKey="input_tokens" name="Input tokens" stroke="var(--ctrl-blue)" fill="url(#inputFill)" strokeWidth={2} animationDuration={460} animationBegin={0} animationEasing="ease-out" isAnimationActive={!reduced} />
          <Area type="monotone" dataKey="output_tokens" name="Output tokens" stroke="var(--ctrl-violet)" fill="url(#outputFill)" strokeWidth={2} animationDuration={460} animationBegin={80} animationEasing="ease-out" isAnimationActive={!reduced} />
        </AreaChart>
      </ChartShell>
    );
  }

  if (metric === "latency") {
    return (
      <ChartShell label={label} height={height}>
        <LineChart data={buckets} margin={chartMargin}>
          <ChartGrid />
          <ChartAxes metric={metric} />
          <ChartTooltip metric={metric} />
          <ChartLegend />
          <Line type="monotone" dataKey="average_latency_ms" name="Avg latency" stroke="var(--ctrl-coral)" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls animationDuration={480} animationBegin={0} animationEasing="ease-out" isAnimationActive={!reduced} />
        </LineChart>
      </ChartShell>
    );
  }

  if (metric === "cost") {
    return (
      <ChartShell label={label} height={height}>
        <ComposedChart data={buckets} margin={chartMargin}>
          <ChartGrid />
          <ChartAxes metric={metric} />
          <ChartTooltip metric={metric} />
          <ChartLegend />
          <Bar yAxisId="usd" dataKey="cost_usd" name="Known estimate" fill="var(--ctrl-control)" radius={[5, 5, 0, 0]} animationDuration={420} animationBegin={0} animationEasing="ease-out" isAnimationActive={!reduced} />
          <Line yAxisId="count" type="monotone" dataKey="unknown_cost_requests" name="Unknown pricing" stroke="var(--ctrl-amber)" strokeWidth={1.8} dot={false} animationDuration={460} animationBegin={80} animationEasing="ease-out" isAnimationActive={!reduced} />
        </ComposedChart>
      </ChartShell>
    );
  }

  return (
    <ChartShell label={label} height={height}>
      <BarChart data={buckets} margin={chartMargin}>
        <ChartGrid />
        <ChartAxes metric={metric} />
        <ChartTooltip metric={metric} />
        <ChartLegend />
        <Bar dataKey="successful" stackId="status" name="Successful" fill="var(--ctrl-control)" animationDuration={420} animationBegin={0} animationEasing="ease-out" isAnimationActive={!reduced} />
        <Bar dataKey="failed" stackId="status" name="Failed" fill="var(--ctrl-danger)" animationDuration={420} animationBegin={60} animationEasing="ease-out" isAnimationActive={!reduced} />
        <Bar dataKey="cancelled" stackId="status" name="Cancelled" fill="var(--ctrl-faint)" animationDuration={420} animationBegin={120} animationEasing="ease-out" isAnimationActive={!reduced} />
        <Bar dataKey="partial" stackId="status" name="Partial" fill="var(--ctrl-amber)" radius={[4, 4, 0, 0]} animationDuration={420} animationBegin={180} animationEasing="ease-out" isAnimationActive={!reduced} />
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

function ChartTooltip({ metric, ...props }: { metric: UsageMetric } & Partial<TooltipProps>) {
  return (
    <Tooltip
      contentStyle={tooltipStyle}
      labelFormatter={formatDate}
      formatter={(value, name) => {
        const text = formatTooltipValue(metric, Number(value), name == null ? undefined : String(name));
        return name == null ? text : [text, name];
      }}
      {...props}
    />
  );
}

function ChartLegend() {
  return (
    <Legend
      iconType="circle"
      iconSize={7}
      formatter={(value) => <span style={{ color: "var(--ctrl-muted)" }}>{value}</span>}
    />
  );
}

function ChartGrid() {
  return <CartesianGrid stroke="var(--ctrl-line)" strokeDasharray="3 5" vertical={false} />;
}

function ChartAxes({ metric }: { metric: UsageMetric }) {
  if (metric === "cost") {
    return (
      <>
        <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} minTickGap={22} tickFormatter={formatAxisDate} />
        <YAxis yAxisId="usd" orientation="left" tick={axisTick} axisLine={false} tickLine={false} width={50} tickFormatter={(value) => formatAxisValue("cost", value)} />
        <YAxis yAxisId="count" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(value) => formatAxisValue("requests", value)} />
      </>
    );
  }
  return (
    <>
      <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} minTickGap={22} tickFormatter={formatAxisDate} />
      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} tickFormatter={(value) => formatAxisValue(metric, value)} />
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

function metricLabel(metric: UsageMetric): string {
  switch (metric) {
    case "requests": return "Daily request outcomes over the selected period";
    case "tokens": return "Daily input and output token volume over the selected period";
    case "cost": return "Daily estimated catalog cost and unknown pricing coverage over the selected period";
    case "latency": return "Daily average latency in milliseconds over the selected period";
  }
}

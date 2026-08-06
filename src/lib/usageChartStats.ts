import type { UsageBucket } from "./api/types";
import { formatNumber, formatUsd } from "./usageFormatting";

export type UsageMetric = "requests" | "tokens" | "cost" | "latency";

export interface UsageAggregate {
  requests: number;
  successful: number;
  failed: number;
  cancelled: number;
  partial?: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  complete_cost_requests?: number;
  partial_cost_requests?: number;
  unknown_cost_requests?: number;
  legacy_cost_requests?: number;
  average_latency_ms: number | null;
  physical_attempts?: number;
}

export type UsageStatSource = Partial<UsageAggregate>;

export interface UsageCostCounts {
  cost_usd: number;
  complete_cost_requests?: number;
  partial_cost_requests?: number;
  unknown_cost_requests?: number;
  legacy_cost_requests?: number;
}

export interface UsageTableColumn {
  key: string;
  header: string;
  numeric?: boolean;
}

export interface UsageTableRow {
  date: string;
  cells: Record<string, string>;
}

export function summarizeBuckets(buckets: UsageBucket[]): UsageAggregate {
  const aggregate: UsageAggregate = {
    requests: 0,
    successful: 0,
    failed: 0,
    cancelled: 0,
    partial: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    complete_cost_requests: 0,
    partial_cost_requests: 0,
    unknown_cost_requests: 0,
    legacy_cost_requests: 0,
    average_latency_ms: null,
  };
  let latencySum = 0;
  let latencyWeight = 0;
  for (const bucket of buckets) {
    aggregate.requests += bucket.requests;
    aggregate.successful += bucket.successful;
    aggregate.failed += bucket.failed;
    aggregate.cancelled += bucket.cancelled;
    aggregate.partial = (aggregate.partial ?? 0) + (bucket.partial ?? 0);
    aggregate.input_tokens += bucket.input_tokens;
    aggregate.output_tokens += bucket.output_tokens;
    aggregate.total_tokens += bucket.total_tokens;
    aggregate.cost_usd += bucket.cost_usd;
    aggregate.complete_cost_requests = (aggregate.complete_cost_requests ?? 0) + (bucket.complete_cost_requests ?? 0);
    aggregate.partial_cost_requests = (aggregate.partial_cost_requests ?? 0) + (bucket.partial_cost_requests ?? 0);
    aggregate.unknown_cost_requests = (aggregate.unknown_cost_requests ?? 0) + (bucket.unknown_cost_requests ?? 0);
    aggregate.legacy_cost_requests = (aggregate.legacy_cost_requests ?? 0) + (bucket.legacy_cost_requests ?? 0);
    if (bucket.average_latency_ms != null && bucket.requests > 0) {
      latencySum += bucket.average_latency_ms * bucket.requests;
      latencyWeight += bucket.requests;
    }
  }
  if (latencyWeight > 0) aggregate.average_latency_ms = latencySum / latencyWeight;
  return aggregate;
}

export function formatCardStat(metric: UsageMetric, source?: UsageStatSource): string {
  if (!source) return "—";
  switch (metric) {
    case "requests": return formatNumber(source.requests ?? 0);
    case "tokens": return formatNumber(source.total_tokens ?? (source.input_tokens ?? 0) + (source.output_tokens ?? 0));
    case "cost": return formatSummaryCostText(source);
    case "latency": return source.average_latency_ms == null ? "—" : `${Math.round(source.average_latency_ms)} ms`;
  }
}

export function formatCardNote(metric: UsageMetric, source?: UsageStatSource): string {
  if (!source) return "—";
  switch (metric) {
    case "requests": return `${formatNumber(source.successful ?? 0)} successful`;
    case "tokens": return `${formatNumber(source.input_tokens ?? 0)} in · ${formatNumber(source.output_tokens ?? 0)} out`;
    case "cost": return formatSummaryCostNote(source);
    case "latency": return source.physical_attempts == null ? "Average daily latency" : `${formatNumber(source.physical_attempts)} physical attempts`;
  }
}

export function formatSummaryCostText(source?: Partial<UsageCostCounts>): string {
  if (!source) return "—";
  const cost = source.cost_usd ?? 0;
  const hasKnown = (source.complete_cost_requests ?? 0) > 0 || (source.partial_cost_requests ?? 0) > 0;
  if (!hasKnown && cost === 0) return "Unknown";
  if (hasKnown && cost === 0) return "Free";
  return formatUsd(cost);
}

export function formatSummaryCostNote(source?: Partial<UsageCostCounts>): string {
  if (!source) return "Catalog estimate";
  const complete = source.complete_cost_requests ?? 0;
  const partial = source.partial_cost_requests ?? 0;
  const unknown = source.unknown_cost_requests ?? 0;
  const legacy = source.legacy_cost_requests ?? 0;

  const parts: string[] = [];
  if (partial > 0) parts.push(`${partial} partial pricing`);
  if (unknown > 0) parts.push(`${unknown} unknown pricing`);
  if (legacy > 0) parts.push(`${legacy} legacy estimate`);

  if (parts.length > 0) return parts.join(" · ");
  if (complete > 0) return "Complete catalog estimate";
  return "Catalog estimate";
}

export function formatAxisValue(metric: UsageMetric, value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  switch (metric) {
    case "cost": return formatCompactCurrency(n);
    case "latency": return formatLatencyAxis(n);
    default: return formatCompactNumber(n);
  }
}

export function formatTooltipValue(metric: UsageMetric, value: number | string, name?: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  switch (metric) {
    case "cost": return name === "Known estimate" ? formatUsd(n) : formatNumber(n);
    case "latency": return `${Math.round(n)} ms`;
    default: return formatNumber(n);
  }
}

export function formatDateKey(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function usageTableColumns(metric: UsageMetric): UsageTableColumn[] {
  switch (metric) {
    case "requests":
      return [
        { key: "requests", header: "Requests", numeric: true },
        { key: "successful", header: "Successful", numeric: true },
        { key: "failed", header: "Failed", numeric: true },
        { key: "cancelled", header: "Cancelled", numeric: true },
        { key: "partial", header: "Partial", numeric: true },
      ];
    case "tokens":
      return [
        { key: "input_tokens", header: "Input", numeric: true },
        { key: "output_tokens", header: "Output", numeric: true },
        { key: "total_tokens", header: "Total", numeric: true },
      ];
    case "cost":
      return [
        { key: "cost_usd", header: "Cost", numeric: true },
        { key: "complete_cost_requests", header: "Known", numeric: true },
        { key: "partial_cost_requests", header: "Partial pricing", numeric: true },
        { key: "unknown_cost_requests", header: "Unknown pricing", numeric: true },
        { key: "legacy_cost_requests", header: "Legacy", numeric: true },
      ];
    case "latency":
      return [
        { key: "average_latency_ms", header: "Avg latency", numeric: true },
        { key: "requests", header: "Requests", numeric: true },
      ];
  }
}

export function usageTableRows(metric: UsageMetric, buckets: UsageBucket[]): UsageTableRow[] {
  const columns = usageTableColumns(metric);
  return buckets.map((bucket) => {
    const cells: Record<string, string> = {};
    for (const column of columns) {
      cells[column.key] = formatTableCell(metric, column.key, bucket);
    }
    return { date: formatDateKey(bucket.date), cells };
  });
}

function formatTableCell(metric: UsageMetric, key: string, bucket: UsageBucket): string {
  switch (key) {
    case "cost_usd": return formatUsd(bucket.cost_usd);
    case "average_latency_ms": return bucket.average_latency_ms == null ? "—" : `${Math.round(bucket.average_latency_ms)} ms`;
    default: {
      const value = bucket[key as keyof UsageBucket];
      return typeof value === "number" ? formatNumber(value) : "0";
    }
  }
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatLatencyAxis(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}s`;
  return `${Math.round(value)}ms`;
}

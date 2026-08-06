import type { CostCoverage, CostSource, UsageRequest } from "../lib/api/types";

export function formatNumber(value = 0): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatEstimatedCost(request: Pick<UsageRequest, "cost_usd" | "cost_known"> & {
  cost_source?: UsageRequest["cost_source"] | undefined;
  cost_coverage?: CostCoverage | undefined;
}): string {
  if (request.cost_source === "legacy_estimate") {
    if (typeof request.cost_usd === "number" && request.cost_usd > 0) {
      return `${formatUsd(request.cost_usd)} (Legacy estimate)`;
    }
    return "Legacy estimate";
  }
  if (request.cost_coverage === "unknown" || request.cost_source === "unknown_pricing") {
    return "Unknown";
  }
  if (request.cost_coverage === "partial" || request.cost_source === "partial_pricing") {
    const cost = request.cost_usd ?? 0;
    return `${formatUsd(cost)} known subtotal · partial`;
  }
  if (request.cost_coverage === "complete" || request.cost_known === true) {
    const cost = request.cost_usd ?? 0;
    if (cost === 0) return "Free";
    return formatUsd(cost);
  }
  if (request.cost_known === false) {
    return "Unknown";
  }
  return formatUsd(request.cost_usd ?? 0);
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "Unknown";
  const abs = Math.abs(value);
  const maximumFractionDigits = abs > 0 && abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
    minimumFractionDigits: abs === 0 ? 2 : undefined,
  }).format(value);
}

export function formatCostSource(source?: CostSource): string {
  switch (source) {
    case "catalog_provider_usage": return "Catalog · provider usage";
    case "catalog_estimated_usage": return "Catalog · estimated usage";
    case "unknown_pricing": return "Unknown pricing";
    case "partial_pricing": return "Partial pricing";
    case "legacy_estimate": return "Legacy estimate";
    default: return "Unknown";
  }
}

export function formatUsageSource(source?: string): string {
  switch (source) {
    case "provider": return "Provider usage";
    case "estimated": return "Estimated usage";
    case "unknown": return "Unknown";
    default: return "Unknown";
  }
}

export function totalTokens(request: Pick<UsageRequest, "prompt_tokens" | "completion_tokens" | "total_tokens">): number {
  if (typeof request.total_tokens === "number") return request.total_tokens;
  return Number(request.prompt_tokens ?? 0) + Number(request.completion_tokens ?? 0);
}

export function successRate(summary: { requests?: number; successful?: number; success_rate?: number }): string {
  if (typeof summary.success_rate === "number") return `${(summary.success_rate * 100).toFixed(1)}%`;
  if (!summary.requests) return "0.0%";
  return `${((summary.successful ?? 0) / summary.requests * 100).toFixed(1)}%`;
}

export function formatProtocolLabel(protocol: string): string {
  switch (protocol) {
    case "openai-chat": return "OpenAI Chat Completions";
    case "openai-responses": return "OpenAI Responses";
    case "anthropic-messages": return "Anthropic Messages";
    case "legacy-completions": return "Legacy Completions";
    case "embeddings": return "Embeddings";
    case "helmora-native": return "Helmora Native";
    default: return protocol;
  }
}

export function formatModelSubtext(request: { selected_provider?: string | null; selected_model?: string | null }): string {
  const provider = request.selected_provider?.trim();
  const model = request.selected_model?.trim();
  if (provider && model) {
    if (provider === model) return provider;
    return `${provider} · ${model}`;
  }
  if (provider) return provider;
  if (model) return model;
  return "—";
}

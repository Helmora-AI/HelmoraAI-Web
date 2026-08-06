import type { ReactNode } from "react";
import { ApiError } from "../lib/api/client";
import { formatUsd } from "../lib/usageFormatting";

export function InlineAlert({ title, children, tone = "error" }: { title: string; children?: ReactNode; tone?: "error" | "warning" | "info" | "success" }) {
  return (
    <div className={`inline-alert inline-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="inline-alert__mark" aria-hidden="true">{tone === "success" ? "✓" : tone === "info" ? "i" : "!"}</span>
      <div><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>
    </div>
  );
}

export function RequestError({ error }: { error: unknown }) {
  const normalized = error instanceof ApiError ? error : undefined;
  const costLimit = normalized?.code === "COST_LIMIT_EXCEEDED" && normalized.details ? costLimitSummary(normalized.details) : undefined;
  return (
    <InlineAlert title={normalized?.message ?? "Something went wrong"}>
      {normalized ? (
        <span className="request-error__meta">
          {normalized.code}{normalized.requestId ? ` · request ${normalized.requestId}` : ""}
          {costLimit ? <span className="request-error__cost-limit"> · {costLimit}</span> : null}
        </span>
      ) : null}
    </InlineAlert>
  );
}

function costLimitSummary(details: Record<string, unknown>): string | undefined {
  const limit = details.limitUsd;
  const spent = details.spentUsd;
  if (typeof limit !== "number" && typeof spent !== "number") return undefined;
  const periodLabel = details.period === "month" ? "monthly" : "daily";
  const limitText = typeof limit === "number" ? formatUsd(limit) : "unknown limit";
  if (typeof spent === "number") return `${periodLabel} limit ${limitText} · spent ${formatUsd(spent)}`;
  return `${periodLabel} limit ${limitText}`;
}

import type { ReactNode } from "react";
import { ApiError } from "../lib/api/client";

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
  return (
    <InlineAlert title={normalized?.message ?? "Something went wrong"}>
      {normalized ? (
        <span className="request-error__meta">
          {normalized.code}{normalized.requestId ? ` · request ${normalized.requestId}` : ""}
        </span>
      ) : null}
    </InlineAlert>
  );
}

/** Top-bar Hub latency probe interval. Lightweight `/health` only — never `/ready` or runtime status. */
export const HUB_LATENCY_POLL_MS = 5_000;

export type HubLatencyViewState = "pending" | "success" | "error";

/** Round end-to-end elapsed time to a whole non-negative millisecond. */
export function roundLatencyMs(startedAt: number, endedAt: number): number {
  const elapsed = endedAt - startedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.round(elapsed);
}

export function formatHubLatencyLabel(state: HubLatencyViewState, latencyMs?: number): string {
  if (state === "pending") return "… ms";
  if (state === "error") return "Hub offline";
  const ms = latencyMs ?? 0;
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  return `${Math.round(ms)} ms`;
}

export function hubLatencyAccessibleName(state: HubLatencyViewState, latencyMs?: number): string {
  if (state === "pending") return "Checking Hub latency";
  if (state === "error") return "Hub offline";
  return `Hub round-trip latency ${formatHubLatencyLabel("success", latencyMs)}`;
}

import type { ProviderConnection, ProviderManifestSummary } from "./api/types";

export type ProviderCardStatus = "blocked" | "maintenance" | "not_configured" | "ready" | "attention";

/** Locked mapping: blocked/maintenance never collapse into each other, and "ready" requires a live-verified connection. */
export function providerCardStatus(
  provider: Pick<ProviderManifestSummary, "availability">,
  connections: ReadonlyArray<Pick<ProviderConnection, "verify">>,
): ProviderCardStatus {
  if (provider.availability === "blocked") return "blocked";
  if (provider.availability === "coming_soon") return "maintenance";
  if (connections.length === 0) return "not_configured";
  return connections.some((connection) => connection.verify?.status === "ok") ? "ready" : "attention";
}

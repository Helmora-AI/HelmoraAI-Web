import type { ProviderConnection, ProviderManifestSummary } from "./api/types";
import { providerCardStatus, type ProviderCardStatus } from "./providerStatus";

export type AvailabilityFilter = "all" | "active" | "coming_soon" | "blocked";
export type ConnectionStateFilter = "any" | "not_configured" | "has_connections" | "has_enabled" | "all_disabled";
export type VerificationFilter = "any" | "ready" | "attention";
export type TierFilter = "all" | 1 | 2 | 3;

export interface ProviderFilterState {
  search: string;
  availability: AvailabilityFilter;
  connectionState: ConnectionStateFilter;
  verification: VerificationFilter;
  protocol: string;
  source: string;
  tier: TierFilter;
}

export const DEFAULT_PROVIDER_FILTERS: ProviderFilterState = {
  search: "",
  availability: "all",
  connectionState: "any",
  verification: "any",
  protocol: "",
  source: "",
  tier: "all",
};

export function providerFiltersActive(filters: ProviderFilterState): boolean {
  return filters.search.trim() !== ""
    || filters.availability !== "all"
    || filters.connectionState !== "any"
    || filters.verification !== "any"
    || filters.protocol !== ""
    || filters.source !== ""
    || filters.tier !== "all";
}

export function deriveProtocolOptions(providers: ReadonlyArray<Pick<ProviderManifestSummary, "protocol">>): string[] {
  return [...new Set(providers.map((provider) => provider.protocol).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function deriveSourceOptions(providers: ReadonlyArray<Pick<ProviderManifestSummary, "source">>): string[] {
  return [...new Set(providers.map((provider) => provider.source).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function connectionsFor(providerId: string, connections: ReadonlyArray<ProviderConnection>): ProviderConnection[] {
  return connections.filter((connection) => connection.provider_id === providerId);
}

function matchesConnectionState(connections: ReadonlyArray<ProviderConnection>, filter: ConnectionStateFilter): boolean {
  if (filter === "any") return true;
  if (filter === "not_configured") return connections.length === 0;
  if (filter === "has_connections") return connections.length > 0;
  if (filter === "has_enabled") return connections.some((connection) => connection.enabled);
  if (filter === "all_disabled") return connections.length > 0 && connections.every((connection) => !connection.enabled);
  return true;
}

function matchesVerification(
  provider: Pick<ProviderManifestSummary, "availability">,
  connections: ReadonlyArray<Pick<ProviderConnection, "verify">>,
  filter: VerificationFilter,
): boolean {
  if (filter === "any") return true;
  const status: ProviderCardStatus = providerCardStatus(provider, connections);
  if (filter === "ready") return status === "ready";
  if (filter === "attention") return status === "attention";
  return true;
}

function matchesSearch(provider: ProviderManifestSummary, needle: string): boolean {
  if (!needle) return true;
  const haystack = [
    provider.id,
    provider.display_name,
    ...(provider.aliases ?? []),
    provider.source,
    provider.source_id,
    provider.protocol,
    provider.executor_id,
    provider.default_model ?? "",
    ...(provider.capabilities ?? []),
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

/** AND-combine every active provider catalog filter. Client-side only. */
export function filterProviders(
  providers: readonly ProviderManifestSummary[],
  connections: readonly ProviderConnection[],
  filters: ProviderFilterState,
): ProviderManifestSummary[] {
  const needle = filters.search.trim().toLowerCase();
  return providers.filter((provider) => {
    if (filters.availability !== "all" && provider.availability !== filters.availability) return false;
    const owned = connectionsFor(provider.id, connections);
    if (!matchesConnectionState(owned, filters.connectionState)) return false;
    if (!matchesVerification(provider, owned, filters.verification)) return false;
    if (filters.protocol && provider.protocol !== filters.protocol) return false;
    if (filters.source && provider.source !== filters.source) return false;
    if (filters.tier !== "all" && provider.tier !== filters.tier) return false;
    if (!matchesSearch(provider, needle)) return false;
    return true;
  });
}

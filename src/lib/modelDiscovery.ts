import type { ConnectionImportModelsResponse, ConnectionValidation, ModelDefinition } from "./api/types";

export type DiagnoseState = {
  connectionId: string;
  result: ConnectionValidation;
  selectedUpstreamIds: string[];
};

export const DISCOVER_PAGE_SIZE = 40;

export function existingUpstreamIdsForProvider(
  models: ReadonlyArray<Pick<ModelDefinition, "providerId" | "upstreamId">>,
  providerId: string,
): Set<string> {
  return new Set(models.filter((model) => model.providerId === providerId).map((model) => model.upstreamId));
}

export function filterDiscoveredModels(models: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...models];
  return models.filter((id) => id.toLowerCase().includes(needle));
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize = DISCOVER_PAGE_SIZE): T[] {
  const start = Math.max(0, page) * pageSize;
  return items.slice(start, start + pageSize);
}

export function selectableNewModels(models: readonly string[], existing: ReadonlySet<string>): string[] {
  return models.filter((id) => !existing.has(id));
}

export function prefillVerifyAfterImport(
  results: ConnectionImportModelsResponse["results"],
  selectedUpstreamIds: readonly string[],
  fallback: string,
): string {
  const created = results.find((item) => item.status === "created");
  if (created) return created.upstreamId;
  const skippedSelected = selectedUpstreamIds
    .map((id) => results.find((item) => item.upstreamId === id && item.status === "skipped_existing"))
    .find(Boolean);
  if (skippedSelected) return skippedSelected.upstreamId;
  return fallback;
}

export function isEnvironmentManagedRevision(revision: string | undefined): boolean {
  if (!revision) return false;
  const value = revision.toLowerCase();
  return value.includes("env") || value.includes("environment") || value.includes("builtin") || value.startsWith("bootstrap");
}

export function filterCatalogModels(
  models: ReadonlyArray<ModelDefinition>,
  query: string,
): ModelDefinition[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...models];
  return models.filter((model) => [model.id, model.providerId, model.displayName, model.upstreamId].join(" ").toLowerCase().includes(needle));
}

export function connectionsForProvider(
  connections: ReadonlyArray<{ id: string; provider_id: string; name: string }>,
  providerId: string,
) {
  return connections.filter((connection) => connection.provider_id === providerId);
}

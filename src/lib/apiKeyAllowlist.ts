import type { ModelDefinition } from "../lib/api/types";

/** Filter API-key model allowlist options without clearing hidden selections. */
export function filterAllowlistModels(
  models: readonly Pick<ModelDefinition, "id" | "displayName" | "providerId">[],
  query: string,
): Array<Pick<ModelDefinition, "id" | "displayName" | "providerId">> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...models];
  return models.filter((model) => [model.id, model.displayName, model.providerId].join(" ").toLowerCase().includes(needle));
}

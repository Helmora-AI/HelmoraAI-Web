import {
  createStaticSource,
  type SearchableItem,
  type SearchSource,
} from "@astryxdesign/core/Typeahead";
import type { ModelDefinition, ModelSummary, ProviderConnection, ProviderManifestSummary } from "./api/types";

export type HelmoraSearchItem = SearchableItem<{ keywords: string[] }>;

export function toSearchSource(items: HelmoraSearchItem[]): SearchSource<HelmoraSearchItem> {
  return createStaticSource(items, {
    keywords: (item) => item.auxiliaryData?.keywords ?? [],
  });
}

export function providerSearchItem(provider: Pick<ProviderManifestSummary, "id" | "display_name" | "aliases" | "source" | "source_id" | "protocol" | "executor_id">): HelmoraSearchItem {
  const keywords = [
    provider.id,
    provider.display_name,
    ...(provider.aliases ?? []),
    provider.source,
    provider.source_id,
    provider.protocol,
    provider.executor_id,
  ].filter(Boolean);
  return {
    id: provider.id,
    label: provider.display_name || provider.id,
    auxiliaryData: { keywords },
  };
}

export function modelSearchItem(model: Pick<ModelDefinition, "id" | "displayName" | "upstreamId" | "providerId" | "family"> | Pick<ModelSummary, "id" | "displayName" | "providerId"> & { upstreamId?: string; family?: string }): HelmoraSearchItem {
  const displayName = model.displayName ?? model.id;
  const keywords = [
    model.id,
    displayName,
    "upstreamId" in model && model.upstreamId ? model.upstreamId : "",
    model.providerId ?? "",
    "family" in model && model.family ? model.family : "",
  ].filter(Boolean);
  return {
    id: model.id,
    label: displayName,
    auxiliaryData: { keywords },
  };
}

export function connectionSearchItem(connection: Pick<ProviderConnection, "id" | "name" | "provider_id" | "base_url">): HelmoraSearchItem {
  const keywords = [
    connection.id,
    connection.name,
    connection.provider_id,
    connection.base_url ?? "",
  ].filter(Boolean);
  return {
    id: connection.id,
    label: connection.name || connection.id,
    auxiliaryData: { keywords },
  };
}

export function matchSearchItems(items: HelmoraSearchItem[], query: string): HelmoraSearchItem[] {
  return toSearchSource(items).search(query) as HelmoraSearchItem[];
}

export function findSearchItem(items: HelmoraSearchItem[], id: string | undefined | null): HelmoraSearchItem | null {
  if (!id) return null;
  return items.find((item) => item.id === id) ?? null;
}

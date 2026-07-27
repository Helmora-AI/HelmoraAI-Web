import { describe, expect, it } from "vitest";
import type { ProviderConnection, ProviderManifestSummary } from "./api/types";
import {
  DEFAULT_PROVIDER_FILTERS,
  deriveProtocolOptions,
  deriveSourceOptions,
  filterProviders,
  providerFiltersActive,
  type ProviderFilterState,
} from "./providerFilters";

function provider(partial: Partial<ProviderManifestSummary> & Pick<ProviderManifestSummary, "id" | "display_name" | "availability">): ProviderManifestSummary {
  return {
    id: partial.id,
    display_name: partial.display_name,
    protocol: partial.protocol ?? "openai-compatible",
    policy_class: partial.policy_class ?? "standard",
    default_base_url: partial.default_base_url ?? null,
    enabled: partial.enabled ?? true,
    revision: partial.revision ?? 1,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00.000Z",
    executor_id: partial.executor_id ?? "openai-compatible",
    availability: partial.availability,
    availability_reason_code: partial.availability_reason_code ?? "",
    connectable_auth_modes: partial.connectable_auth_modes ?? ["api_key"],
    allow_custom_base_url: partial.allow_custom_base_url ?? false,
    auth_style: partial.auth_style ?? "bearer",
    default_model: partial.default_model ?? null,
    capabilities: partial.capabilities ?? ["chat"],
    config_fields: partial.config_fields ?? [],
    signup_url: partial.signup_url ?? null,
    icon_key: partial.icon_key ?? partial.id,
    source: partial.source ?? "catalog",
    source_id: partial.source_id ?? partial.id,
    aliases: partial.aliases ?? [],
    timeout_ms: partial.timeout_ms ?? null,
    has_static_extra_headers: partial.has_static_extra_headers ?? false,
    tier: partial.tier ?? 1,
  };
}

function connection(partial: Partial<ProviderConnection> & Pick<ProviderConnection, "id" | "provider_id">): ProviderConnection {
  return {
    id: partial.id,
    provider_id: partial.provider_id,
    name: partial.name ?? partial.id,
    base_url: partial.base_url ?? null,
    auth_type: partial.auth_type ?? "api_key",
    enabled: partial.enabled ?? false,
    priority: partial.priority ?? 10,
    max_concurrency: partial.max_concurrency ?? 4,
    config: partial.config ?? {},
    secret_configured: partial.secret_configured ?? true,
    verify: partial.verify ?? null,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

const catalog = [
  provider({ id: "groq", display_name: "Groq", availability: "active", protocol: "openai-compatible", source: "catalog", tier: 1, aliases: ["groq-cloud"], executor_id: "openai-compatible", default_model: "llama", capabilities: ["chat", "tools"] }),
  provider({ id: "codex", display_name: "Codex", availability: "coming_soon", protocol: "openai", source: "openai", tier: 2, availability_reason_code: "oauth_not_implemented" }),
  provider({ id: "grok-web", display_name: "Grok Web", availability: "blocked", protocol: "browser", source: "xai", tier: 3, availability_reason_code: "cookie_session_blocked" }),
  provider({ id: "ollama", display_name: "Ollama", availability: "active", protocol: "ollama", source: "local", tier: 1 }),
];

const connections = [
  connection({ id: "c-groq", provider_id: "groq", enabled: true, verify: { version: 1, status: "ok", code: "ok", message: "ok", model: "llama", executorId: "openai-compatible", verifiedAt: "2026-01-02T00:00:00.000Z", latencyMs: 12, inputFingerprint: "fp" } }),
  connection({ id: "c-ollama", provider_id: "ollama", enabled: false }),
];

describe("providerFilters", () => {
  it("keeps blocked and coming soon distinct", () => {
    expect(filterProviders(catalog, connections, { ...DEFAULT_PROVIDER_FILTERS, availability: "blocked" }).map((item) => item.id)).toEqual(["grok-web"]);
    expect(filterProviders(catalog, connections, { ...DEFAULT_PROVIDER_FILTERS, availability: "coming_soon" }).map((item) => item.id)).toEqual(["codex"]);
  });

  it("applies every filter with AND semantics", () => {
    const filters: ProviderFilterState = {
      ...DEFAULT_PROVIDER_FILTERS,
      availability: "active",
      connectionState: "has_enabled",
      verification: "ready",
      protocol: "openai-compatible",
      source: "catalog",
      tier: 1,
      search: "tools",
    };
    expect(filterProviders(catalog, connections, filters).map((item) => item.id)).toEqual(["groq"]);
  });

  it("filters connection and verification states", () => {
    expect(filterProviders(catalog, connections, { ...DEFAULT_PROVIDER_FILTERS, connectionState: "not_configured" }).map((item) => item.id)).toEqual(["codex", "grok-web"]);
    expect(filterProviders(catalog, connections, { ...DEFAULT_PROVIDER_FILTERS, connectionState: "all_disabled" }).map((item) => item.id)).toEqual(["ollama"]);
    expect(filterProviders(catalog, connections, { ...DEFAULT_PROVIDER_FILTERS, verification: "attention" }).map((item) => item.id)).toEqual(["ollama"]);
    expect(filterProviders(catalog, connections, { ...DEFAULT_PROVIDER_FILTERS, verification: "ready" }).map((item) => item.id)).toEqual(["groq"]);
  });

  it("derives stable unique protocol and source options", () => {
    expect(deriveProtocolOptions(catalog)).toEqual(["browser", "ollama", "openai", "openai-compatible"]);
    expect(deriveSourceOptions(catalog)).toEqual(["catalog", "local", "openai", "xai"]);
  });

  it("reports result counts and reset activity", () => {
    const filtered = filterProviders(catalog, connections, { ...DEFAULT_PROVIDER_FILTERS, search: "groq" });
    expect(filtered).toHaveLength(1);
    expect(providerFiltersActive(DEFAULT_PROVIDER_FILTERS)).toBe(false);
    expect(providerFiltersActive({ ...DEFAULT_PROVIDER_FILTERS, search: "x" })).toBe(true);
    expect(providerFiltersActive({ ...DEFAULT_PROVIDER_FILTERS, tier: 2 })).toBe(true);
  });
});

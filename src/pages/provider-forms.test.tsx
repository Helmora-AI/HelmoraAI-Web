import { describe, expect, it } from "vitest";
import {
  availabilityMessage,
  existingUpstreamIdsForProvider,
  filterDiscoveredModels,
  isBaseUrlRequired,
  pageSlice,
  prefillVerifyAfterImport,
  providerCardStatus,
} from "./ProvidersPage";
import { modelRegistrationProviders } from "./ModelsRoutesPage";
import type { ConnectionVerifySummary, ProviderConnection, ProviderManifestSummary } from "../lib/api/types";

function provider(partial: Partial<ProviderManifestSummary> & Pick<ProviderManifestSummary, "id" | "display_name" | "availability">): ProviderManifestSummary {
  return {
    protocol: "openai-chat",
    policy_class: "compatible",
    default_base_url: null,
    enabled: true,
    revision: 1,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    executor_id: "openai-compatible",
    availability_reason_code: "ready",
    connectable_auth_modes: ["api_key"],
    allow_custom_base_url: false,
    auth_style: "bearer",
    default_model: null,
    capabilities: [],
    config_fields: [],
    signup_url: null,
    icon_key: partial.id,
    source: "helmora",
    source_id: partial.id,
    aliases: [],
    timeout_ms: null,
    has_static_extra_headers: false,
    tier: 1,
    ...partial,
  };
}

function verifySummary(partial: Partial<ConnectionVerifySummary> & Pick<ConnectionVerifySummary, "status">): ConnectionVerifySummary {
  return {
    version: 1,
    code: "verified",
    message: "Chat probe completed successfully.",
    model: "gpt-4o-mini",
    executorId: "openai-compatible",
    verifiedAt: "2020-01-01T00:00:00.000Z",
    latencyMs: 120,
    inputFingerprint: "fp",
    ...partial,
  };
}

function connection(partial: Partial<ProviderConnection> & Pick<ProviderConnection, "id" | "provider_id">): ProviderConnection {
  return {
    name: "Default",
    base_url: null,
    auth_type: "api_key",
    enabled: false,
    priority: 100,
    max_concurrency: 4,
    config: {},
    secret_configured: true,
    verify: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("provider form helpers", () => {
  it("requires Base URL only when custom URL is allowed and no default exists", () => {
    expect(isBaseUrlRequired(provider({ id: "future-custom", display_name: "Future Custom", availability: "active", allow_custom_base_url: true, default_base_url: null }))).toBe(true);
    expect(isBaseUrlRequired(provider({ id: "chutes", display_name: "Chutes", availability: "active", allow_custom_base_url: true, default_base_url: "https://llm.chutes.ai/v1" }))).toBe(false);
    expect(isBaseUrlRequired(provider({ id: "openai", display_name: "OpenAI", availability: "active", allow_custom_base_url: false, default_base_url: "https://api.openai.com/v1" }))).toBe(false);
  });

  it("maps Coming Soon / Blocked reasons without defaulting everything to OAuth", () => {
    expect(availabilityMessage(provider({ id: "codex", display_name: "Codex", availability: "coming_soon", availability_reason_code: "oauth_not_implemented" }))).toMatch(/OAuth/);
    expect(availabilityMessage(provider({ id: "elevenlabs", display_name: "ElevenLabs", availability: "coming_soon", availability_reason_code: "media_executor_not_implemented" }))).toMatch(/media executor/i);
    expect(availabilityMessage(provider({ id: "aihorde", display_name: "AI Horde", availability: "coming_soon", availability_reason_code: "unsupported_protocol" }))).toMatch(/dedicated protocol/i);
    expect(availabilityMessage(provider({ id: "grok-web", display_name: "Grok Web", availability: "blocked", availability_reason_code: "cookie_session_blocked" }))).toMatch(/cookie/i);
  });
});

describe("providerCardStatus", () => {
  const active = provider({ id: "groq", display_name: "Groq", availability: "active" });
  const blocked = provider({ id: "grok-web", display_name: "Grok Web", availability: "blocked" });
  const comingSoon = provider({ id: "codex", display_name: "Codex", availability: "coming_soon" });

  it("never collapses blocked into maintenance, even with connections present", () => {
    expect(providerCardStatus(blocked, [])).toBe("blocked");
    expect(providerCardStatus(blocked, [connection({ id: "c1", provider_id: "grok-web", verify: verifySummary({ status: "ok" }) })])).toBe("blocked");
  });

  it("never collapses coming_soon into blocked", () => {
    expect(providerCardStatus(comingSoon, [])).toBe("maintenance");
  });

  it("is not_configured for an active provider with zero connections", () => {
    expect(providerCardStatus(active, [])).toBe("not_configured");
  });

  it("is ready only when some connection has a current verify.status of ok", () => {
    expect(providerCardStatus(active, [connection({ id: "c1", provider_id: "groq", verify: verifySummary({ status: "ok" }) })])).toBe("ready");
    expect(providerCardStatus(active, [
      connection({ id: "c1", provider_id: "groq", verify: verifySummary({ status: "failed" }) }),
      connection({ id: "c2", provider_id: "groq", verify: verifySummary({ status: "ok" }) }),
    ])).toBe("ready");
  });

  it("is attention when connections exist but none currently verify ok (missing/never/failed/stale)", () => {
    expect(providerCardStatus(active, [connection({ id: "c1", provider_id: "groq" })])).toBe("attention");
    expect(providerCardStatus(active, [connection({ id: "c1", provider_id: "groq", verify: verifySummary({ status: "failed" }) })])).toBe("attention");
    expect(providerCardStatus(active, [connection({ id: "c1", provider_id: "groq", verify: verifySummary({ status: "stale" }) })])).toBe("attention");
  });
});

describe("model registration provider filter", () => {
  it("keeps only active enabled providers in the create-model dropdown", () => {
    const providers = [
      provider({ id: "groq", display_name: "Groq", availability: "active", enabled: true }),
      provider({ id: "codex", display_name: "Codex", availability: "coming_soon", availability_reason_code: "oauth_not_implemented" }),
      provider({ id: "grok-web", display_name: "Grok Web", availability: "blocked", availability_reason_code: "cookie_session_blocked" }),
      provider({ id: "disabled", display_name: "Disabled", availability: "active", enabled: false }),
    ];
    const filtered = modelRegistrationProviders(providers);
    expect(filtered.map((item) => item.id)).toEqual(["groq"]);
  });
});

describe("diagnose import helpers", () => {
  it("filters discovered models and pages them", () => {
    const models = ["alpha", "beta-long", "Gamma"];
    expect(filterDiscoveredModels(models, "gam")).toEqual(["Gamma"]);
    expect(filterDiscoveredModels(models, "alpha")).toEqual(["alpha"]);
    expect(pageSlice(Array.from({ length: 45 }, (_, i) => `m${i}`), 1)).toHaveLength(5);
  });

  it("marks existing upstream ids and prefills verify after import", () => {
    const existing = existingUpstreamIdsForProvider([
      { providerId: "groq", upstreamId: "llama" },
      { providerId: "chutes", upstreamId: "llama" },
    ], "groq");
    expect(existing.has("llama")).toBe(true);
    expect(prefillVerifyAfterImport(
      [
        { upstreamId: "llama", modelId: "groq:llama", status: "skipped_existing" },
        { upstreamId: "new", modelId: "groq:new", status: "created" },
      ],
      ["llama", "new"],
      "fallback",
    )).toBe("new");
    expect(prefillVerifyAfterImport(
      [{ upstreamId: "llama", modelId: "groq:llama", status: "skipped_existing" }],
      ["llama"],
      "fallback",
    )).toBe("llama");
  });
});

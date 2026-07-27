import { describe, expect, it } from "vitest";
import {
  connectionsForProvider,
  existingUpstreamIdsForProvider,
  filterCatalogModels,
  isEnvironmentManagedRevision,
  selectableNewModels,
} from "../lib/modelDiscovery";
import { connectionOptions, deleteModelConfirmMessage, draftFromModel } from "./ModelsRoutesPage";
import { buildModelUpsertBody } from "../lib/modelUpsert";
import type { ModelDefinition } from "../lib/api/types";

function model(partial: Partial<ModelDefinition> & Pick<ModelDefinition, "id" | "providerId" | "upstreamId">): ModelDefinition {
  const base: ModelDefinition = {
    id: partial.id,
    providerId: partial.providerId,
    upstreamId: partial.upstreamId,
    displayName: partial.displayName ?? partial.id,
    family: partial.family ?? "fixture",
    contextWindow: partial.contextWindow ?? 8192,
    maxOutputTokens: partial.maxOutputTokens ?? 2048,
    capabilities: partial.capabilities ?? {
      modalities: ["text"],
      tools: true,
      parallelTools: false,
      structuredOutput: true,
      reasoning: false,
      streaming: true,
      embeddings: false,
    },
    pricing: partial.pricing ?? {},
    catalogRevision: partial.catalogRevision ?? "web-v2",
  };
  if (typeof partial.enabled === "boolean") base.enabled = partial.enabled;
  return base;
}

describe("modelDiscovery helpers", () => {
  it("selects only filtered new upstream ids (not already imported)", () => {
    const existing = existingUpstreamIdsForProvider([
      { providerId: "ollama", upstreamId: "fixture-chat" },
      { providerId: "groq", upstreamId: "other" },
    ], "ollama");
    expect(selectableNewModels(["fixture-chat", "new-a", "new-b"], existing)).toEqual(["new-a", "new-b"]);
  });

  it("filters catalog by id, provider, display name, or upstream id", () => {
    const catalog = [
      model({ id: "ollama:a", providerId: "ollama", upstreamId: "a", displayName: "Alpha" }),
      model({ id: "groq:b", providerId: "groq", upstreamId: "b", displayName: "Beta" }),
    ];
    expect(filterCatalogModels(catalog, "groq").map((item) => item.id)).toEqual(["groq:b"]);
    expect(filterCatalogModels(catalog, "alpha").map((item) => item.id)).toEqual(["ollama:a"]);
  });

  it("lists connections for a provider", () => {
    expect(connectionsForProvider([
      { id: "c1", provider_id: "ollama", name: "Local" },
      { id: "c2", provider_id: "groq", name: "Cloud" },
    ], "ollama").map((item) => item.id)).toEqual(["c1"]);
  });

  it("detects environment-managed revisions", () => {
    expect(isEnvironmentManagedRevision("env-bootstrap")).toBe(true);
    expect(isEnvironmentManagedRevision("bootstrap-v1")).toBe(true);
    expect(isEnvironmentManagedRevision("web-v2")).toBe(false);
  });
});

describe("model edit and delete helpers", () => {
  it("locks identity fields into the edit draft", () => {
    const draft = draftFromModel(model({
      id: "ollama:fixture-chat",
      providerId: "ollama",
      upstreamId: "fixture-chat",
      displayName: "Fixture",
      catalogRevision: "env-ollama",
      enabled: false,
    }));
    expect(draft.id).toBe("ollama:fixture-chat");
    expect(draft.providerId).toBe("ollama");
    expect(draft.upstreamId).toBe("fixture-chat");
    expect(draft.catalogRevision).toBe("env-ollama");
  });

  it("preserves pricing and non-edited capabilities when only displayName changes", () => {
    const original = model({
      id: "groq:priced",
      providerId: "groq",
      upstreamId: "priced",
      displayName: "Priced",
      catalogRevision: "import-diagnose",
      enabled: false,
      pricing: { inputPerMillionUsd: 0.05, outputPerMillionUsd: 0.08 },
      capabilities: {
        modalities: ["text", "image"],
        tools: false,
        parallelTools: false,
        structuredOutput: false,
        reasoning: true,
        streaming: false,
        embeddings: true,
      },
    });
    const draft = draftFromModel(original);
    draft.displayName = "Renamed only";
    const body = buildModelUpsertBody(draft, original);
    expect(body.displayName).toBe("Renamed only");
    expect(body.pricing).toEqual({ inputPerMillionUsd: 0.05, outputPerMillionUsd: 0.08 });
    expect(body.capabilities).toEqual({
      modalities: ["text", "image"],
      tools: false,
      parallelTools: false,
      structuredOutput: false,
      reasoning: true,
      streaming: false,
      embeddings: true,
    });
    expect(body).not.toHaveProperty("catalogRevision");
    expect(body.id).toBe("groq:priced");
    expect(body.providerId).toBe("groq");
    expect(body.upstreamId).toBe("priced");
  });

  it("does not advertise unproven streaming/structuredOutput for Diagnose-imported models on rename", () => {
    const imported = model({
      id: "ollama:fixture-extra",
      providerId: "ollama",
      upstreamId: "fixture-extra",
      displayName: "fixture-extra",
      catalogRevision: "diagnose-import",
      enabled: false,
      capabilities: {
        modalities: ["text"],
        tools: false,
        parallelTools: false,
        structuredOutput: false,
        reasoning: false,
        streaming: false,
        embeddings: false,
      },
    });
    const draft = draftFromModel(imported);
    draft.displayName = "Friendly name";
    const body = buildModelUpsertBody(draft, imported) as {
      capabilities: ModelDefinition["capabilities"];
      pricing: ModelDefinition["pricing"];
    };
    expect(body.capabilities.streaming).toBe(false);
    expect(body.capabilities.structuredOutput).toBe(false);
    expect(body.capabilities.parallelTools).toBe(false);
    expect(body.pricing).toEqual({});
  });

  it("applies create defaults only when no original model is provided", () => {
    const body = buildModelUpsertBody({
      id: "",
      providerId: "ollama",
      upstreamId: "new",
      displayName: "",
      family: "",
      contextWindow: "8192",
      maxOutputTokens: "2048",
      tools: true,
      reasoning: false,
      embeddings: false,
    });
    expect(body.catalogRevision).toBe("web-v2");
    expect((body.capabilities as ModelDefinition["capabilities"]).streaming).toBe(true);
    expect((body.capabilities as ModelDefinition["capabilities"]).structuredOutput).toBe(true);
    expect(body.pricing).toEqual({});
  });

  it("recomputes compatible connections when the route model changes", () => {
    const models = [
      model({ id: "groq:a", providerId: "groq", upstreamId: "a" }),
      model({ id: "ollama:b", providerId: "ollama", upstreamId: "b" }),
    ];
    const connections = [
      { id: "c-groq", provider_id: "groq", name: "Groq" },
      { id: "c-ollama", provider_id: "ollama", name: "Local" },
    ];
    expect(connectionOptions("groq:a", models, connections as never).map((item) => item.id)).toEqual(["c-groq"]);
    expect(connectionOptions("ollama:b", models, connections as never).map((item) => item.id)).toEqual(["c-ollama"]);
  });

  it("warns when hard-deleting environment-managed models", () => {
    expect(deleteModelConfirmMessage({ id: "ollama:x", catalogRevision: "env-bootstrap" })).toMatch(/reappear after Hub restart/i);
    expect(deleteModelConfirmMessage({ id: "web:y", catalogRevision: "web-v2" })).not.toMatch(/reappear after Hub restart/i);
  });
});

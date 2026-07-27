import { describe, expect, it } from "vitest";
import {
  connectionSearchItem,
  findSearchItem,
  matchSearchItems,
  modelSearchItem,
  providerSearchItem,
} from "./searchableSelect";

describe("searchable provider items", () => {
  const items = [
    providerSearchItem({
      id: "groq",
      display_name: "Groq",
      aliases: ["groq-cloud"],
      source: "catalog",
      source_id: "src-groq",
      protocol: "openai-compatible",
      executor_id: "openai-compatible",
    }),
    providerSearchItem({
      id: "ollama",
      display_name: "Ollama",
      aliases: [],
      source: "local",
      source_id: "src-ollama",
      protocol: "ollama",
      executor_id: "ollama",
    }),
  ];

  it("matches by display name, id, alias, source, and protocol", () => {
    expect(matchSearchItems(items, "groq").map((item) => item.id)).toEqual(["groq"]);
    expect(matchSearchItems(items, "GROQ-CLOUD").map((item) => item.id)).toEqual(["groq"]);
    expect(matchSearchItems(items, "catalog").map((item) => item.id)).toEqual(["groq"]);
    expect(matchSearchItems(items, "openai-compatible").map((item) => item.id)).toEqual(["groq"]);
    expect(matchSearchItems(items, "ollama").map((item) => item.id)).toEqual(["ollama"]);
  });
});

describe("searchable model items", () => {
  const items = [
    modelSearchItem({
      id: "groq:llama-3",
      displayName: "Llama 3",
      upstreamId: "llama-3-70b",
      providerId: "groq",
      family: "llama",
    }),
    modelSearchItem({
      id: "ollama:phi",
      displayName: "Phi",
      upstreamId: "phi3",
      providerId: "ollama",
      family: "phi",
    }),
  ];

  it("matches by display name, model id, upstream id, and provider id", () => {
    expect(matchSearchItems(items, "llama 3").map((item) => item.id)).toEqual(["groq:llama-3"]);
    expect(matchSearchItems(items, "groq:llama").map((item) => item.id)).toEqual(["groq:llama-3"]);
    expect(matchSearchItems(items, "llama-3-70b").map((item) => item.id)).toEqual(["groq:llama-3"]);
    expect(matchSearchItems(items, "ollama").map((item) => item.id)).toEqual(["ollama:phi"]);
  });
});

describe("typeahead controlled selection", () => {
  it("returns canonical IDs rather than display labels", () => {
    const items = [
      connectionSearchItem({ id: "conn_1", name: "Production", provider_id: "groq", base_url: "https://api.groq.com/openai/v1" }),
      connectionSearchItem({ id: "conn_2", name: "Staging", provider_id: "groq", base_url: "https://staging.example/v1" }),
    ];
    const matched = matchSearchItems(items, "staging");
    expect(matched).toHaveLength(1);
    expect(matched[0]!.id).toBe("conn_2");
    expect(matched[0]!.label).toBe("Staging");
    expect(findSearchItem(items, "conn_1")?.id).toBe("conn_1");
    expect(findSearchItem(items, undefined)).toBeNull();
  });
});

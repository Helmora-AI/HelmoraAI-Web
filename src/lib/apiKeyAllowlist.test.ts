import { describe, expect, it } from "vitest";
import { filterAllowlistModels } from "./apiKeyAllowlist";

describe("api key model allowlist filter", () => {
  const models = [
    { id: "groq:llama", displayName: "Llama", providerId: "groq" },
    { id: "ollama:phi", displayName: "Phi", providerId: "ollama" },
    { id: "openai:gpt", displayName: "GPT", providerId: "openai" },
  ];

  it("filters by model id, display name, and provider id without mutating selections", () => {
    const selected = ["groq:llama", "openai:gpt"];
    const visible = filterAllowlistModels(models, "ollama");
    expect(visible.map((item) => item.id)).toEqual(["ollama:phi"]);
    expect(selected).toEqual(["groq:llama", "openai:gpt"]);
    expect(filterAllowlistModels(models, "GPT").map((item) => item.id)).toEqual(["openai:gpt"]);
    expect(filterAllowlistModels(models, "").map((item) => item.id)).toEqual(["groq:llama", "ollama:phi", "openai:gpt"]);
  });
});

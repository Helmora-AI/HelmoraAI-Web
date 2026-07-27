import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SearchableSelect } from "./SearchableSelect";
import { modelSearchItem, providerSearchItem } from "../lib/searchableSelect";
import { AppProviders } from "../app/providers";
import { connectionOptions } from "../pages/ModelsRoutesPage";
import type { ModelDefinition, ProviderConnection } from "../lib/api/types";

const PROVIDER_ITEMS = [
  providerSearchItem({ id: "groq", display_name: "Groq", aliases: ["groq-cloud"], source: "catalog", source_id: "src", protocol: "openai-compatible", executor_id: "openai-compatible" }),
  providerSearchItem({ id: "ollama", display_name: "Ollama", aliases: [], source: "local", source_id: "src2", protocol: "ollama", executor_id: "ollama" }),
];

describe("SearchableSelect", () => {
  it("keeps canonical IDs and supports keyboard-accessible labels", async () => {
    const user = userEvent.setup();
    let selected = "";
    render(
      <AppProviders>
        <SearchableSelect label="Diagnose provider" items={PROVIDER_ITEMS} value={selected} onChange={(id) => { selected = id; }} placeholder="Select provider…" />
      </AppProviders>,
    );
    const input = screen.getByRole("combobox", { name: /Diagnose provider/i });
    expect(input).toBeInTheDocument();
    await user.click(input);
    await user.type(input, "ollama");
    const option = await screen.findByRole("option", { name: /Ollama/i });
    await user.click(option);
    await waitFor(() => { expect(selected).toBe("ollama"); });
  });

  it("rerenders a controlled selected token when the parent value changes", () => {
    function Harness({ value }: { value: string }) {
      return (
        <AppProviders>
          <SearchableSelect label="Diagnose provider" items={PROVIDER_ITEMS} value={value} onChange={() => {}} placeholder="Select provider…" hasClear={false} />
          <output data-testid="canonical">{value}</output>
        </AppProviders>
      );
    }
    const { rerender } = render(<Harness value="ollama" />);
    expect(screen.getByTestId("canonical")).toHaveTextContent("ollama");
    expect(screen.getByRole("button", { name: "Ollama" })).toBeInTheDocument();
    rerender(<Harness value="groq" />);
    expect(screen.getByTestId("canonical")).toHaveTextContent("groq");
    expect(screen.getByRole("button", { name: "Groq" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ollama" })).not.toBeInTheDocument();
  });
});

describe("route connection recomputation", () => {
  it("restricts connections to the selected model provider and prefers a compatible connection", () => {
    const models: ModelDefinition[] = [
      {
        id: "groq:llama",
        providerId: "groq",
        upstreamId: "llama",
        displayName: "Llama",
        family: "llama",
        contextWindow: 8192,
        maxOutputTokens: 2048,
        capabilities: { modalities: ["text"], tools: true, parallelTools: false, structuredOutput: true, reasoning: false, streaming: true, embeddings: false },
        pricing: {},
        catalogRevision: "web",
        enabled: true,
      },
      {
        id: "ollama:phi",
        providerId: "ollama",
        upstreamId: "phi",
        displayName: "Phi",
        family: "phi",
        contextWindow: 8192,
        maxOutputTokens: 2048,
        capabilities: { modalities: ["text"], tools: false, parallelTools: false, structuredOutput: false, reasoning: false, streaming: true, embeddings: false },
        pricing: {},
        catalogRevision: "web",
        enabled: true,
      },
    ];
    const connections: ProviderConnection[] = [
      { id: "c-groq", provider_id: "groq", name: "Groq", auth_type: "api_key", enabled: true, priority: 1, max_concurrency: 4, config: {}, secret_configured: true, created_at: "", updated_at: "" },
      { id: "c-ollama", provider_id: "ollama", name: "Local", auth_type: "none", enabled: true, priority: 1, max_concurrency: 4, config: {}, secret_configured: false, created_at: "", updated_at: "" },
    ];
    expect(connectionOptions("groq:llama", models, connections).map((item) => item.id)).toEqual(["c-groq"]);
    expect(connectionOptions("ollama:phi", models, connections).map((item) => item.id)).toEqual(["c-ollama"]);
    expect(modelSearchItem(models[0]!).id).toBe("groq:llama");
  });
});

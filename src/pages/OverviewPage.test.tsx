import { fireEvent, render, screen, within, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverviewPage } from "./OverviewPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Overview Connection map logos", () => {
  it("uses the existing ProviderIcon asset for a known provider connection", async () => {
    stubOverviewApis({
      providers: [{ id: "openai", display_name: "OpenAI", icon_key: "openai" }],
      connections: [{ id: "c1", name: "Prod OpenAI", provider_id: "openai", enabled: true }],
    });
    renderOverview();
    const row = await screen.findByText("Prod OpenAI");
    const article = row.closest("article")!;
    const img = article.querySelector("img.provider-logo");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("/logo/providers/openai.png");
    expect(img!.getAttribute("alt")).toBe("");
    expect(img!.getAttribute("aria-hidden")).toBe("true");
    expect(within(article).getByText("openai")).toBeInTheDocument();
    expect(within(article).getByText("Enabled")).toBeInTheDocument();
  });

  it("reuses one provider metadata lookup for multiple connections without extra fetches", async () => {
    const fetchMock = stubOverviewApis({
      providers: [{ id: "anthropic", display_name: "Anthropic", icon_key: "anthropic" }],
      connections: [
        { id: "c1", name: "Anthropic A", provider_id: "anthropic", enabled: true },
        { id: "c2", name: "Anthropic B", provider_id: "anthropic", enabled: false },
      ],
    });
    const { container } = renderOverview();
    await screen.findByText("Anthropic A");
    await screen.findByText("Anthropic B");
    const providerCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/v2/providers"));
    expect(providerCalls).toHaveLength(1);
    const imgs = [...container.querySelectorAll(".connection-row img.provider-logo")];
    expect(imgs).toHaveLength(2);
    expect(imgs.every((img) => img.getAttribute("src") === "/logo/providers/anthropic.png")).toBe(true);
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("falls back safely for unknown providers without broken remote images", async () => {
    stubOverviewApis({
      providers: [],
      connections: [{ id: "c9", name: "Custom wire", provider_id: "totally-unknown-provider", enabled: true }],
    });
    renderOverview();
    const article = (await screen.findByText("Custom wire")).closest("article")!;
    const img = article.querySelector("img.provider-logo");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("/logo/providers/totally-unknown-provider.png");
    fireEvent.error(img!);
    fireEvent.error(article.querySelector("img.provider-logo")!);
    expect(article.querySelector("img.provider-logo")).toBeNull();
    expect(article.querySelector(".provider-monogram")?.textContent).toBe("T");
    expect(article.innerHTML).not.toMatch(/https?:\/\//iu);
  });

  it("keeps connection ordering and avoids horizontal overflow styles on the map", async () => {
    stubOverviewApis({
      providers: [{ id: "openai", display_name: "OpenAI", icon_key: "openai" }],
      connections: [
        { id: "c1", name: "First", provider_id: "openai", enabled: true },
        { id: "c2", name: "Second", provider_id: "openai", enabled: true },
      ],
    });
    const { container } = renderOverview();
    await screen.findByText("First");
    const names = [...container.querySelectorAll(".connection-row strong")].map((node) => node.textContent);
    expect(names).toEqual(["First", "Second"]);
    expect(container.querySelector(".connection-list")).toBeTruthy();
    expect(container.querySelector(".connection-row__mark .provider-icon")).toBeTruthy();
  });
});

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stubOverviewApis(input: {
  providers: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
}) {
  const fetchMock = vi.fn(async (inputUrl: RequestInfo | URL) => {
    const url = String(inputUrl);
    if (url.includes("/api/v2/runtime/status")) return json({ status: "ready", database: "ok", inflight: 0 });
    if (url.includes("/api/v2/runtime/version")) return json({ version: "2.0.0-alpha.1" });
    if (url.includes("/api/v2/providers")) return json({ providers: input.providers, connections: input.connections });
    if (url.includes("/api/v2/models")) return json({ data: [] });
    if (url.includes("/api/v2/conversations")) return json({ data: [] });
    if (url.includes("/api/v2/tasks")) return json({ data: [] });
    throw new Error(`Unhandled fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

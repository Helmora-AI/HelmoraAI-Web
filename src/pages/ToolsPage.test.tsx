import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../app/providers";
import { ToolsPage } from "./ToolsPage";

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ToolsPage agent registry", () => {
  it("summarizes a registered schema and executes a validated isolated test", async () => {
    const user = userEvent.setup();
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined;
      requests.push({ url, method, ...(body === undefined ? {} : { body }) });
      if (url === "/api/v2/tools") return json({ data: [{
        name: "calculator",
        description: "Evaluate a finite arithmetic expression.",
        risk: "read",
        timeoutMs: 2_000,
        inputSchema: {
          type: "object",
          required: ["expression"],
          properties: { expression: { type: "string" } },
          additionalProperties: false,
        },
      }] });
      if (url === "/api/v2/tools/calculator/run" && method === "POST") {
        return json({ content: "42", structured: { result: 42 } });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }));

    renderTools();
    expect(await screen.findByText("1 fields")).toBeInTheDocument();
    expect(screen.getByText("Local read risk")).toBeInTheDocument();
    const editor = screen.getByLabelText("JSON object");
    await user.clear(editor);
    await user.click(editor);
    await user.paste(JSON.stringify({ expression: "6*7" }));
    await user.click(screen.getByRole("button", { name: "Run isolated test" }));
    expect(await screen.findByText(/"result": 42/u)).toBeInTheDocument();
    expect(requests).toContainEqual({
      url: "/api/v2/tools/calculator/run",
      method: "POST",
      body: { arguments: { expression: "6*7" } },
    });
  });

  it("hands off to Chat with agent tools explicitly enabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [] })));
    renderTools();
    await userEvent.click(screen.getByRole("button", { name: "Open agent chat" }));
    await waitFor(() => { expect(screen.getByTestId("location")).toHaveTextContent("/chat?tools=auto"); });
  });
});

function renderTools() {
  return render(
    <MemoryRouter initialEntries={["/tools"]}>
      <AppProviders>
        <Routes>
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/chat" element={<Location />} />
        </Routes>
      </AppProviders>
    </MemoryRouter>,
  );
}

function Location() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../app/providers";
import { ChatPage } from "./ChatPage";

afterEach(() => { vi.unstubAllGlobals(); });

describe("ChatPage", () => {
  it("persists a direct SSE answer, unlocks the composer, then switches to agent mode", async () => {
    const encoder = new TextEncoder();
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    let conversationCreated = false;
    let assistantPersisted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined;
      requests.push({ url, method, ...(body === undefined ? {} : { body }) });

      if (url === "/api/v2/routes/models") return json({ data: [{ id: "mock-route", displayName: "Mock route", capabilities: { modalities: ["text"] } }] });
      if (url.startsWith("/api/v2/conversations?")) return json({ data: [], nextCursor: null });
      if (url === "/api/v2/conversations" && method === "POST") { conversationCreated = true; return json(conversation("conv_test"), 201); }
      if (url === "/api/v2/conversations/conv_test/messages" && method === "POST") {
        const role = body && (body as { role?: string }).role === "assistant" ? "assistant" : "user";
        if (role === "assistant") assistantPersisted = true;
        return json(message(role), 201);
      }
      if (url === "/api/v2/conversations/conv_test" && method === "GET") return json({ conversation: conversation("conv_test"), messages: conversationCreated ? [message("user"), ...(assistantPersisted ? [message("assistant")] : [])] : [] });
      if (url === "/api/v2/conversations/conv_agent" && method === "GET") return json({ conversation: conversation("conv_agent"), messages: [message("agent-user"), message("agent-assistant")] });
      if (url === "/v1/responses") {
        const stream = new ReadableStream<Uint8Array>({ start(controller) {
          controller.enqueue(encoder.encode("event: response.output_text.delta\ndata: {\"delta\":\"Hello \"}\n\n"));
          controller.enqueue(encoder.encode("event: response.output_text.delta\ndata: {\"delta\":\"from stream.\"}\n\nevent: response.completed\ndata: {\"response\":{\"model\":\"mock-route\",\"output_text\":\"Hello from stream.\",\"usage\":{\"input_tokens\":2,\"output_tokens\":3,\"total_tokens\":5}}}\n\n"));
          controller.close();
        } });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      if (url === "/api/v2/chat") return json({
        id: "resp_agent", object: "response", model: "mock-route", output: [], output_text: "Agent answer [source_1].",
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
        helmora: {
          conversation_id: "conv_agent",
          context: { memories: 1 },
          rounds: 2,
          tool_runs: [{ name: "web_search", runId: "run_1", durationMs: 12, citationIds: ["source_1"] }],
          citations: [{ id: "source_1", url: "https://example.com/reference", title: "Agent source", snippet: "Validated fixture source", toolName: "web_search", toolRunId: "run_1" }],
        },
      });
      throw new Error(`Unhandled fetch in ChatPage test: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><ChatPage /></AppProviders></MemoryRouter>);

    const composer = await screen.findByRole("textbox", { name: "Message" });
    await waitFor(() => { expect(composer).toBeEnabled(); });
    await user.type(composer, "Direct hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hello from stream.")).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled(); });
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    expect(requests.some((request) => request.url === "/api/v2/conversations/conv_test/messages" && (request.body as { role?: string } | undefined)?.role === "assistant")).toBe(true);

    await user.click(screen.getByRole("button", { name: "New chat" }));
    await user.click(screen.getByRole("checkbox", { name: "Memory" }));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Use memory");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Agent answer/u)).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled(); });
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Run receipt"));
    const source = screen.getByRole("link", { name: "Agent source" });
    expect(source).toHaveAttribute("href", "https://example.com/reference");
    expect(source).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(requests.some((request) => request.url === "/api/v2/chat" && request.method === "POST")).toBe(true);
  }, 15_000);
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function conversation(id: string) {
  return { id, tenantId: "personal", userId: "owner", title: "Test", activeBranchId: "branch_main", archived: false, metadata: {}, createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z" };
}

function message(role: string) {
  const assistant = role.endsWith("assistant");
  const agent = role.startsWith("agent-");
  return { id: `msg_${role}`, conversationId: agent ? "conv_agent" : "conv_test", branchId: "branch_main", role: assistant ? "assistant" : "user", parts: [{ type: "text", text: assistant ? (agent ? "Agent answer." : "Hello from stream.") : (agent ? "Use memory" : "Direct hello") }], metadata: {}, sequence: assistant ? 2 : 1, createdAt: "2026-07-23T00:00:00.000Z" };
}

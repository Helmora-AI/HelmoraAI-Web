import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./client";

afterEach(() => { vi.unstubAllGlobals(); });

describe("ApiClient", () => {
  it("uses cookie credentials and an in-memory CSRF token for mutations", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient();
    client.setCsrfToken("csrf-secret");
    await client.request("/api/v2/example", { method: "POST", body: { value: 42 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init).toBeDefined();
    const requestInit = init!;
    expect(url).toBe("/api/v2/example");
    expect(requestInit.credentials).toBe("include");
    expect(new Headers(requestInit.headers).get("x-csrf-token")).toBe("csrf-secret");
    expect(requestInit.body).toBe('{"value":42}');
    expect(localStorage.length).toBe(0);
  });

  it("does not attach CSRF to safe methods", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient(); client.setCsrfToken("csrf-secret");
    await client.request("/ready");
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).has("x-csrf-token")).toBe(false);
  });

  it("normalizes the Hub public error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { type: "validation_error", code: "JSON_INVALID", message: "Request body is invalid.", request_id: "req_test", retryable: false, retry_after_ms: null } }, 400)));
    const client = new ApiClient();
    await expect(client.request("/bad")).rejects.toMatchObject({ status: 400, code: "JSON_INVALID", requestId: "req_test", retryable: false } satisfies Partial<ApiError>);
  });

  it("parses typed SSE across split chunks and CRLF boundaries", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode("event: response.output_text.delta\r\ndata: {\"delta\":\"Hel")); controller.enqueue(encoder.encode("mora\"}\r\n\r\nevent: response.completed\ndata: {\"ok\":true}\n\n")); controller.close(); } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } })));
    const client = new ApiClient(); const events = [];
    for await (const event of client.stream("/v1/responses", { body: {} })) events.push(event);
    expect(events).toEqual([{ event: "response.output_text.delta", data: { delta: "Helmora" } }, { event: "response.completed", data: { ok: true } }]);
  });
});

function jsonResponse(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }

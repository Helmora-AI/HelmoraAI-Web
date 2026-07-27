import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HUB_PROXY_ROUTE_INCLUDES,
  handlePagesHubProxy,
  isHubProxyPath,
  isPagesProxyEnabled,
  type PagesProxyEnv,
} from "./pagesProxy";
import { ApiClient } from "../lib/api/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cloudflare Pages Hub proxy", () => {
  it("returns typed 503 and performs zero upstream fetches when proxy is disabled", async () => {
    const fetchImpl = vi.fn();
    const response = await handlePagesHubProxy({
      request: new Request("https://app.example.com/api/v2/ready"),
      env: { HELMORA_CF_PAGES_PROXY_ENABLED: "false", HELMORA_HUB_URL: "https://hub.example.com" },
      pagesOrigin: "https://app.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "HUB_PROXY_DISABLED",
        message: "The Cloudflare Pages Hub proxy is not enabled.",
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(isPagesProxyEnabled({ HELMORA_CF_PAGES_PROXY_ENABLED: "true" })).toBe(true);
    expect(isPagesProxyEnabled({})).toBe(false);
    expect(isPagesProxyEnabled({ HELMORA_CF_PAGES_PROXY_ENABLED: "1" })).toBe(false);
    expect(isPagesProxyEnabled({ HELMORA_CF_PAGES_PROXY_ENABLED: "TRUE" })).toBe(false);
  });

  it("returns typed safe 503 for missing invalid HTTP or non-origin HELMORA_HUB_URL", async () => {
    const cases: Array<{ env: PagesProxyEnv; label: string }> = [
      { label: "missing", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true" } },
      { label: "empty", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "   " } },
      { label: "http", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "http://hub.example.com" } },
      { label: "path", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com/api" } },
      { label: "query", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com?x=1" } },
      { label: "fragment", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com#x" } },
      { label: "userinfo", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://user:pass@hub.example.com" } },
      { label: "garbage", env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "not-a-url" } },
    ];
    for (const item of cases) {
      const fetchImpl = vi.fn();
      const response = await handlePagesHubProxy({
        request: new Request("https://app.example.com/health"),
        env: item.env,
        pagesOrigin: "https://app.example.com",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(response.status, item.label).toBe(503);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code, item.label).toBe("HUB_PROXY_CONFIG_INVALID");
      expect(body.error.message, item.label).not.toMatch(/hub\.example|user:pass|not-a-url|\/api/i);
      expect(fetchImpl, item.label).not.toHaveBeenCalled();
    }
  });

  it("rejects a Hub origin equal to the Pages origin to prevent a proxy loop", async () => {
    const fetchImpl = vi.fn();
    const response = await handlePagesHubProxy({
      request: new Request("https://app.example.com/version"),
      env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://app.example.com" },
      pagesOrigin: "https://app.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "HUB_PROXY_CONFIG_INVALID" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never proxies non-allowlisted paths", async () => {
    const fetchImpl = vi.fn();
    for (const path of ["/", "/index.html", "/assets/index.js", "/logo/helmora.svg", "/favicon.ico", "/chat"]) {
      expect(isHubProxyPath(path), path).toBe(false);
      const response = await handlePagesHubProxy({
        request: new Request(`https://app.example.com${path}`),
        env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com" },
        pagesOrigin: "https://app.example.com",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(response.status, path).toBe(404);
      expect(fetchImpl, path).not.toHaveBeenCalled();
    }
    for (const path of ["/api/v2/setup", "/v1/responses", "/mcp", "/mcp/tools", "/health", "/ready", "/version", "/openapi.json"]) {
      expect(isHubProxyPath(path), path).toBe(true);
    }
  });

  it("preserves path query method JSON body and auth headers", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.url).toBe("https://hub.example.com/api/v2/models?limit=2&cursor=abc");
      expect(request.method).toBe("POST");
      expect(await request.text()).toBe('{"hello":"world"}');
      expect(request.headers.get("cookie")).toBe("session=abc");
      expect(request.headers.get("authorization")).toBe("Bearer hlm_test");
      expect(request.headers.get("origin")).toBe("https://app.example.com");
      expect(request.headers.get("content-type")).toBe("application/json");
      expect(request.headers.get("x-csrf-token")).toBe("csrf-token");
      expect(request.headers.get("idempotency-key")).toBe("idem-1");
      expect(request.headers.get("accept")).toBe("application/json");
      expect(request.headers.get("host")).toBeNull();
      expect(request.headers.get("connection")).toBeNull();
      expect(request.headers.get("x-forwarded-for")).toBeNull();
      expect(request.headers.get("cf-connecting-ip")).toBeNull();
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=rotated; Path=/; HttpOnly",
          "cache-control": "no-store",
        },
      });
    });

    const response = await handlePagesHubProxy({
      request: new Request("https://app.example.com/api/v2/models?limit=2&cursor=abc", {
        method: "POST",
        headers: {
          cookie: "session=abc",
          authorization: "Bearer hlm_test",
          origin: "https://app.example.com",
          accept: "application/json",
          "content-type": "application/json",
          "x-csrf-token": "csrf-token",
          "idempotency-key": "idem-1",
          host: "app.example.com",
          connection: "keep-alive",
          "x-forwarded-for": "1.2.3.4",
          "cf-connecting-ip": "1.2.3.4",
        },
        body: JSON.stringify({ hello: "world" }),
      }),
      env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com" },
      pagesOrigin: "https://app.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBe("session=rotated; Path=/; HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("preserves PATCH and DELETE methods", async () => {
    for (const method of ["PATCH", "DELETE"] as const) {
      const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        expect(request.method).toBe(method);
        return new Response(null, { status: 204 });
      });
      const response = await handlePagesHubProxy({
        request: new Request("https://app.example.com/api/v2/models/x", { method }),
        env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com" },
        pagesOrigin: "https://app.example.com",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(response.status).toBe(204);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps upstream error status and body intact when Hub responds", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "Login required." } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }));
    const response = await handlePagesHubProxy({
      request: new Request("https://app.example.com/api/v2/auth/session"),
      env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com" },
      pagesOrigin: "https://app.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "AUTH_REQUIRED", message: "Login required." } });
  });

  it("maps network failure to HUB_UNREACHABLE without leaking URL or error text", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND hub.example.com secret-stack");
    });
    const response = await handlePagesHubProxy({
      request: new Request("https://app.example.com/ready"),
      env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com" },
      pagesOrigin: "https://app.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("HUB_UNREACHABLE");
    expect(body.error.message).not.toMatch(/hub\.example|ENOTFOUND|secret-stack/i);
  });

  it("returns SSE without buffering the full upstream stream", async () => {
    let releaseSecond: (() => void) | undefined;
    const secondChunk = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: ping\ndata: 1\n\n"));
        void secondChunk.then(() => {
          controller.enqueue(encoder.encode("event: done\ndata: 2\n\n"));
          controller.close();
        });
      },
    });
    const fetchImpl = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));

    const responsePromise = handlePagesHubProxy({
      request: new Request("https://app.example.com/v1/responses", { method: "POST", body: "{}" }),
      env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com" },
      pagesOrigin: "https://app.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(response.body).not.toBeNull();
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: ping");
    releaseSecond?.();
    const second = await reader.read();
    expect(new TextDecoder().decode(second.value)).toContain("event: done");
  });

  it("propagates request abort to the upstream fetch", async () => {
    const controller = new AbortController();
    let sawAbort = false;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      expect(signal).toBeTruthy();
      await new Promise<void>((resolve, reject) => {
        signal!.addEventListener("abort", () => {
          sawAbort = true;
          reject(signal!.reason ?? new DOMException("Aborted", "AbortError"));
        });
      });
      return new Response("late");
    });
    const pending = handlePagesHubProxy({
      request: new Request("https://app.example.com/api/v2/tasks", { signal: controller.signal }),
      env: { HELMORA_CF_PAGES_PROXY_ENABLED: "true", HELMORA_HUB_URL: "https://hub.example.com" },
      pagesOrigin: "https://app.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    controller.abort(new DOMException("client left", "AbortError"));
    const response = await pending;
    expect(sawAbort).toBe(true);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "HUB_UNREACHABLE" } });
  });

  it("ships _routes.json for every Hub family and excludes static SPA assets", () => {
    const routes = JSON.parse(readFileSync(join(root, "public/_routes.json"), "utf8")) as {
      version: number;
      include: string[];
      exclude: string[];
    };
    expect(routes.version).toBe(1);
    expect(routes.include).toEqual([...HUB_PROXY_ROUTE_INCLUDES]);
    for (const pattern of ["/assets/*", "/logo/*", "/favicon.ico"]) {
      expect(routes.exclude).toContain(pattern);
    }
  });

  it("keeps ApiClient on relative same-origin URLs", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient();
    await client.request("/api/v2/example");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v2/example");
    vi.unstubAllGlobals();
  });

  it("does not require the Pages proxy flag in the Node serve.mjs path", () => {
    const source = readFileSync(join(root, "scripts/serve.mjs"), "utf8");
    expect(source).toContain("HELMORA_HUB_URL");
    expect(source).not.toContain("HELMORA_CF_PAGES_PROXY_ENABLED");
    expect(source).toContain('pathname.startsWith("/api/")');
    expect(source).toContain('pathname.startsWith("/v1/")');
  });
});

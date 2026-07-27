/**
 * Platform-neutral Cloudflare Pages Hub reverse-proxy.
 * Uses only Web Platform APIs so the same module runs in Vitest and Pages Functions.
 */

export const HUB_PROXY_ROUTE_INCLUDES = [
  "/api/*",
  "/v1/*",
  "/mcp",
  "/mcp/*",
  "/health",
  "/ready",
  "/version",
  "/openapi.json",
] as const;

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "cf-ipcountry",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

export interface PagesProxyEnv {
  HELMORA_CF_PAGES_PROXY_ENABLED?: string;
  HELMORA_HUB_URL?: string;
}

export interface PagesProxyInput {
  request: Request;
  env: PagesProxyEnv;
  pagesOrigin: string;
  fetchImpl?: typeof fetch;
}

export function isPagesProxyEnabled(env: PagesProxyEnv): boolean {
  return env.HELMORA_CF_PAGES_PROXY_ENABLED === "true";
}

export function isHubProxyPath(pathname: string): boolean {
  if (pathname === "/mcp" || pathname === "/health" || pathname === "/ready" || pathname === "/version" || pathname === "/openapi.json") {
    return true;
  }
  return pathname.startsWith("/api/") || pathname.startsWith("/v1/") || pathname.startsWith("/mcp/");
}

export function validateHubOrigin(
  raw: string | undefined,
  pagesOrigin: string,
): { ok: true; origin: string } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:") return { ok: false };
  if (url.username || url.password) return { ok: false };
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return { ok: false };
  if (url.origin === pagesOrigin) return { ok: false };
  return { ok: true, origin: url.origin };
}

export async function handlePagesHubProxy(input: PagesProxyInput): Promise<Response> {
  const url = new URL(input.request.url);
  if (!isHubProxyPath(url.pathname)) {
    return jsonError(404, "NOT_FOUND", "This path is not served by the Hub proxy.");
  }
  if (!isPagesProxyEnabled(input.env)) {
    return jsonError(503, "HUB_PROXY_DISABLED", "The Cloudflare Pages Hub proxy is not enabled.");
  }
  const hub = validateHubOrigin(input.env.HELMORA_HUB_URL, input.pagesOrigin);
  if (!hub.ok) {
    return jsonError(503, "HUB_PROXY_CONFIG_INVALID", "The Cloudflare Pages Hub proxy configuration is invalid.");
  }

  const target = new URL(`${url.pathname}${url.search}`, `${hub.origin}/`);
  const headers = forwardRequestHeaders(input.request.headers);
  const init: RequestInit = {
    method: input.request.method,
    headers,
    redirect: "manual",
    signal: input.request.signal,
  };
  if (input.request.method !== "GET" && input.request.method !== "HEAD") {
    init.body = input.request.body;
    Object.assign(init, { duplex: "half" });
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const upstream = await fetchImpl(target, init);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: forwardResponseHeaders(upstream.headers),
    });
  } catch {
    return jsonError(502, "HUB_UNREACHABLE", "Helmora Hub could not be reached through the Pages proxy.");
  }
}

function forwardRequestHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_REQUEST_HEADERS.has(lower)) return;
    if (lower.startsWith("cf-")) return;
    headers.set(key, value);
  });
  return headers;
}

function forwardResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "connection" || lower === "keep-alive" || lower === "transfer-encoding") return;
    headers.append(key, value);
  });
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return headers;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

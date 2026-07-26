import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = realpathSync(resolve(root, "dist"));
const host = process.env.HELMORA_WEB_HOST?.trim() || "127.0.0.1";
const port = integer("HELMORA_WEB_PORT", 4173, 0, 65535);
const hub = new URL(process.env.HELMORA_HUB_URL?.trim() || "http://127.0.0.1:3000");
if (!["http:", "https:"].includes(hub.protocol) || hub.username || hub.password) throw new Error("HELMORA_HUB_URL must be an HTTP(S) URL without embedded credentials.");

const mime = new Map([
  [".avif", "image/avif"], [".css", "text/css; charset=utf-8"], [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"], [".ico", "image/x-icon"], [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"], [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".png", "image/png"], [".svg", "image/svg+xml"], [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"], [".webp", "image/webp"], [".woff", "font/woff"], [".woff2", "font/woff2"],
]);
const apiPaths = new Set(["/health", "/ready", "/version", "/openapi.json"]);
const csp = "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";

const server = createServer((incoming, outgoing) => {
  const url = new URL(incoming.url ?? "/", `http://${host}:${port}`);
  if (isApi(url.pathname)) { proxy(incoming, outgoing, url); return; }
  if (!["GET", "HEAD"].includes(incoming.method ?? "GET")) { outgoing.writeHead(405).end(); return; }
  serveStatic(incoming.method ?? "GET", url.pathname, outgoing);
});
server.requestTimeout = 125_000;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 65_000;
server.listen(port, host, () => {
  const address = server.address();
  const actualPort = address && typeof address !== "string" ? address.port : port;
  console.log(`Helmora-Web listening on http://${host}:${actualPort} and proxying Hub at ${hub.origin}`);
});
process.once("SIGINT", () => server.close());
process.once("SIGTERM", () => server.close());

function isApi(pathname) {
  return apiPaths.has(pathname) || pathname === "/mcp" || pathname.startsWith("/mcp/") || pathname.startsWith("/api/") || pathname.startsWith("/v1/");
}

function proxy(incoming, outgoing, url) {
  const target = new URL(`${url.pathname}${url.search}`, hub);
  const headers = { ...incoming.headers, host: target.host, "x-forwarded-host": incoming.headers.host ?? "", "x-forwarded-proto": "http" };
  delete headers.connection;
  const upstream = (target.protocol === "https:" ? httpsRequest : httpRequest)({
    protocol: target.protocol, hostname: target.hostname, port: target.port || undefined,
    method: incoming.method, path: `${target.pathname}${target.search}`, headers,
  }, (response) => {
    const responseHeaders = { ...response.headers };
    delete responseHeaders.connection;
    delete responseHeaders["transfer-encoding"];
    outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
    response.pipe(outgoing);
  });
  upstream.once("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    outgoing.end(JSON.stringify({ error: { code: "HUB_UNREACHABLE", message: "Helmora Hub could not be reached through the Web proxy." } }));
  });
  incoming.once("aborted", () => upstream.destroy());
  outgoing.once("close", () => { if (!outgoing.writableFinished) upstream.destroy(); });
  incoming.pipe(upstream);
}

function serveStatic(method, pathname, response) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400).end(); return; }
  if (decoded.includes("\\") || decoded.split("/").some((segment) => segment.startsWith("."))) { response.writeHead(404).end(); return; }
  const requested = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const extension = extname(requested).toLowerCase();
  const selected = extension ? secureFile(requested) : secureFile(requested) ?? secureFile("index.html");
  if (!selected) { response.writeHead(404).end(); return; }
  response.writeHead(200, {
    "content-type": mime.get(extname(selected.path).toLowerCase()), "content-length": selected.size,
    "content-security-policy": csp, "cross-origin-opener-policy": "same-origin", "x-content-type-options": "nosniff",
    "x-frame-options": "DENY", "cache-control": selected.path.endsWith("index.html") ? "no-cache" : requested.startsWith("assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
  });
  if (method === "HEAD") response.end(); else createReadStream(selected.path).pipe(response);
}

function secureFile(relativePath) {
  const extension = extname(relativePath).toLowerCase();
  if (!mime.has(extension) || extension === ".map") return undefined;
  const candidate = resolve(dist, relativePath);
  const prefix = dist.endsWith(sep) ? dist : `${dist}${sep}`;
  if (!candidate.startsWith(prefix)) return undefined;
  try {
    const real = realpathSync(candidate); const stats = statSync(real);
    return real.startsWith(prefix) && stats.isFile() ? { path: real, size: stats.size } : undefined;
  } catch { return undefined; }
}

function integer(name, fallback, min, max) {
  const raw = process.env[name]; if (!raw) return fallback; const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}

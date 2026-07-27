import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(root, "dist");

const DOCUMENT_ROUTES = [
  "/",
  "/chat",
  "/conversations",
  "/research",
  "/providers",
  "/models",
  "/tasks",
  "/memory",
  "/files",
  "/knowledge",
  "/tools",
  "/api-keys",
  "/usage",
  "/audit",
  "/runtime",
] as const;

/**
 * Cloudflare Pages configuration contract.
 *
 * These assertions validate committed `_headers`, `_redirects`, and `_routes.json`
 * against the Cloudflare Pages configuration surface documented at:
 * - https://developers.cloudflare.com/pages/configuration/headers/
 * - https://developers.cloudflare.com/pages/configuration/redirects/
 *
 * They are not a live Cloudflare deployment test. Effective Cache-Control on
 * 200 SPA rewrite responses remains a remaining live-deployment validation item
 * because redirects/proxying run before headers and local `serve.mjs` cannot
 * prove Pages edge behavior for rewritten document routes.
 */
describe("Cloudflare Pages configuration contract", () => {
  it("ships _headers that revalidate HTML targets and immutably cache hashed assets", () => {
    const headersPath = join(root, "public/_headers");
    expect(existsSync(headersPath), "public/_headers must exist").toBe(true);
    const headers = readFileSync(headersPath, "utf8");
    expect(headers).toMatch(/\/index\.html[\s\S]*Cache-Control:\s*no-cache/i);
    expect(headers).toMatch(/\/assets\/\*[\s\S]*Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i);
    expect(headers).not.toMatch(/\/assets\/\*[\s\S]*no-store/i);
    // Avoid a broad /* no-cache rule that would combine with immutable asset headers.
    expect(headers).not.toMatch(/\/\*\s*\r?\n\s*Cache-Control:\s*no-cache/i);
  });

  it("ships _redirects with only Cloudflare-supported status codes and explicit SPA rewrites", () => {
    const redirectsPath = join(root, "public/_redirects");
    expect(existsSync(redirectsPath), "public/_redirects must exist").toBe(true);
    const lines = readFileSync(redirectsPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    // Cloudflare Pages supports 301/302/303/307/308 redirects and 200 proxying;
    // other rewrite status codes (including 404) are unsupported.
    // https://developers.cloudflare.com/pages/configuration/redirects/
    const validStatuses = new Set([200, 301, 302, 303, 307, 308]);
    const parsed = lines.map((line) => {
      const parts = line.split(/\s+/);
      const from = parts[0] ?? "";
      const to = parts[1] ?? "";
      const statusRaw = parts[2] ? parseInt(parts[2], 10) : 302;
      return { from, to, status: statusRaw, line };
    });

    for (const rule of parsed) {
      expect(validStatuses.has(rule.status), `unsupported status code ${rule.status} in _redirects line: "${rule.line}"`).toBe(true);
    }

    const broadCatchAll = parsed.find((r) => r.from === "/*" && r.status === 200);
    expect(broadCatchAll, "/* /index.html 200 catch-all is prohibited as it intercepts missing static assets").toBeUndefined();

    for (const route of DOCUMENT_ROUTES) {
      const match = parsed.find((r) => r.from === route && r.to === "/index.html" && r.status === 200);
      expect(match, `missing explicit SPA rewrite for document route "${route}"`).toBeDefined();
    }
  });

  it("keeps Pages Function routes off /assets/*", () => {
    const routes = JSON.parse(readFileSync(join(root, "public/_routes.json"), "utf8")) as {
      exclude: string[];
    };
    expect(routes.exclude).toContain("/assets/*");
  });

  it("production dist includes every statically referenced lazy chunk from the entry bundle", () => {
    expect(existsSync(join(dist, "index.html")), "run a production build before this assertion").toBe(true);
    const html = readFileSync(join(dist, "index.html"), "utf8");
    const entryMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    expect(entryMatch?.[1]).toBeTruthy();
    const entryPath = join(dist, entryMatch![1]!.replace(/^\//, ""));
    expect(existsSync(entryPath)).toBe(true);
    const entry = readFileSync(entryPath, "utf8");
    const lazyChunks = new Set<string>();
    for (const match of entry.matchAll(/import\(`\.\/([^`]+?\.js)`\)/g)) {
      lazyChunks.add(match[1]!);
    }
    expect(lazyChunks.size).toBeGreaterThan(5);
    expect([...lazyChunks].some((name) => name.startsWith("ChatPage-"))).toBe(true);
    for (const name of lazyChunks) {
      expect(existsSync(join(dist, "assets", name)), `missing lazy chunk ${name}`).toBe(true);
    }
    expect(existsSync(join(dist, "_headers"))).toBe(true);
    expect(existsSync(join(dist, "_redirects"))).toBe(true);
    expect(existsSync(join(dist, "_routes.json"))).toBe(true);
  });

  it("prohibits scrollbar-width: none and zero-sized webkit scrollbars in enhanced CSS", () => {
    const css = readFileSync(join(root, "src/app/AppShell.css"), "utf8");
    expect(css).not.toMatch(/\.helmora-scroll--enhanced\s+\.helmora-scroll__viewport\s*\{\s*scrollbar-width:\s*none;/);
    expect(css).not.toMatch(/\.helmora-scroll--enhanced\s+\.helmora-scroll__viewport::-webkit-scrollbar\s*\{\s*width:\s*0;\s*height:\s*0;/);
  });
});

/**
 * Local standalone `scripts/serve.mjs` behavior.
 *
 * Proves Node static delivery for document routes, hashed assets, missing-asset
 * 404s, and cache headers implemented by the local server. This is not evidence
 * of Cloudflare Pages edge cache behavior.
 */
describe("local standalone serve.mjs behavior", () => {
  let child: ChildProcessWithoutNullStreams | undefined;
  let base = "";
  let chatChunk = "";
  let entryChunk = "";

  beforeAll(async () => {
    expect(existsSync(join(dist, "index.html"))).toBe(true);
    const html = readFileSync(join(dist, "index.html"), "utf8");
    entryChunk = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1] ?? "";
    const entry = readFileSync(join(dist, entryChunk.replace(/^\//, "")), "utf8");
    chatChunk = [...entry.matchAll(/import\(`\.\/(ChatPage-[^`]+?\.js)`\)/g)][0]?.[1]
      ? `/assets/${[...entry.matchAll(/import\(`\.\/(ChatPage-[^`]+?\.js)`\)/g)][0]![1]}`
      : "";
    expect(entryChunk).toBeTruthy();
    expect(chatChunk).toBeTruthy();

    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [join(root, "scripts/serve.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        HELMORA_WEB_HOST: "127.0.0.1",
        HELMORA_WEB_PORT: String(port),
        HELMORA_HUB_URL: "http://127.0.0.1:9",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitFor(() => fetch(`${base}/`).then((response) => response.ok), 15_000);
  }, 30_000);

  afterAll(async () => {
    if (!child) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      child?.once("exit", () => resolve());
      setTimeout(() => {
        child?.kill("SIGKILL");
        resolve();
      }, 2_000);
    });
  });

  it("serves explicit SPA document routes as current index.html with revalidation headers", async () => {
    for (const path of DOCUMENT_ROUTES) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/text\/html/);
      const cacheControl = response.headers.get("cache-control") ?? "";
      expect(cacheControl).toMatch(/no-cache/i);
      expect(cacheControl).not.toMatch(/no-store/i);
      const body = await response.text();
      expect(body).toMatch(/<div id="root"><\/div>/);
      expect(body).not.toMatch(/Failed to fetch dynamically imported module/);
    }
  });

  it("serves existing entry and Chat chunks as JavaScript with immutable caching", async () => {
    for (const path of [entryChunk, chatChunk]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/javascript/);
      expect(response.headers.get("cache-control")).toMatch(/immutable|max-age=31536000/i);
      const body = await response.text();
      expect(body.startsWith("<!doctype html>")).toBe(false);
      expect(/function|import|export|const |let |var /.test(body)).toBe(true);
    }
  });

  it("returns a real 404 without SPA HTML for missing /assets/*.js", async () => {
    const response = await fetch(`${base}/assets/does-not-exist.js`);
    expect(response.status).toBe(404);
    const type = response.headers.get("content-type") ?? "";
    const body = await response.text();
    expect(body.includes("<div id=\"root\">")).toBe(false);
    expect(body.includes("<!doctype html>")).toBe(false);
    expect(type.includes("text/html")).toBe(false);
  });
});

describe("serve.mjs path containment vs SPA fallback", () => {
  it("does not SPA-fallback extensioned assets in source", () => {
    const source = readFileSync(join(root, "scripts/serve.mjs"), "utf8");
    expect(source).toContain("secureFile(requested)");
    expect(source).toMatch(/extension\s*\?\s*secureFile\(requested\)/);
  });
});

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitFor(probe: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await probe()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${String(lastError ?? "timeout")}`);
}

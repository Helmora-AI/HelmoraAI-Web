import { test as base, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Readable } from "node:stream";

export const OWNER = {
  tenantName: "Browser verification",
  username: "e2e-owner",
  password: "correct-horse-browser-staple",
} as const;
export const SETUP_TOKEN = "helmora-e2e-local-setup-token-32chars";

export interface BrowserApp {
  baseURL: string;
  mockURL: string;
}

interface FixturePayload extends BrowserApp {
  dataDir: string;
}

interface Fixtures {
  app: BrowserApp;
  page: Page;
}

type BrowserFixtureProcess = ChildProcessByStdio<null, Readable, Readable>;

const ROOT = resolve(import.meta.dirname, "../..");

export const test = base.extend<Fixtures>({
  app: async ({}, use) => {
    const child = spawn(process.execPath, [resolve(ROOT, "test/browser-fixture-server.mjs")], {
      cwd: ROOT,
      env: normalizedEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const fixture = await waitForFixture(child);
    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (message) process.stderr.write(`[browser-fixture] ${message}\n`);
    });
    try {
      await use({ baseURL: fixture.baseURL, mockURL: fixture.mockURL });
    } finally {
      await stopChild(child);
      if (existsSync(fixture.dataDir)) rmSync(fixture.dataDir, { recursive: true, force: true });
    }
  },
  page: async ({ page }, use, testInfo) => {
    await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//u, async (route) => {
      await route.abort("blockedbyclient");
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const network: Array<{ method: string; resourceType: string; url: string }> = [];
    page.on("request", (request) => {
      network.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: redactUrl(request.url()),
      });
    });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        await page.addStyleTag({
          content: [
            "input[type=password], [data-sensitive=true] {",
            "  color: transparent !important;",
            "  text-shadow: none !important;",
            "  background-image: linear-gradient(#777,#777) !important;",
            "}",
          ].join("\n"),
        });
        const path = testInfo.outputPath("failure-redacted.png");
        await page.screenshot({ path, fullPage: true });
        await testInfo.attach("failure-redacted", { path, contentType: "image/png" });
      } catch {}
      await testInfo.attach("network-redacted", {
        body: Buffer.from(JSON.stringify(network.slice(-250), null, 2)),
        contentType: "application/json",
      });
    }
  },
});

export { expect };

async function waitForFixture(child: BrowserFixtureProcess): Promise<FixturePayload> {
  return await new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Browser fixture did not start within 15 seconds. ${stderr.slice(-2_000)}`));
    }, 15_000);
    const finish = (callback: () => void) => {
      clearTimeout(timeout);
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.removeAllListeners("exit");
      child.removeAllListeners("error");
      callback();
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const line = stdout.split(/\r?\n/u).find((entry) => entry.startsWith("HELMORA_E2E_READY "));
      if (!line) return;
      try {
        const parsed = JSON.parse(line.slice("HELMORA_E2E_READY ".length)) as FixturePayload;
        finish(() => { resolvePromise(parsed); });
      } catch (error) {
        finish(() => { reject(error); });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { finish(() => { reject(error); }); });
    child.once("exit", (code) => {
      finish(() => { reject(new Error(`Browser fixture exited with code ${String(code)}. ${stderr.slice(-2_000)}`)); });
    });
  });
}

async function stopChild(child: BrowserFixtureProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolvePromise) => child.once("exit", () => { resolvePromise(true); })),
    new Promise<boolean>((resolvePromise) => setTimeout(() => { resolvePromise(false); }, 3_000)),
  ]);
  if (!exited && child.pid) {
    child.kill("SIGKILL");
    await new Promise<void>((resolvePromise) => child.once("exit", () => { resolvePromise(); }));
  }
}

function normalizedEnvironment(): NodeJS.ProcessEnv {
  if (process.platform !== "win32") return { ...process.env };
  const entries = Object.entries(process.env);
  const environment = Object.fromEntries(entries.filter(([key]) => key.toLowerCase() !== "path"));
  const path = entries.find(([key]) => key === "Path")?.[1]
    ?? entries.find(([key]) => key.toLowerCase() === "path")?.[1];
  return path ? { ...environment, Path: path } : environment;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|code/iu.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return value;
  }
}

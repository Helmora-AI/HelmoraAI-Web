import { expect, type Page } from "@playwright/test";
import { OWNER, SETUP_TOKEN, type BrowserApp } from "./fixtures";

export interface AdminSession {
  cookie: string;
  csrf: string;
}

export async function seedOwner(app: BrowserApp): Promise<AdminSession> {
  const setup = await requestJson(app.baseURL, "/api/v2/setup", {
    method: "POST",
    headers: { "x-helmora-setup-token": SETUP_TOKEN },
    body: OWNER,
  }, 201);
  expect(String(setup.api_key)).toMatch(/^hlm_/u);

  const response = await fetch(`${app.baseURL}/api/v2/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: OWNER.username, password: OWNER.password }),
  });
  expect(response.status).toBe(200);
  const payload = await response.json() as { csrf_token: string };
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toBeTruthy();
  return { cookie: cookie!, csrf: payload.csrf_token };
}

export async function seedModelRoute(app: BrowserApp, session: AdminSession): Promise<void> {
  const connection = await adminJson(app, session, "/api/v2/providers/ollama/connections", {
    method: "POST",
    body: {
      name: "Browser fixture",
      baseUrl: `${app.mockURL}/v1`,
      authType: "none",
      maxConcurrency: 8,
    },
  }, 201);
  await adminJson(app, session, `/api/v2/connections/${encodeURIComponent(String(connection.id))}/test`, {
    method: "POST",
    body: {},
  }, 200);
  await adminJson(app, session, `/api/v2/connections/${encodeURIComponent(String(connection.id))}/verify`, {
    method: "POST",
    body: { model: "fixture-chat", maxTokens: 8 },
  }, 200);
  await adminJson(app, session, `/api/v2/connections/${encodeURIComponent(String(connection.id))}`, {
    method: "PATCH",
    body: { enabled: true },
  }, 200);
  await adminJson(app, session, "/api/v2/models", {
    method: "POST",
    body: {
      id: "fixture:model",
      providerId: "ollama",
      upstreamId: "fixture-chat",
      displayName: "Fixture model",
      family: "fixture",
      contextWindow: 8192,
      maxOutputTokens: 2048,
      capabilities: {
        modalities: ["text"],
        tools: true,
        parallelTools: false,
        structuredOutput: true,
        reasoning: false,
        streaming: true,
        embeddings: false,
      },
      pricing: {},
      catalogRevision: "browser-e2e",
    },
  }, 201);
  await adminJson(app, session, "/api/v2/routes", {
    method: "POST",
    body: {
      id: "fixture-route",
      strategy: "balanced",
      targets: [{ modelId: "fixture:model", connectionId: connection.id, priority: 10 }],
    },
  }, 201);
}

export async function loginThroughUi(page: Page, app: BrowserApp): Promise<void> {
  await page.goto(app.baseURL);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Username").fill(OWNER.username);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in to Helmora" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
}

export async function adminJson(
  app: BrowserApp,
  session: AdminSession,
  path: string,
  options: { method: string; body?: unknown },
  expectedStatus: number,
): Promise<Record<string, unknown>> {
  return await requestJson(app.baseURL, path, {
    method: options.method,
    headers: { cookie: session.cookie, "x-csrf-token": session.csrf },
    ...(options.body === undefined ? {} : { body: options.body }),
  }, expectedStatus);
}

async function requestJson(
  baseURL: string,
  path: string,
  options: { method: string; headers?: Record<string, string>; body?: unknown },
  expectedStatus: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method,
    headers: { "content-type": "application/json", ...options.headers },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const payload = await response.json() as Record<string, unknown>;
  expect(response.status, `${options.method} ${path}: ${JSON.stringify(payload)}`).toBe(expectedStatus);
  return payload;
}

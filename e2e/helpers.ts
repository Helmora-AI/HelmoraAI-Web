import { expect, type Locator, type Page } from "@playwright/test";
import { OWNER, SETUP_TOKEN, type BrowserApp } from "./fixtures";

export interface AdminSession {
  cookie: string;
  csrf: string;
}

/** Select a closed-set Astryx Typeahead option by accessible label and search query. */
export async function selectTypeahead(
  scope: Page | Locator,
  label: string,
  query: string,
  optionName?: string | RegExp,
): Promise<void> {
  const host = "goto" in scope ? scope : scope.page();
  const field = scope.getByRole("combobox", { name: label });
  const wrapper = scope
    .locator(".helmora-searchable-select, .chat-toolbar__model")
    .filter({ has: scope.getByRole("combobox", { name: label }) })
    .first();

  const token = wrapper.getByRole("button").first();
  // Prefer the selected token when present — WebKit can still report the hidden
  // combobox as having a non-zero box while Playwright click waits forever.
  if ((await token.count()) > 0 && await token.isVisible()) {
    await token.click();
    await expect.poll(async () => isComboboxInteractable(field)).toBe(true);
  } else if (await isComboboxInteractable(field)) {
    await field.click();
  } else {
    await wrapper.click();
    await expect.poll(async () => isComboboxInteractable(field)).toBe(true);
  }

  await field.fill(query);
  const listbox = host.getByRole("listbox");
  await expect(listbox).toBeVisible();
  // Prefer an explicit option accessible name when provided; otherwise match the
  // query as a literal substring (IDs like "browser:model" are not word-boundary safe).
  const name = optionName ?? new RegExp(escapeRegExp(query), "i");
  let optionLocator = listbox.getByRole("option", { name });
  if ((await optionLocator.count()) === 0) {
    // Query may not match label (e.g. id vs display name). Fall back to full list.
    await field.fill("");
    await field.press("ArrowDown");
    optionLocator = listbox.getByRole("option", { name });
  }
  await expect(optionLocator.first()).toBeVisible();
  await optionLocator.first().click();
}

/** Assert a Typeahead shows the selected label/id in its control (token or value). */
export async function expectTypeaheadSelection(scope: Page | Locator, label: string, text: string | RegExp): Promise<void> {
  const labeled = scope.locator(".helmora-searchable-select, .chat-toolbar__model").filter({ hasText: label }).first();
  await expect(labeled.getByText(text).first()).toBeVisible();
}

async function isComboboxInteractable(field: Locator): Promise<boolean> {
  try {
    return await field.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.opacity !== "0"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width >= 2
        && rect.height >= 2;
    });
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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

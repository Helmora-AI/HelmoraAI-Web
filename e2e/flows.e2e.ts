import { test, expect, OWNER, SETUP_TOKEN } from "./fixtures";
import { adminJson, expectTypeaheadSelection, loginThroughUi, seedModelRoute, seedOwner, selectTypeahead } from "./helpers";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("first-run setup reveals a key once, copies it, and never persists it", async ({ page, app, browserName }) => {
  await page.goto(app.baseURL);
  await page.getByLabel("Workspace name").fill(OWNER.tenantName);
  await page.getByLabel("Owner username").fill(OWNER.username);
  await page.getByLabel("Owner password").fill(OWNER.password);
  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: "Initialize Helmora Hub" }).click();

  await expect(page.getByRole("heading", { name: "Save your client key" })).toBeVisible();
  const key = await page.locator("[data-sensitive=true]").textContent();
  expect(key).toMatch(/^hlm_/u);
  await page.getByRole("button", { name: "Copy key" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  if (browserName === "chromium") {
    expect(await page.evaluate(async () => await navigator.clipboard.readText())).toBe(key);
  }

  const serializedStorage = await page.evaluate(() => JSON.stringify({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  expect(serializedStorage).not.toContain(key!);

  await page.getByLabel("I saved the API key somewhere secure.").check();
  await page.getByRole("button", { name: "Continue to control plane" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain("helmora_session");

  const duplicate = await page.request.post(`${app.baseURL}/api/v2/setup`, {
    headers: { "x-helmora-setup-token": SETUP_TOKEN },
    data: OWNER,
  });
  expect(duplicate.status()).toBe(409);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.locator("[data-sensitive=true]")).toHaveCount(0);
});

test("login restores across reload, clears failed passwords, and logout reaches other tabs", async ({ page, app, context }) => {
  await seedOwner(app);
  await page.goto(app.baseURL);
  await page.getByLabel("Username").fill(OWNER.username);
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in to Helmora" }).click();
  await expect(page.getByRole("alert")).toContainText("AUTHENTICATION_FAILED");
  await expect(page.getByLabel("Password")).toHaveValue("");

  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in to Helmora" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain("helmora_session");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

  const second = await context.newPage();
  await second.goto(app.baseURL);
  await expect(second.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await second.reload();
  await expect(second.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await second.close();
});

test("browser distinguishes CSRF authorization failure from an expired session", async ({ page, app }) => {
  const session = await seedOwner(app);
  const conversation = await adminJson(app, session, "/api/v2/conversations", {
    method: "POST",
    body: { title: "CSRF browser fixture" },
  }, 201);
  await loginThroughUi(page, app);
  await page.goto(`${app.baseURL}/conversations`);
  await page.getByRole("button", { name: /CSRF browser fixture/u }).click();
  await page.getByLabel("Title").fill("CSRF mutation denied");

  let stripped = false;
  await page.route("**/api/v2/conversations/**", async (route) => {
    if (!stripped && route.request().method() === "PATCH") {
      stripped = true;
      const headers = { ...route.request().headers() };
      delete headers["x-csrf-token"];
      await route.continue({ headers });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("alert")).toContainText("CSRF_INVALID");
  await page.unroute("**/api/v2/conversations/**");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { name: "CSRF mutation denied" })).toBeVisible();

  const revoked = await fetch(`${app.mockURL}/__fixture/revoke-sessions`, { method: "POST" });
  expect(revoked.status).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(String(conversation.id)).toMatch(/^conv_/u);
});

test("provider, model, route and one-time API-key administration work through the UI", async ({ page, app }) => {
  await seedOwner(app);
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/providers`);
  await page.getByLabel("Search catalog").fill("ollama");
  const ollamaCard = page.locator(".provider-card").filter({ has: page.getByRole("heading", { name: "Ollama", exact: true }) });
  await expect(ollamaCard).toBeVisible();
  await ollamaCard.getByRole("button", { name: "Configure" }).click();
  const modal = page.getByRole("dialog", { name: /Configure Ollama/u });
  await expect(modal).toBeVisible();
  await modal.locator(".connection-picker select").selectOption("new");
  await modal.getByLabel("Connection name").fill("Browser managed fixture");
  await modal.getByLabel("Base URL").fill(`${app.mockURL}/v1`);
  await modal.getByLabel("Verify model").fill("fixture-chat");
  await modal.getByRole("button", { name: "Save & Verify" }).click();
  await expect(modal.locator(".inline-alert--success")).toBeVisible();
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(ollamaCard.getByText("Browser managed fixture", { exact: true })).toBeVisible();
  await expect(ollamaCard.getByText("Ready", { exact: true })).toBeVisible();
  await ollamaCard.getByRole("button", { name: "Enable" }).click();
  await expect(ollamaCard.getByText("Enabled", { exact: true })).toBeVisible();
  await ollamaCard.getByRole("button", { name: "Disable" }).click();
  await expect(ollamaCard.getByText("Disabled", { exact: true })).toBeVisible();
  await ollamaCard.getByRole("button", { name: "Enable" }).click();
  await expect(ollamaCard.getByText("Enabled", { exact: true })).toBeVisible();

  await page.goto(`${app.baseURL}/models`);
  await page.getByRole("button", { name: "Add model" }).click();
  await selectTypeahead(page, "Catalog provider", "ollama");
  await page.getByLabel("Upstream model ID").fill("fixture-chat");
  await page.getByLabel("Helmora model ID").fill("browser:model");
  await page.getByLabel("Display name").fill("Browser model");
  await page.getByLabel("Context window").fill("8192");
  await page.getByLabel("Max output tokens").fill("2048");
  await page.getByRole("button", { name: "Register model" }).click();
  await expect(page.getByText("Browser model", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Route profiles 0" }).click();
  await page.getByRole("button", { name: "Add route" }).click();
  await page.getByLabel("Route ID").fill("browser-route");
  await selectTypeahead(page, "Model", "Browser model", /Browser model|browser:model/i);
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText("browser-route", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate" }).click();
  await expect(page.locator(".json-preview")).toContainText("browser:model");
  await page.goto(`${app.baseURL}/api-keys`);
  await page.getByRole("button", { name: "Create API key" }).click();
  await page.getByLabel("Key name").fill("Browser verification key");
  await page.getByLabel("conversations:read").check();
  await page.getByText("Restrict this key to selected models", { exact: true }).click();
  await page.getByLabel("browser:model").check();
  await page.getByLabel("Requests per minute").fill("30");
  await page.getByLabel("Tokens per minute").fill("3000");
  await page.getByRole("button", { name: "Issue one-time key" }).click();
  const rawKey = await page.locator("[data-sensitive=true]").textContent();
  expect(rawKey).toMatch(/^hlm_/u);
  expect(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))).not.toContain(rawKey!);
  await page.getByLabel("I saved this key in a secure secret store.").check();
  await page.getByRole("button", { name: "Close one-time receipt" }).click();
  await expect(page.getByText("Browser verification key", { exact: true })).toBeVisible();
  const keyRow = page.getByRole("article").filter({ hasText: "Browser verification key" });
  await expect(keyRow).toContainText("Models: browser:model");
  await expect(keyRow).toContainText('"rpm":30');
  await expect(keyRow).toContainText('"tpm":3000');
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await keyRow.getByRole("button", { name: "Revoke" }).click();
  await expect(keyRow.getByText("Revoked", { exact: true })).toBeVisible();
});

test("models diagnose import edit enable disable and hard delete work through the UI", async ({ page, app }) => {
  const session = await seedOwner(app);
  const connection = await adminJson(app, session, "/api/v2/providers/ollama/connections", {
    method: "POST",
    body: {
      name: "Models diagnose fixture",
      baseUrl: `${app.mockURL}/v1`,
      authType: "none",
      maxConcurrency: 8,
    },
  }, 201);
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/models`);
  await selectTypeahead(page, "Diagnose provider", "ollama");
  await selectTypeahead(page, "Diagnose connection", String(connection.id));
  await page.getByRole("button", { name: "Diagnose", exact: true }).click();
  await expect(page.getByText("available", { exact: true })).toBeVisible();
  await expect(page.getByText("fixture-extra", { exact: true }).first()).toBeVisible();
  await page.locator(".discover-picker__row").filter({ hasText: "fixture-extra" }).locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Import selected" }).click();
  await expect(page.getByText(/Imported 1 model/u)).toBeVisible();

  const imported = page.locator(".data-table article").filter({ hasText: "fixture-extra" });
  await expect(imported).toContainText("Disabled");
  await imported.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Helmora model ID")).toHaveValue("ollama:fixture-extra");
  await page.getByLabel("Display name").fill("Browser discovered model");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Browser discovered model", { exact: true })).toBeVisible();

  const edited = page.locator(".data-table article").filter({ hasText: "Browser discovered model" });
  await edited.getByRole("button", { name: "Enable" }).click();
  await expect(edited.getByText("Enabled", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await edited.getByRole("button", { name: "Disable" }).click();
  await expect(edited.getByText("Disabled", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await edited.getByRole("button", { name: "Delete" }).click();
  await expect(edited).toHaveCount(0);
});

test("provider secret rotation, route deletion, model disable and connection deletion remain safe", async ({ page, app }) => {
  const session = await seedOwner(app);
  await seedModelRoute(app, session);
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/providers`);
  await page.getByLabel("Search catalog").fill("ollama");
  const ollamaCard = page.locator(".provider-card").filter({ has: page.getByRole("heading", { name: "Ollama", exact: true }) });
  await expect(ollamaCard.getByText("Browser fixture", { exact: true })).toBeVisible();
  await ollamaCard.getByRole("button", { name: "Configure" }).click();
  const modal = page.getByRole("dialog", { name: /Configure Ollama/u });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("Replace API key")).toBeVisible();
  await modal.getByLabel("Replace API key").fill("fixture-rotation-value");
  await modal.getByLabel("Verify model").fill("fixture-chat");
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("fixture-rotation-value", { exact: true })).toHaveCount(0);
  await expect(ollamaCard.getByText("Attention", { exact: true })).toBeVisible();
  await ollamaCard.getByRole("button", { name: "Configure" }).click();
  await modal.getByLabel("Verify model").fill("fixture-chat");
  await modal.getByRole("button", { name: "Save & Verify" }).click();
  await expect(modal.locator(".inline-alert--success")).toBeVisible();
  await modal.getByRole("button", { name: "Close" }).click();
  await ollamaCard.getByRole("button", { name: "Enable" }).click();
  await expect(ollamaCard.getByText("Enabled", { exact: true })).toBeVisible();

  await page.goto(`${app.baseURL}/models`);
  await page.getByRole("tab", { name: /Route profiles/u }).click();
  const routeCard = page.locator(".route-card").filter({ hasText: "fixture-route" });
  await routeCard.getByRole("button", { name: "Simulate" }).click();
  await expect(routeCard.locator(".json-preview")).toContainText("fixture:model");
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await routeCard.getByRole("button", { name: "Delete" }).click();
  await expect(routeCard).toHaveCount(0);

  await page.getByRole("tab", { name: /Model catalog/u }).click();
  const modelRow = page.locator(".data-table article").filter({ hasText: "Fixture model" });
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await modelRow.getByRole("button", { name: "Disable" }).click();
  await expect(modelRow.getByText("Disabled", { exact: true })).toBeVisible();
  await expect(modelRow.getByRole("button", { name: "Enable" })).toBeVisible();

  await page.goto(`${app.baseURL}/providers`);
  await page.getByLabel("Search catalog").fill("ollama");
  const removable = page.locator(".provider-card").filter({ has: page.getByRole("heading", { name: "Ollama", exact: true }) });
  await removable.getByRole("button", { name: "Configure" }).click();
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await page.getByRole("dialog", { name: /Configure Ollama/u }).getByRole("button", { name: "Delete connection" }).click();
  await expect(removable.getByText("Browser fixture", { exact: true })).toHaveCount(0);
});

test("direct SSE persists once, cancellation aborts upstream, and agent tools terminate", async ({ page, app, browserName }) => {
  const session = await seedOwner(app);
  await seedModelRoute(app, session);
  await loginThroughUi(page, app);
  await page.goto(`${app.baseURL}/chat`);
  await expectTypeaheadSelection(page, "Model", /fixture-route|Fixture model/i);

  await page.getByLabel("Message", { exact: true }).fill("Hello over a split CRLF stream");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".message--assistant")).toContainText("Hello from Helmora fixture.");
  await expect(page.locator(".sr-only[role=status]")).toHaveText("Response complete.");
  await page.getByRole("button", { name: "Copy response" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  if (browserName === "chromium") {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Hello from Helmora fixture.");
  }
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await page.reload();
  await expect(page.locator(".message--assistant")).toContainText("Hello from Helmora fixture.");
  await expect(page.locator(".message--assistant")).toHaveCount(1);

  await page.getByRole("button", { name: "New chat" }).click();
  await page.getByLabel("Message", { exact: true }).fill("Please run a slow stream for cancellation");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".message--assistant")).toContainText("segment-1");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.locator(".sr-only[role=status]")).toHaveText("Response stopped.");
  await expect(page.getByText("Generation stopped", { exact: true })).toBeVisible();
  await expect(page.locator(".message--assistant")).toContainText("segment-1");
  await page.reload();
  await expect(page.locator(".message--assistant")).toContainText("segment-1");
  await expect(page.locator(".message--assistant")).toHaveCount(1);
  await page.goto(`${app.baseURL}/usage`);
  await expect(page.locator(".request-list")).toContainText("cancelled");

  await page.goto(`${app.baseURL}/chat`);
  await page.getByRole("button", { name: "New chat" }).click();
  const agentToggle = page.locator("label.toggle").filter({ hasText: "Agent tools" });
  await agentToggle.click();
  await expect(agentToggle.locator("input")).toBeChecked();
  await page.getByLabel("Message", { exact: true }).fill("Calculate 2+2 with the calculator");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".message--assistant")).toContainText("The calculator returned 4.");
  await page.getByText("Run receipt", { exact: true }).click();
  await expect(page.locator(".run-receipt")).toContainText("Tool runs 1");
});

test("mobile navigation, keyboard escape, theme and reduced motion remain usable @mobile", async ({ page, app }) => {
  await seedOwner(app);
  await loginThroughUi(page, app);
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  const theme = page.getByRole("button", { name: "Theme is system; switch to light" });
  await theme.click();
  await expect(page.getByRole("button", { name: "Theme is light; switch to dark" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

test("tablet shell keeps navigation, content and touch targets usable @tablet", async ({ page, app }) => {
  await seedOwner(app);
  await loginThroughUi(page, app);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(menu).toBeVisible();
  await menu.click();
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Chat" }).click();
  await expect(page).toHaveURL(/\/chat$/u);
  await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  const box = await page.getByRole("button", { name: "Open navigation" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
});

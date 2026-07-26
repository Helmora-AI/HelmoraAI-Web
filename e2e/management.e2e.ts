import { test, expect } from "./fixtures";
import { adminJson, loginThroughUi, seedModelRoute, seedOwner } from "./helpers";

test("conversation search, rename, export, fork, archive, restore and deletion work through the UI", async ({ page, app }) => {
  const session = await seedOwner(app);
  const conversation = await adminJson(app, session, "/api/v2/conversations", {
    method: "POST",
    body: { title: "Needle lifecycle conversation" },
  }, 201);
  const conversationId = String(conversation.id);
  await adminJson(app, session, `/api/v2/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: { role: "user", content: "First lifecycle message" },
  }, 201);
  await adminJson(app, session, `/api/v2/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: { role: "assistant", content: "Second lifecycle message" },
  }, 201);
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/conversations`);
  await page.getByLabel("Search conversations").fill("Needle lifecycle");
  const row = page.locator(".record-row").filter({ hasText: "Needle lifecycle conversation" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator(".conversation-preview")).toContainText("First lifecycle message");
  await expect(page.locator(".conversation-preview")).toContainText("Second lifecycle message");

  await page.getByLabel("Title").fill("Needle lifecycle renamed");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { name: "Needle lifecycle renamed" })).toBeVisible();

  const downloadStarted = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  expect((await downloadStarted).suggestedFilename()).toBe(`helmora-${conversationId}.json`);

  const forkFinished = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && response.url().endsWith(`/api/v2/conversations/${conversationId}/fork`));
  await page.getByRole("button", { name: "Fork from latest" }).click();
  expect((await forkFinished).status()).toBe(201);

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived", { exact: true }).last()).toBeVisible();
  const archivedToggle = page.locator("label.toggle").filter({ hasText: "Archived" });
  await archivedToggle.click();
  await expect(archivedToggle.locator("input")).toBeChecked();
  const archivedRow = page.locator(".record-row").filter({ hasText: "Needle lifecycle renamed" });
  await expect(archivedRow).toBeVisible();
  await archivedRow.click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(archivedRow).toHaveCount(0);

  await archivedToggle.click();
  await expect(archivedToggle.locator("input")).not.toBeChecked();
  const restoredRow = page.locator(".record-row").filter({ hasText: "Needle lifecycle renamed" });
  await expect(restoredRow).toBeVisible();
  await restoredRow.click();
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(restoredRow).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Select a conversation" })).toBeVisible();
});

test("memory, files, knowledge, tools, search and durable research work through the UI", async ({ page, app }) => {
  await seedOwner(app);
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/memory`);
  await page.getByRole("button", { name: "Add memory" }).click();
  await page.getByLabel("Memory kind").selectOption("project");
  await page.getByLabel("Content").fill("Helmora browser verification memory");
  await page.getByText("Pin for retrieval priority").click();
  await page.getByRole("button", { name: "Save memory" }).click();
  const memory = page.locator(".memory-card").filter({ hasText: "Helmora browser verification memory" });
  await expect(memory).toContainText("Pinned");
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await memory.getByRole("button", { name: "Exclude" }).click();
  await expect(memory).toHaveCount(0);

  await page.goto(`${app.baseURL}/files`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "gateway-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Helmora gateway browser fixture"),
  });
  await page.getByRole("button", { name: "Upload to Hub" }).click();
  const file = page.locator(".file-list article").filter({ hasText: "gateway-notes.txt" });
  await expect(file).toContainText("TXT");
  const downloadStarted = page.waitForEvent("download");
  await file.getByRole("button", { name: "Download" }).click();
  expect((await downloadStarted).suggestedFilename()).toBe("gateway-notes.txt");
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await file.getByRole("button", { name: "Delete" }).click();
  await expect(file).toHaveCount(0);

  await page.goto(`${app.baseURL}/knowledge`);
  await page.getByLabel("New knowledge base").fill("Browser knowledge");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Browser knowledge" })).toBeVisible();
  await page.getByLabel("Document title").fill("Gateway architecture");
  await page.getByLabel("Document content").fill("The Helmora gateway routes inference safely and records receipts.");
  await page.getByRole("button", { name: "Add document" }).click();
  const document = page.locator(".document-list article").filter({ hasText: "Gateway architecture" });
  await expect(document).toContainText("routes inference safely");
  await page.getByPlaceholder("Test retrieval…").fill("routes inference");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".search-results")).toContainText("Gateway architecture");
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await document.getByRole("button", { name: "Delete" }).click();
  await expect(document).toHaveCount(0);
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await page.getByRole("button", { name: "Delete base" }).click();
  await expect(page.getByRole("heading", { name: "Browser knowledge" })).toHaveCount(0);

  await page.goto(`${app.baseURL}/tools`);
  await page.getByRole("button", { name: /calculator/iu }).click();
  await page.getByLabel("Arguments JSON").fill('{"expression":"6*7"}');
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByText("Execution result", { exact: true })).toBeVisible();
  await expect(page.locator(".json-preview").last()).toContainText("42");
  await page.getByLabel("Arguments JSON").fill("[]");
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByText("Arguments must be a JSON object.", { exact: true })).toBeVisible();
  await page.getByLabel("Arguments JSON").fill('{"expression":"6*7","unexpected":true}');
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByRole("alert")).toContainText("TOOL_ARGUMENTS_INVALID");
  await page.route("**/api/v2/tools/calculator/run", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "SCOPE_DENIED", message: "The current client cannot run this tool." } }),
    });
  });
  await page.getByLabel("Arguments JSON").fill('{"expression":"6*7"}');
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByRole("alert")).toContainText("SCOPE_DENIED");
  await page.unroute("**/api/v2/tools/calculator/run");

  await page.goto(`${app.baseURL}/research`);
  await page.getByLabel("Search query").fill("helmora gateway");
  await page.getByLabel("Freshness").selectOption("week");
  await page.getByLabel("Domains").fill("example.com");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "2 search results" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Helmora fixture search result" })).toBeVisible();

  await page.getByRole("tab", { name: "Fetch URL" }).click();
  await page.getByLabel("Public URL").fill(`${app.mockURL}/__fixture/private-document`);
  await page.getByRole("button", { name: "Fetch safely" }).click();
  await expect(page.getByText("Outbound URL resolves to a blocked network.", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Deep research" }).click();
  await page.getByLabel("Research question").fill("Summarize the deterministic gateway results");
  await page.getByRole("button", { name: "Start research task" }).click();
  await expect(page.locator(".task-focus")).toContainText("completed", { timeout: 15_000 });

  await page.goto(`${app.baseURL}/tasks`);
  const researchTask = page.locator(".record-row").filter({ hasText: "research" }).first();
  await expect(researchTask).toContainText("completed");
  await researchTask.click();
  await expect(page.locator(".task-events")).toContainText("completed");
});

test("queued cancellation and controlled task failure remain inspectable through the UI", async ({ page, app }) => {
  await seedOwner(app);
  const queuedResponse = await fetch(`${app.mockURL}/__fixture/tasks/queued`, { method: "POST" });
  expect(queuedResponse.status).toBe(201);
  const queued = await queuedResponse.json() as { id: string };
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/tasks`);
  const queuedRow = page.locator(".record-row").filter({ hasText: queued.id });
  await expect(queuedRow).toContainText("queued");
  await queuedRow.click();
  await page.getByRole("button", { name: "Cancel task" }).click();
  await expect(queuedRow).toContainText("cancelled");
  await expect(page.locator(".task-events")).toContainText("task.cancelled");

  const failedResponse = await fetch(`${app.mockURL}/__fixture/tasks/failed`, { method: "POST" });
  expect(failedResponse.status).toBe(201);
  const failed = await failedResponse.json() as { id: string };
  await page.reload();
  const failedRow = page.locator(".record-row").filter({ hasText: failed.id });
  await expect(failedRow).toContainText("failed");
  await failedRow.click();
  await expect(page.locator(".task-events")).toContainText("task.failed");
  await expect(page.getByText("Terminal payload", { exact: true })).toBeVisible();
  await expect(page.locator(".json-preview")).toContainText("BROWSER_FIXTURE_FAILURE");
});

test("usage inspection, redacted audit and webhook lifecycle work through operations UI", async ({ page, app }) => {
  const session = await seedOwner(app);
  await seedModelRoute(app, session);
  await adminJson(app, session, "/v1/chat/completions", {
    method: "POST",
    body: {
      model: "fixture-route",
      messages: [{ role: "user", content: "Create an operations request receipt" }],
    },
  }, 200);
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/usage`);
  const requestRow = page.locator(".request-list article").filter({ hasText: "fixture-route" });
  await expect(requestRow).toContainText("completed");
  await requestRow.getByRole("button", { name: "Inspect" }).click();
  const inspector = page.getByRole("dialog", { name: "Request details" });
  await expect(inspector).toContainText("completed");
  await expect(inspector).toContainText("ollama");
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);

  await page.goto(`${app.baseURL}/audit`);
  await page.getByLabel("Filter audit events").fill("connection.create");
  const auditRow = page.locator(".audit-list article").filter({ hasText: "connection.create" });
  await expect(auditRow).toContainText("success");
  await auditRow.locator("summary").click();
  await expect(auditRow.locator(".json-preview")).toContainText('"providerId": "ollama"');
  await expect(auditRow.locator(".json-preview")).not.toContainText(app.mockURL);
  await expect(auditRow.locator(".json-preview")).not.toContainText("apiKey");

  await page.goto(`${app.baseURL}/runtime`);
  await expect(page.getByRole("heading", { name: "Request capacity" })).toBeVisible();
  await expect(page.getByText("complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add webhook" }).click();
  await page.getByLabel("HTTPS endpoint").fill("https://example.com/helmora-browser-webhook");
  await page.getByLabel("Events").fill("request.completed, task.failed");
  await page.getByRole("button", { name: "Create webhook" }).click();
  await expect(page.getByText("Save the signing secret", { exact: true })).toBeVisible();
  const firstSecret = await page.locator("[data-sensitive=true]").textContent();
  expect(firstSecret?.length ?? 0).toBeGreaterThan(20);
  const storageAfterCreate = await page.evaluate(() => JSON.stringify({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  expect(storageAfterCreate).not.toContain(firstSecret!);
  await page.getByRole("button", { name: "I saved it" }).click();

  const webhookRow = page.locator(".webhook-list article").filter({ hasText: "helmora-browser-webhook" });
  await expect(webhookRow).toContainText("Enabled");
  await webhookRow.getByRole("button", { name: "Disable" }).click();
  await expect(webhookRow).toContainText("Disabled");
  await webhookRow.getByRole("button", { name: "Enable" }).click();
  await expect(webhookRow).toContainText("Enabled");
  await webhookRow.getByRole("button", { name: "Rotate" }).click();
  const rotatedSecret = await page.locator("[data-sensitive=true]").textContent();
  expect(rotatedSecret).not.toBe(firstSecret);
  expect((await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage)))))).not.toContain(rotatedSecret!);
  await page.getByRole("button", { name: "I saved it" }).click();
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await webhookRow.getByRole("button", { name: "Delete" }).click();
  await expect(webhookRow).toHaveCount(0);
});

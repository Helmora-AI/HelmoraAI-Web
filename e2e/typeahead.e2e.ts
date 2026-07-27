import { test, expect } from "./fixtures";
import { adminJson, expectTypeaheadSelection, loginThroughUi, seedOwner, selectTypeahead } from "./helpers";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("Configure Connection Typeahead Escape closes listbox without dismissing the modal", async ({ page, app }) => {
  const session = await seedOwner(app);
  await adminJson(app, session, "/api/v2/providers/ollama/connections", {
    method: "POST",
    body: {
      name: "Escape fixture",
      baseUrl: `${app.mockURL}/v1`,
      authType: "none",
      maxConcurrency: 4,
    },
  }, 201);
  await loginThroughUi(page, app);
  await page.goto(`${app.baseURL}/providers`);
  const ollamaCard = page.locator(".provider-card").filter({ has: page.getByRole("heading", { name: "Ollama", exact: true }) });
  await ollamaCard.getByRole("button", { name: "Configure" }).click();
  const modal = page.getByRole("dialog", { name: /Configure Ollama/u });
  await expect(modal).toBeVisible();

  // Enter edit mode on the selected connection token, then open the listbox.
  await modal.getByRole("button", { name: "Escape fixture" }).click();
  const combo = modal.getByRole("combobox", { name: "Connection" });
  await expect(combo).toBeVisible();
  await combo.press("ArrowDown");
  const listbox = page.getByRole("listbox", { name: /Search results/i });
  await expect(listbox).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  await expect(combo).toHaveAttribute("aria-expanded", "false", { timeout: 5_000 });
  await expect(listbox).toBeHidden();
  await expect(modal).toBeVisible();

  // Escape while editing a selected token restores the token; modal stays open.
  await modal.getByRole("button", { name: "Escape fixture" }).click();
  await expect(modal.getByRole("combobox", { name: "Connection" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal.getByRole("button", { name: "Escape fixture" })).toBeVisible();
  await expect(modal).toBeVisible();

  // Move focus out of the Typeahead, then Escape dismisses Configure.
  await modal.locator("header h3").click();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});

test("selectTypeahead can reopen a preselected field and change the controlled value", async ({ page, app }) => {
  await seedOwner(app);
  await loginThroughUi(page, app);
  await page.goto(`${app.baseURL}/models`);

  // Models diagnose provider may already show a selected token (e.g. Ollama).
  await selectTypeahead(page, "Diagnose provider", "openai", /OpenAI/i);
  await expectTypeaheadSelection(page, "Diagnose provider", /OpenAI/i);
  await expect(page.locator(".helmora-searchable-select").filter({ hasText: "Diagnose provider" }).getByText(/Ollama/i)).toHaveCount(0);

  await selectTypeahead(page, "Diagnose provider", "ollama", /Ollama/i);
  await expectTypeaheadSelection(page, "Diagnose provider", /Ollama/i);
});

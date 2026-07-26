import { test, expect } from "./fixtures";

test("first-run shell exposes an accessible deterministic setup state @public", async ({ page, app }) => {
  await page.goto(app.baseURL);
  await expect(page.getByRole("heading", { name: "Create your control plane" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Initialize Helmora Hub" })).toBeDisabled();
  await expect(page.getByLabel("Workspace name")).toHaveValue("Personal");
  await expect(page.getByLabel("Owner username")).toHaveValue("admin");

  const storage = await page.evaluate(async () => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    indexedDatabases: (await indexedDB.databases()).map((entry) => entry.name ?? ""),
  }));
  expect(Object.keys(storage.local).every((key) => key === "helmora.theme")).toBe(true);
  expect(storage.session).toEqual({});
  expect(storage.indexedDatabases).toEqual([]);
});

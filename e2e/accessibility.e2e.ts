import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { loginThroughUi, seedModelRoute, seedOwner } from "./helpers";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("critical product surfaces have no critical or serious accessibility violations", async ({ page, app }) => {
  await page.goto(app.baseURL);
  await assertAccessible(page, "setup");

  const session = await seedOwner(app);
  await page.reload();
  await assertAccessible(page, "login");
  await seedModelRoute(app, session);
  await loginThroughUi(page, app);

  for (const [name, path] of [
    ["overview", "/"],
    ["chat", "/chat"],
    ["providers", "/providers"],
    ["models-routes", "/models"],
    ["api-keys", "/api-keys"],
    ["runtime", "/runtime"],
  ] as const) {
    await page.goto(`${app.baseURL}${path}`);
    await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});
    await assertAccessible(page, name);
  }
});

async function assertAccessible(page: Page, surface: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(
    blocking.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.slice(0, 8).map((node) => ({
        target: node.target.join(" "),
        html: node.html.slice(0, 240),
        summary: node.failureSummary,
      })),
    })),
    `${surface}: ${blocking.map((item) => `${item.id} (${item.nodes.length})`).join(", ")}`,
  ).toEqual([]);
}

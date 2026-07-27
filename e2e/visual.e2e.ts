import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { loginThroughUi, seedModelRoute, seedOwner } from "./helpers";

test("release-critical desktop surfaces match approved visual baselines @visual", async ({ page, app }) => {
  await page.goto(app.baseURL);
  await visual(page, "setup-light.png");

  const session = await seedOwner(app);
  await page.reload();
  await visual(page, "login-light.png");

  await seedModelRoute(app, session);
  await loginThroughUi(page, app);
  await visual(page, "overview-light.png");

  await page.getByRole("button", { name: "Theme is system; switch to light" }).click();
  await page.getByRole("button", { name: "Theme is light; switch to dark" }).click();
  await visual(page, "overview-dark.png");
  await page.getByRole("button", { name: "Theme is dark; switch to system" }).click();

  await page.goto(`${app.baseURL}/chat`);
  await visual(page, "chat-empty-light.png");
  await page.getByLabel("Message", { exact: true }).fill("Visual regression response");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".message--assistant")).toContainText("Hello from Helmora fixture.");
  await visual(page, "chat-response-light.png", [page.locator(".chat-history__item small")]);

  for (const [path, name, selectors] of [
    ["/providers", "providers-light.png", [".provider-card__note", ".provider-card__pill"]],
    ["/models", "models-routes-light.png", []],
    ["/usage", "usage-light.png", [".request-list small", ".request-list article > div:nth-child(3)"]],
    ["/runtime", "runtime-light.png", [".runtime-board article:first-child p"]],
  ] as const) {
    await page.goto(`${app.baseURL}${path}`);
    if (path === "/providers") {
      await page.locator(".provider-card").first().waitFor({ state: "visible" });
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      });
    }
    await visual(page, name, selectors.map((selector) => page.locator(selector)));
  }
});

test("release-critical mobile shell matches approved visual baseline @mobile @visual", async ({ page, app }) => {
  await seedOwner(app);
  await loginThroughUi(page, app);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await visual(page, "mobile-navigation-light.png", [], false);
});

async function visual(page: Page, name: string, masks: Locator[] = [], fullPage = true): Promise<void> {
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});
  // Fixture aborts Google Fonts; settle with a bound so screenshot font waits cannot hang.
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready.catch(() => undefined),
      new Promise<void>((resolve) => { window.setTimeout(resolve, 400); }),
    ]);
  }).catch(() => {});
  await page.waitForTimeout(50);
  const latency = page.locator(".hub-latency");
  const mask = (await latency.count()) > 0 ? [...masks, latency] : masks;
  await expect(page).toHaveScreenshot(name, {
    fullPage,
    animations: "disabled",
    caret: "hide",
    mask,
    maskColor: "#ece9e3",
    maxDiffPixelRatio: 0.001,
    timeout: 15_000,
  });
}

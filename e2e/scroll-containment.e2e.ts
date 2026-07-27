import { type Page } from "@playwright/test";
import { test, expect, type BrowserApp } from "./fixtures";
import { adminJson, loginThroughUi, seedModelRoute, seedOwner, type AdminSession } from "./helpers";

test.use({ trace: "off", screenshot: "off", video: "off" });

const USAGE_VIEWPORT = ".usage-ledger__scroll .helmora-scroll__viewport";
const CHAT_VIEWPORT = ".chat-transcript__scroll .helmora-scroll__viewport";
const DOC_HEIGHT_TOLERANCE_PX = 96;
const BOTTOM_TOLERANCE_PX = 8;

test("Usage ledger and Chat transcript keep native scroll, containment, and Jump to latest", async ({ page, app }, testInfo) => {
  test.setTimeout(90_000);
  await assertFreshWebBundle(app);

  const session = await seedOwner(app);
  await seedModelRoute(app, session);
  await seedUsageRows(app, session, 28);
  const conversationId = await seedLongConversation(app, session, 48);
  await loginThroughUi(page, app);

  const usageMetrics = await assertUsageLedgerScroll(page, app, testInfo);
  const chatMetrics = await assertChatTranscriptScroll(page, app, conversationId, testInfo);

  await testInfo.attach("scroll-metrics.json", {
    body: Buffer.from(JSON.stringify({ usage: usageMetrics, chat: chatMetrics }, null, 2)),
    contentType: "application/json",
  });
});

async function assertFreshWebBundle(app: BrowserApp): Promise<void> {
  const htmlResponse = await fetch(app.baseURL);
  expect(htmlResponse.ok, "e2e fixture must serve Hub dist/web index.html").toBe(true);
  const html = await htmlResponse.text();
  const entryMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  expect(entryMatch?.[1], "stale or missing entry bundle in Helmora-Hub/dist/web").toBeTruthy();

  const entry = await (await fetch(`${app.baseURL}${entryMatch![1]}`)).text();
  const chatChunk = [...entry.matchAll(/import\(`\.\/(ChatPage-[^`]+?\.js)`\)/g)][0]?.[1];
  expect(chatChunk, "ChatPage lazy chunk missing from served entry — rebuild Helmora-Hub/dist/web").toBeTruthy();

  const chatJs = await (await fetch(`${app.baseURL}/assets/${chatChunk}`)).text();
  expect(
    chatJs.includes("chat-transcript__scroll"),
    "served ChatPage chunk lacks .chat-transcript__scroll — stale Helmora-Hub/dist/web bundle",
  ).toBe(true);
  expect(
    chatJs.includes("chat-feed__scroll"),
    "served ChatPage chunk still contains obsolete .chat-feed__scroll",
  ).toBe(false);
}

async function seedUsageRows(app: BrowserApp, session: AdminSession, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await adminJson(app, session, "/v1/chat/completions", {
      method: "POST",
      body: {
        model: "fixture-route",
        messages: [{ role: "user", content: `Usage ledger overflow seed ${index} ${"column-pressure ".repeat(4)}` }],
      },
    }, 200);
  }
}

async function seedLongConversation(app: BrowserApp, session: AdminSession, messageCount: number): Promise<string> {
  const conversation = await adminJson(app, session, "/api/v2/conversations", {
    method: "POST",
    body: { title: "Scroll containment long transcript" },
  }, 201);
  const conversationId = String(conversation.id);
  for (let index = 0; index < messageCount; index += 1) {
    const role = index % 2 === 0 ? "user" : "assistant";
    await adminJson(app, session, `/api/v2/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: {
        role,
        content: `Scroll transcript line ${index}. ${"Helmora keeps history and transcript independently bounded. ".repeat(3)}`,
      },
    }, 201);
  }
  return conversationId;
}

async function assertUsageLedgerScroll(page: Page, app: BrowserApp, testInfo: { attach: (name: string, options: { body: Buffer; contentType: string }) => Promise<void> }) {
  await page.goto(`${app.baseURL}/usage`);
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});
  await expect(page.locator(".usage-table tbody tr").first()).toBeVisible();

  const wrapper = page.locator(".usage-ledger__scroll");
  const viewport = page.locator(USAGE_VIEWPORT);
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveAttribute("tabindex", "0");

  const geometry = await viewport.evaluate((el: HTMLElement) => {
    const style = window.getComputedStyle(el);
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      overflow: style.overflow,
      scrollbarWidth: style.scrollbarWidth,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
  });

  expect(["auto", "scroll", "overlay"].some((value) =>
    geometry.overflowX === value || geometry.overflowY === value || geometry.overflow === value,
  )).toBe(true);
  expect(geometry.scrollbarWidth).not.toBe("none");
  expect(geometry.scrollWidth, `expected horizontal overflow; got scrollWidth=${geometry.scrollWidth} clientWidth=${geometry.clientWidth}`).toBeGreaterThan(geometry.clientWidth);

  await viewport.evaluate((el: HTMLElement) => { el.scrollLeft = 0; });
  await expect.poll(async () => viewport.evaluate((el: HTMLElement) => el.scrollLeft)).toBe(0);
  const targetLeft = Math.min(120, Math.floor((geometry.scrollWidth - geometry.clientWidth) / 2));
  await viewport.evaluate((el: HTMLElement, left: number) => { el.scrollLeft = left; }, targetLeft);
  await expect.poll(async () => viewport.evaluate((el: HTMLElement) => el.scrollLeft)).toBeGreaterThan(0);
  const scrollLeftAfter = await viewport.evaluate((el: HTMLElement) => el.scrollLeft);

  const pageViewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await wrapper.scrollIntoViewIfNeeded();
  const box = await wrapper.boundingBox();
  expect(box).toBeTruthy();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.y).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(pageViewport.width + 2);
    expect(box.y + box.height).toBeLessThanOrEqual(pageViewport.height + 2);
  }

  const rail = wrapper.locator(".helmora-scroll__rail");
  await expect(rail).toHaveAttribute("aria-hidden", "true");
  await expect.poll(async () => rail.evaluate((el: HTMLElement) => window.getComputedStyle(el).pointerEvents)).toBe("none");

  let scrollTopBefore = 0;
  let scrollTopAfter = 0;
  if (geometry.scrollHeight > geometry.clientHeight + 8) {
    await viewport.evaluate((el: HTMLElement) => { el.scrollTop = 0; });
    await viewport.focus();
    scrollTopBefore = await viewport.evaluate((el: HTMLElement) => el.scrollTop);
    await page.keyboard.press("PageDown");
    await expect.poll(async () => viewport.evaluate((el: HTMLElement) => el.scrollTop)).toBeGreaterThan(scrollTopBefore);
    scrollTopAfter = await viewport.evaluate((el: HTMLElement) => el.scrollTop);
  }

  const metrics = {
    scrollWidth: geometry.scrollWidth,
    clientWidth: geometry.clientWidth,
    scrollLeft: scrollLeftAfter,
    scrollHeight: geometry.scrollHeight,
    clientHeight: geometry.clientHeight,
    scrollTopBefore,
    scrollTopAfter,
    scrollbarWidth: geometry.scrollbarWidth,
  };
  await testInfo.attach("usage-scroll-metrics.json", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });
  return metrics;
}

async function assertChatTranscriptScroll(
  page: Page,
  app: BrowserApp,
  conversationId: string,
  testInfo: { attach: (name: string, options: { body: Buffer; contentType: string }) => Promise<void> },
) {
  await page.goto(`${app.baseURL}/chat`);
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

  const documentHeightBefore = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.goto(`${app.baseURL}/chat?conversation=${encodeURIComponent(conversationId)}`);
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});

  const viewport = page.locator(CHAT_VIEWPORT);
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveAttribute("tabindex", "0");
  await expect(page.locator(".chat-feed__scroll")).toHaveCount(0);

  await expect.poll(async () => viewport.evaluate((el: HTMLElement) => el.scrollHeight > el.clientHeight + 8)).toBe(true);

  const documentHeightAfter = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(
    Math.abs(documentHeightAfter - documentHeightBefore),
    `document height grew with transcript content: before=${documentHeightBefore} after=${documentHeightAfter}`,
  ).toBeLessThanOrEqual(DOC_HEIGHT_TOLERANCE_PX);

  const overflow = await viewport.evaluate((el: HTMLElement) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
  }));
  expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);

  await expect.poll(async () => viewport.evaluate((el: HTMLElement) => {
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distance <= 72;
  })).toBe(true);

  await viewport.evaluate((el: HTMLElement) => {
    el.scrollTop = Math.max(0, el.scrollTop - 240);
    el.dispatchEvent(new Event("scroll"));
  });
  await viewport.focus();
  const scrollTopBeforeKey = await viewport.evaluate((el: HTMLElement) => el.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(async () => viewport.evaluate((el: HTMLElement) => el.scrollTop)).toBeGreaterThan(scrollTopBeforeKey);
  const scrollTopAfterKey = await viewport.evaluate((el: HTMLElement) => el.scrollTop);

  await viewport.evaluate((el: HTMLElement) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();

  await page.getByRole("button", { name: "Jump to latest" }).click();
  await expect.poll(async () => viewport.evaluate((el: HTMLElement) => el.scrollHeight - (el.scrollTop + el.clientHeight))).toBeLessThanOrEqual(BOTTOM_TOLERANCE_PX);
  const distanceAfterJump = await viewport.evaluate((el: HTMLElement) => el.scrollHeight - (el.scrollTop + el.clientHeight));
  await expect(page.getByRole("button", { name: "Jump to latest" })).toHaveCount(0);

  const metrics = {
    scrollHeight: overflow.scrollHeight,
    clientHeight: overflow.clientHeight,
    scrollTopBeforeKey,
    scrollTopAfterKey,
    documentHeightBefore,
    documentHeightAfter,
    distanceAfterJump,
  };
  await testInfo.attach("chat-scroll-metrics.json", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });
  return metrics;
}

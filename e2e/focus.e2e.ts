import { test, expect } from "./fixtures";
import { loginThroughUi, seedModelRoute, seedOwner } from "./helpers";

test("rounded focus: TextInput, Typeahead, native select, composer, and bare button use computed styles", async ({ page, app }) => {
  const session = await seedOwner(app);
  await seedModelRoute(app, session);
  await page.goto(app.baseURL);
  await loginThroughUi(page, app);

  await page.goto(`${app.baseURL}/providers`);
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});

  // 1) Astryx TextInput — inner input has no square outline; wrapper is :focus-within
  const search = page.getByRole("textbox", { name: /Search catalog/i });
  await search.focus();
  expect(await outlineStyle(search)).toMatch(/^(none|)$/u);
  expect(await matchesFocusWithin(search, ".astryx-text-input")).toBe(true);

  // 2) SearchableSelect / Typeahead — open an empty Diagnose field on Models
  await page.goto(`${app.baseURL}/models`);
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});
  const providerCombo = page.getByRole("combobox", { name: /Diagnose provider/i });
  const providerWrap = page.locator(".helmora-searchable-select").filter({ has: providerCombo });
  const providerToken = providerWrap.getByRole("button").first();
  if (await providerToken.count()) {
    await providerToken.click();
  } else {
    await providerWrap.click();
  }
  await providerCombo.focus();
  expect(await outlineStyle(providerCombo)).toMatch(/^(none|)$/u);
  expect(await matchesFocusWithin(providerCombo, ".helmora-searchable-select")).toBe(true);
  await page.keyboard.press("Escape");

  // 3) .native-field select — no square outline; border/box-shadow focus remains
  await page.goto(`${app.baseURL}/providers`);
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});
  const nativeSelect = page.locator(".native-field select").first();
  await nativeSelect.focus();
  expect(await outlineStyle(nativeSelect)).toMatch(/^(none|)$/u);
  const nativeFocus = await nativeSelect.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      radius: style.borderRadius,
    };
  });
  expect(nativeFocus.boxShadow !== "none" || nativeFocus.borderColor !== "rgb(0, 0, 0)").toBe(true);
  expect(nativeFocus.radius).not.toBe("0px");

  // 4) .composer textarea — inner has no square outline; wrapper :focus-within
  await page.goto(`${app.baseURL}/chat`);
  await page.locator(".route-loader").waitFor({ state: "detached" }).catch(() => {});
  const message = page.locator(".composer textarea");
  await expect(message).toBeEnabled({ timeout: 15_000 });
  await message.focus();
  await expect(message).toBeFocused();
  expect(await outlineStyle(message)).toMatch(/^(none|)$/u);
  expect(await matchesFocusWithin(message, ".composer")).toBe(true);

  // 5) Bare button still keeps keyboard focus visible
  const signOut = page.getByRole("button", { name: /Sign out/i });
  await signOut.focus();
  const buttonFocus = await signOut.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  const hasOutline = buttonFocus.outlineStyle !== "none" && buttonFocus.outlineWidth !== "0px";
  const hasBoxShadow = buttonFocus.boxShadow !== "none";
  expect(hasOutline || hasBoxShadow).toBe(true);
});

async function outlineStyle(locator: import("@playwright/test").Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).outlineStyle);
}

async function matchesFocusWithin(locator: import("@playwright/test").Locator, selector: string): Promise<boolean> {
  return locator.evaluate((el, sel) => {
    const wrapper = el.closest(sel);
    return Boolean(wrapper?.matches(":focus-within"));
  }, selector);
}

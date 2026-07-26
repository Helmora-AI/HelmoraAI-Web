import { defineConfig, devices } from "@playwright/test";

const includeFirefox = process.env.HELMORA_E2E_FIREFOX === "1";
const clipboardPermissions = ["clipboard-read", "clipboard-write"];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: "test-results",
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "off",
    video: "off",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [
    {
      name: "chromium-desktop",
      grepInvert: /@(?:mobile|tablet)/u,
      use: { ...devices["Desktop Chrome"], permissions: clipboardPermissions },
    },
    {
      name: "chromium-tablet",
      grep: /@tablet/u,
      use: {
        browserName: "chromium",
        viewport: { width: 820, height: 1_180 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        permissions: clipboardPermissions,
      },
    },
    {
      name: "chromium-mobile",
      grep: /@mobile/u,
      use: { ...devices["Pixel 7"], permissions: clipboardPermissions },
    },
    ...(includeFirefox ? [{
      name: "firefox-desktop",
      grepInvert: /@(?:mobile|tablet|visual)/u,
      use: { ...devices["Desktop Firefox"] },
    }] : []),
    {
      name: "webkit-desktop",
      grepInvert: /@(?:mobile|tablet|visual)/u,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});

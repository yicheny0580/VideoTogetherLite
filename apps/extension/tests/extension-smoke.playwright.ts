import { chromium, expect, test } from "@playwright/test";
import path from "node:path";

test.skip(
  process.env.PLAYWRIGHT_EXTENSION_SMOKE !== "1",
  "Set PLAYWRIGHT_EXTENSION_SMOKE=1 after building the extension."
);

test("loads the Chrome extension popup", async () => {
  const extensionPath = path.resolve("dist");
  const context = await chromium.launchPersistentContext("", {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ],
    headless: false
  });

  try {
    const serviceWorker = context.serviceWorkers()[0]
      ?? await context.waitForEvent("serviceworker");
    const extensionId = serviceWorker.url().split("/")[2];
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByText(/Enabled|Disabled/)).toBeVisible();
  } finally {
    await context.close();
  }
});

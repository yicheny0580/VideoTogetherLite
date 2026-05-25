import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startFixtureServer, type FixtureServer } from "./fixtureServer";

type OpenFixture = (pathname?: string, options?: { waitForPanel?: boolean }) => Promise<Page>;
type OpenIsolatedFixture = (pathname?: string, options?: { waitForPanel?: boolean }) => Promise<Page>;
type OpenPopup = () => Promise<Page>;

interface ExtensionFixtures {
  extensionContext: BrowserContext;
  extensionId: string;
  fixtureServer: FixtureServer;
  openFixture: OpenFixture;
  openIsolatedFixture: OpenIsolatedFixture;
  openPopup: OpenPopup;
}

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const extensionPath = resolve(extensionRoot, "dist");
const extensionManifest = resolve(extensionPath, "manifest.json");
const extensionLaunchArgs = [
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
  "--no-sandbox"
];

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({ browserName: _browserName }, runFixture) => {
    await access(extensionManifest);
    const userDataDir = await mkdtemp(join(tmpdir(), "videotogetherlite-e2e-"));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        args: extensionLaunchArgs,
        channel: "chromium",
        headless: true
      });
      await runFixture(context);
    } finally {
      await context?.close().catch(() => undefined);
      await rm(userDataDir, { force: true, recursive: true });
    }
  },

  extensionId: async ({ extensionContext }, runFixture) => {
    const serviceWorker = extensionContext.serviceWorkers()[0]
      ?? await extensionContext.waitForEvent("serviceworker", { timeout: 15_000 });
    const extensionId = serviceWorker.url().split("/")[2];
    if (!extensionId) {
      throw new Error(`Could not resolve extension ID from ${serviceWorker.url()}`);
    }
    await runFixture(extensionId);
  },

  fixtureServer: async ({ browserName: _browserName }, runFixture) => {
    const server = await startFixtureServer();
    try {
      await runFixture(server);
    } finally {
      await server.close();
    }
  },

  openFixture: async ({ extensionContext, fixtureServer }, runFixture) => {
    await runFixture(async (pathname = "/host", options = {}) => {
      const page = await extensionContext.newPage();
      await page.goto(fixtureServer.url(pathname));
      if (options.waitForPanel !== false) {
        await expect(page.locator("#videoTogetherLiteFlyPanel")).toBeVisible();
      }
      return page;
    });
  },

  openIsolatedFixture: async ({ fixtureServer }, runFixture) => {
    const opened: Array<{ context: BrowserContext; userDataDir: string }> = [];
    try {
      await runFixture(async (pathname = "/host", options = {}) => {
        const userDataDir = await mkdtemp(join(tmpdir(), "videotogetherlite-e2e-isolated-"));
        const context = await chromium.launchPersistentContext(userDataDir, {
          args: extensionLaunchArgs,
          channel: "chromium",
          headless: true
        });
        opened.push({ context, userDataDir });
        const page = await context.newPage();
        await page.goto(fixtureServer.url(pathname));
        if (options.waitForPanel !== false) {
          await expect(page.locator("#videoTogetherLiteFlyPanel")).toBeVisible();
        }
        return page;
      });
    } finally {
      await Promise.all(opened.map(async ({ context, userDataDir }) => {
        await context.close().catch(() => undefined);
        await rm(userDataDir, { force: true, recursive: true });
      }));
    }
  },

  openPopup: async ({ extensionContext, extensionId }, runFixture) => {
    await runFixture(async () => {
      const page = await extensionContext.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      return page;
    });
  }
});

export { expect };

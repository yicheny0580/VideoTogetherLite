import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startFixtureServer, type FixtureServer } from "./fixtureServer";

type OpenFixture = (pathname?: string, options?: { waitForPanel?: boolean }) => Promise<Page>;
type OpenIsolatedFixture = (pathname?: string, options?: { waitForPanel?: boolean }) => Promise<Page>;
type OpenExternal = (url: string, options?: { waitForPanel?: boolean }) => Promise<Page>;
type OpenPopup = () => Promise<Page>;
type OpenPopupForPage = (targetPage: Page) => Promise<Page>;

interface ExtensionFixtures {
  extensionContext: BrowserContext;
  fixtureServer: FixtureServer;
  openExternal: OpenExternal;
  openFixture: OpenFixture;
  openIsolatedExternal: OpenExternal;
  openIsolatedFixture: OpenIsolatedFixture;
  openPopup: OpenPopup;
  openPopupForPage: OpenPopupForPage;
}

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const extensionPath = resolve(extensionRoot, "dist");
const extensionManifest = resolve(extensionPath, "manifest.json");
const extensionLaunchArgs = [
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
  // YouTube seeks are driven from multiple pages/contexts in e2e. Keep
  // Chromium from throttling backgrounded media pages while another page is active.
  "--autoplay-policy=no-user-gesture-required",
  "--disable-background-media-suspend",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  // Live-site e2e pages need to reach the local debug server from HTTPS origins.
  "--disable-web-security",
  "--no-sandbox"
];

function extensionIdFromUrl(url: string): string | null {
  if (!url.startsWith("chrome-extension://")) {
    return null;
  }
  return new URL(url).host || null;
}

async function getExtensionId(context: BrowserContext, targetPage?: Page): Promise<string> {
  if (targetPage) {
    const injectedScriptId = await targetPage.evaluate(() => {
      const script = Array.from(document.scripts).find((candidate) => (
        candidate.src.startsWith("chrome-extension://") && candidate.src.includes("/page.js")
      ));
      return script?.src ?? null;
    });
    const injectedId = injectedScriptId ? extensionIdFromUrl(injectedScriptId) : null;
    if (injectedId) {
      return injectedId;
    }
  }

  const serviceWorker = context.serviceWorkers().find((worker) => extensionIdFromUrl(worker.url()))
    ?? await context.waitForEvent("serviceworker", {
      predicate: (worker) => extensionIdFromUrl(worker.url()) !== null,
      timeout: 15_000
    });
  const extensionId = extensionIdFromUrl(serviceWorker.url());
  if (!extensionId) {
    throw new Error(`Could not resolve extension ID from ${serviceWorker.url()}`);
  }
  return extensionId;
}

async function waitForExtensionController(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => Boolean(
    (window as Window & { videoTogetherLiteExtension?: unknown }).videoTogetherLiteExtension
  )), {
    timeout: 30_000
  }).toBe(true);
}

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({ browserName: _browserName, headless }, runFixture) => {
    await access(extensionManifest);
    const userDataDir = await mkdtemp(join(tmpdir(), "videotogetherlite-e2e-"));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        args: extensionLaunchArgs,
        channel: "chromium",
        headless
      });
      await runFixture(context);
    } finally {
      await context?.close().catch(() => undefined);
      await rm(userDataDir, { force: true, recursive: true });
    }
  },

  fixtureServer: async ({ browserName: _browserName }, runFixture) => {
    const server = await startFixtureServer();
    try {
      await runFixture(server);
    } finally {
      await server.close();
    }
  },

  openExternal: async ({ extensionContext }, runFixture) => {
    await runFixture(async (url, options = {}) => {
      const page = await extensionContext.newPage();
      await page.goto(url, { timeout: 60_000, waitUntil: "domcontentloaded" });
      if (options.waitForPanel !== false) {
        await waitForExtensionController(page);
      }
      return page;
    });
  },

  openFixture: async ({ extensionContext, fixtureServer }, runFixture) => {
    await runFixture(async (pathname = "/host", options = {}) => {
      const page = await extensionContext.newPage();
      await page.goto(fixtureServer.url(pathname));
      if (options.waitForPanel !== false) {
        await waitForExtensionController(page);
      }
      return page;
    });
  },

  openIsolatedExternal: async ({ browserName: _browserName, headless }, runFixture) => {
    const opened: Array<{ context: BrowserContext; userDataDir: string }> = [];
    try {
      await runFixture(async (url, options = {}) => {
        const userDataDir = await mkdtemp(join(tmpdir(), "videotogetherlite-e2e-isolated-"));
        const context = await chromium.launchPersistentContext(userDataDir, {
          args: extensionLaunchArgs,
          channel: "chromium",
          headless
        });
        opened.push({ context, userDataDir });
        const page = await context.newPage();
        await page.goto(url, { timeout: 60_000, waitUntil: "domcontentloaded" });
        if (options.waitForPanel !== false) {
          await waitForExtensionController(page);
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

  openIsolatedFixture: async ({ fixtureServer, headless }, runFixture) => {
    const opened: Array<{ context: BrowserContext; userDataDir: string }> = [];
    try {
      await runFixture(async (pathname = "/host", options = {}) => {
        const userDataDir = await mkdtemp(join(tmpdir(), "videotogetherlite-e2e-isolated-"));
        const context = await chromium.launchPersistentContext(userDataDir, {
          args: extensionLaunchArgs,
          channel: "chromium",
          headless
        });
        opened.push({ context, userDataDir });
        const page = await context.newPage();
        await page.goto(fixtureServer.url(pathname));
        if (options.waitForPanel !== false) {
          await waitForExtensionController(page);
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

  openPopup: async ({ openFixture }, runFixture) => {
    await runFixture(async () => {
      const targetPage = await openFixture("/host");
      const extensionId = await getExtensionId(targetPage.context(), targetPage);
      const popup = await targetPage.context().newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(popup.locator("#videoTogetherLitePopup")).toBeVisible();
      return popup;
    });
  },

  openPopupForPage: async ({ browserName: _browserName }, runFixture) => {
    await runFixture(async (targetPage) => {
      await targetPage.bringToFront();
      await waitForExtensionController(targetPage);
      const extensionId = await getExtensionId(targetPage.context(), targetPage);
      const popup = await targetPage.context().newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(popup.locator("#videoTogetherLitePopup")).toBeVisible();
      return popup;
    });
  }
});

export { expect };

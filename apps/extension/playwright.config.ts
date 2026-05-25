import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(extensionRoot, "../..");

export default defineConfig({
  testDir: "tests",
  testMatch: "*.playwright.ts",
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 10_000
  },
  use: {
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "go run ./apps/server debug",
    cwd: repoRoot,
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 500
    },
    reuseExistingServer: !process.env.CI,
    stderr: "pipe",
    stdout: "ignore",
    timeout: 60_000,
    url: "http://127.0.0.1:5001/api/v1/timestamp"
  }
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "*.playwright.ts",
  timeout: 30_000,
  use: {
    headless: false
  }
});

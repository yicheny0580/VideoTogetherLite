import { describe, expect, it } from "vitest";

import { resolveLanguage } from "./language";

describe("resolveLanguage", () => {
  it("matches exact and prefix languages", () => {
    expect(resolveLanguage("zh-cn")).toBe("zh-cn");
    expect(resolveLanguage("zh-TW")).toBe("zh-cn");
    expect(resolveLanguage("en-US")).toBe("en-us");
  });

  it("falls back to English", () => {
    expect(resolveLanguage("fr-FR")).toBe("en-us");
    expect(resolveLanguage(undefined)).toBe("en-us");
  });
});

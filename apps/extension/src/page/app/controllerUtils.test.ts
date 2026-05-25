import { describe, expect, it } from "vitest";

import { getPlaybackIdentityUrl } from "./controllerUtils";

describe("getPlaybackIdentityUrl", () => {
  it("ignores transient YouTube time parameters", () => {
    expect(getPlaybackIdentityUrl("https://www.youtube.com/watch?v=abc&t=218s&x=1"))
      .toBe("https://www.youtube.com/watch?v=abc&x=1");
    expect(getPlaybackIdentityUrl("https://youtu.be/abc?time_continue=218&start=10"))
      .toBe("https://youtu.be/abc");
  });

  it("keeps non-YouTube time parameters", () => {
    expect(getPlaybackIdentityUrl("https://example.test/watch?t=218s"))
      .toBe("https://example.test/watch?t=218s");
  });
});

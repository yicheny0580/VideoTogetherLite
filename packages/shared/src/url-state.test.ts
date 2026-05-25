import { describe, expect, it } from "vitest";

import { linkWithRoomState, linkWithoutState } from "./url-state";

describe("url state helpers", () => {
  it("removes persisted state params", () => {
    const url = linkWithoutState("https://example.test/watch?VideoTogetherLiteRoomCode=ABC123&a=1");
    expect(url).toBe("https://example.test/watch?a=1");
  });

  it("wraps room state around a target URL", () => {
    const url = linkWithRoomState("https://example.test/watch?x=1", "ABC123", "token", "user-2");
    expect(url.searchParams.get("VideoTogetherLiteRoomCode")).toBe("ABC123");
    expect(url.searchParams.get("VideoTogetherLiteSessionToken")).toBe("token");
    expect(url.searchParams.get("VideoTogetherLiteFollowUserId")).toBe("user-2");
    expect(url.toString()).toContain("&x=1");
  });
});

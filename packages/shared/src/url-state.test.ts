import { describe, expect, it } from "vitest";

import { Role } from "./roles";
import { linkWithMemberState, linkWithoutState, parseRole } from "./url-state";

describe("url state helpers", () => {
  it("removes persisted state params", () => {
    const url = linkWithoutState("https://example.test/watch?VideoTogetherRole=3&a=1");
    expect(url).toBe("https://example.test/watch?a=1");
  });

  it("wraps member state around a target URL", () => {
    const url = linkWithMemberState("https://example.test/watch?x=1", "room", "token", Role.Member);
    expect(url.searchParams.get("VideoTogetherRoomName")).toBe("room");
    expect(url.searchParams.get("VideoTogetherSessionToken")).toBe("token");
    expect(url.searchParams.get("VideoTogetherRole")).toBe(String(Role.Member));
    expect(url.toString()).toContain("&x=1");
  });

  it("parses only active room roles", () => {
    expect(parseRole("2")).toBe(Role.Master);
    expect(parseRole("3")).toBe(Role.Member);
    expect(parseRole("1")).toBeNull();
  });
});

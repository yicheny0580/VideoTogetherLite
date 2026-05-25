import { describe, expect, it } from "vitest";

import { calculateRealCurrent, createTimeSyncState, updateTimeSync } from "./time-sync";

describe("time sync helpers", () => {
  it("keeps the lowest round trip offset", () => {
    const first = updateTimeSync(createTimeSyncState(), 20, 10, 14);
    const second = updateTimeSync(first, 30, 10, 20);

    expect(first.offset).toBe(8);
    expect(second).toEqual(first);
  });

  it("projects current time from playback rate", () => {
    expect(calculateRealCurrent({
      currentTime: 5,
      lastUpdateClientTime: 10,
      playbackRate: 1.5
    }, 14)).toBe(11);
  });
});

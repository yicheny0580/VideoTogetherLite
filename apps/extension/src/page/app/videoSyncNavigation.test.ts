import { describe, expect, it, vi } from "vitest";

import type { SharedVideoState } from "@videotogetherlite/shared";

import type { PlaybackAdapter } from "../infrastructure/mediaPlayback";
import { syncVideoToRoom } from "./videoSync";

function sharedVideo(overrides: Partial<SharedVideoState> = {}): SharedVideoState {
  return {
    currentTime: 10,
    duration: 100,
    isLoading: false,
    lastUpdateClientTime: 100,
    lastUpdateServerTime: 100,
    paused: true,
    playbackRate: 1,
    title: "Fixture video",
    url: "https://example.test/watch",
    ...overrides
  };
}

describe("syncVideoToRoom navigation recovery", () => {
  it("allows page navigation only from follower sync seeks", async () => {
    const video = document.createElement("video");
    const seek = vi.fn(() => true);
    const adapter: PlaybackAdapter = {
      kind: "youtube",
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
      seek,
      setPlaybackRate: vi.fn(),
      snapshot: vi.fn(() => ({
        currentTime: 4,
        duration: 100,
        hasPlaybackError: false,
        isLoading: false,
        isStable: true,
        paused: true,
        phase: "paused" as const,
        playbackRate: 1
      }))
    };

    await syncVideoToRoom(
      sharedVideo({ currentTime: 20, paused: true }),
      video,
      100,
      "manual",
      adapter
    );

    expect(seek).toHaveBeenCalledWith(20, { allowPageNavigation: true });
  });
});

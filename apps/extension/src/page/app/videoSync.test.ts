import { describe, expect, it, vi } from "vitest";

import type { SharedVideoState } from "@videotogetherlite/shared";

import { syncVideoToRoom } from "./videoSync";

interface FakeVideo {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
  pause: () => void;
  play: () => Promise<void>;
}

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

function createVideo(overrides: Partial<FakeVideo> = {}) {
  const fake: FakeVideo = {
    currentTime: 0,
    duration: 100,
    paused: true,
    playbackRate: 1,
    pause: () => undefined,
    play: async () => undefined,
    ...overrides
  };
  const play = vi.fn(async () => {
    fake.paused = false;
  });
  const pause = vi.fn(() => {
    fake.paused = true;
  });
  fake.play = play;
  fake.pause = pause;

  return {
    fake,
    pause,
    play,
    video: fake as unknown as HTMLVideoElement
  };
}

describe("syncVideoToRoom", () => {
  it("seeks paused video when the shared paused time changes", async () => {
    const { fake, video } = createVideo({ currentTime: 4, paused: true });

    await syncVideoToRoom(sharedVideo({ currentTime: 12, paused: true }), video, 100, "manual");

    expect(fake.currentTime).toBe(12);
  });

  it("projects and seeks playing video when drift is too large", async () => {
    const { fake, video } = createVideo({ currentTime: 4, paused: false });

    await syncVideoToRoom(
      sharedVideo({ currentTime: 10, lastUpdateClientTime: 100, paused: false, playbackRate: 1.5 }),
      video,
      104,
      "manual"
    );

    expect(fake.currentTime).toBe(16);
  });

  it("applies playback rate and starts playback", async () => {
    const { fake, play, video } = createVideo({ currentTime: 10, paused: true, playbackRate: 1 });

    await syncVideoToRoom(
      sharedVideo({ currentTime: 10, paused: false, playbackRate: 1.25 }),
      video,
      100,
      "manual"
    );

    expect(fake.playbackRate).toBe(1.25);
    expect(play).toHaveBeenCalledTimes(1);
    expect(fake.paused).toBe(false);
  });

  it("pauses playback", async () => {
    const { fake, pause, video } = createVideo({ currentTime: 10, paused: false });

    await syncVideoToRoom(sharedVideo({ currentTime: 10, paused: true }), video, 100, "manual");

    expect(pause).toHaveBeenCalledTimes(1);
    expect(fake.paused).toBe(true);
  });

  it("still applies seek and rate before surfacing blocked play", async () => {
    const { fake, video } = createVideo({ currentTime: 0, paused: true, playbackRate: 1 });
    fake.play = vi.fn(async () => {
      throw new Error("blocked");
    });

    await expect(syncVideoToRoom(
      sharedVideo({ currentTime: 20, paused: false, playbackRate: 1.5 }),
      video,
      100,
      "Need to play manually"
    )).rejects.toThrow("Need to play manually");

    expect(fake.currentTime).toBe(20);
    expect(fake.playbackRate).toBe(1.5);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import type { SharedVideoState } from "@videotogetherlite/shared";

import { createPlaybackAdapter } from "../infrastructure/mediaPlayback";
import { createYouTubeAdapter } from "../infrastructure/playbackAdapters/youtubeAdapter";
import { syncVideoToRoom } from "./videoSync";

afterEach(() => document.body.replaceChildren());

interface FakeVideo {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
  pause: () => void;
  play: () => Promise<void>;
}

interface FakeYouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  getPlayerState: () => number;
  getVideoLoadedFraction: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setPlaybackRate: (rate: number) => void;
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

  return { fake, pause, play, video: fake as unknown as HTMLVideoElement };
}

function createYouTubeVideo(options: {
  bufferedEnd?: number;
  bufferOnSeek?: boolean;
  currentTime?: number;
  duration?: number;
  playbackRate?: number;
  playerState?: number;
} = {}) {
  const {
    bufferOnSeek = false,
    currentTime = 0,
    duration = 100,
    playbackRate = 1,
    playerState = 2
  } = options;
  const bufferedEnd = options.bufferedEnd ?? duration;
  let nextCurrentTime = currentTime;
  let nextPlaybackRate = playbackRate;
  let nextPlayerState = playerState;
  let nextReadyState = playerState === 3 ? 2 : 4;
  const rawCurrentTimeSetter = vi.fn();
  const rawPlaybackRateSetter = vi.fn();
  const play = vi.fn(async () => {
    nextPlayerState = 1;
  });
  const pause = vi.fn(() => {
    nextPlayerState = 2;
  });
  const video = document.createElement("video");
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => nextCurrentTime,
    set: (seconds: number) => {
      rawCurrentTimeSetter(seconds);
      if (bufferOnSeek) {
        nextPlayerState = 3;
        nextReadyState = 2;
      } else {
        nextCurrentTime = seconds;
        nextReadyState = 4;
      }
    }
  });
  Object.defineProperty(video, "duration", {
    configurable: true,
    get: () => duration
  });
  Object.defineProperty(video, "paused", {
    configurable: true,
    get: () => nextPlayerState !== 1 && nextPlayerState !== 3
  });
  Object.defineProperty(video, "playbackRate", {
    configurable: true,
    get: () => nextPlaybackRate,
    set: (rate: number) => {
      nextPlaybackRate = rate;
      rawPlaybackRateSetter(rate);
    }
  });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    get: () => nextReadyState
  });
  Object.defineProperty(video, "buffered", {
    configurable: true,
    get: () => ({
      end: () => bufferedEnd,
      length: bufferedEnd > 0 ? 1 : 0,
      start: () => 0
    })
  });
  video.play = play;
  video.pause = pause;

  const player = document.createElement("div") as unknown as HTMLElement & FakeYouTubePlayer;
  player.className = "html5-video-player";
  player.getCurrentTime = vi.fn(() => nextCurrentTime);
  player.getDuration = vi.fn(() => duration);
  player.getPlaybackRate = vi.fn(() => nextPlaybackRate);
  player.getPlayerState = vi.fn(() => nextPlayerState);
  player.getVideoLoadedFraction = vi.fn(() => bufferedEnd / duration);
  player.pauseVideo = vi.fn(() => {
    nextPlayerState = 2;
  });
  player.playVideo = vi.fn(() => {
    nextPlayerState = 1;
  });
  player.seekTo = vi.fn((seconds: number) => {
    if (bufferOnSeek) {
      nextPlayerState = 3;
      nextReadyState = 2;
    } else {
      nextCurrentTime = seconds;
      nextReadyState = 4;
    }
  });
  player.setPlaybackRate = vi.fn((rate: number) => {
    nextPlaybackRate = rate;
  });
  player.append(video);
  document.body.append(player);

  return { pause, player, play, rawCurrentTimeSetter, rawPlaybackRateSetter, video };
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

  it("skips media commands while the shared video is loading", async () => {
    const { fake, play, video } = createVideo({ currentTime: 4, paused: true, playbackRate: 1 });

    await syncVideoToRoom(
      sharedVideo({ currentTime: 20, isLoading: true, paused: false, playbackRate: 1.5 }),
      video,
      100,
      "manual"
    );

    expect(fake.currentTime).toBe(4);
    expect(fake.playbackRate).toBe(1);
    expect(play).not.toHaveBeenCalled();
  });

  it("still seeks a paused loading shared video once", async () => {
    const { fake, video } = createVideo({ currentTime: 4, paused: true, playbackRate: 1 });

    await syncVideoToRoom(
      sharedVideo({ currentTime: 20, isLoading: true, paused: true, playbackRate: 1.5 }),
      video,
      100,
      "manual"
    );

    expect(fake.currentTime).toBe(20);
    expect(fake.playbackRate).toBe(1);
  });

  it("uses YouTube player seek API without writing native currentTime", async () => {
    const { player, play, rawCurrentTimeSetter, rawPlaybackRateSetter, video } = createYouTubeVideo({
      currentTime: 4,
      playerState: 2
    });

    await syncVideoToRoom(
      sharedVideo({ currentTime: 20, paused: false, playbackRate: 1.25 }),
      video,
      100,
      "manual",
      createPlaybackAdapter(video, "www.youtube.com")
    );

    expect(player.seekTo).toHaveBeenCalledWith(20, false);
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
    expect(rawPlaybackRateSetter).toHaveBeenCalledWith(1.25);
    expect(play).toHaveBeenCalledTimes(1);
    expect(player.setPlaybackRate).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it("pauses YouTube through the player API", async () => {
    const { pause, player, video } = createYouTubeVideo({
      currentTime: 10,
      playerState: 1
    });

    await syncVideoToRoom(
      sharedVideo({ currentTime: 10, paused: true }),
      video,
      100,
      "manual",
      createPlaybackAdapter(video, "www.youtube.com")
    );

    expect(player.pauseVideo).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it("loads an unbuffered YouTube target through a timestamped URL", async () => {
    const { player, rawCurrentTimeSetter, video } = createYouTubeVideo({
      bufferedEnd: 10,
      currentTime: 4,
      playerState: 2
    });
    const navigateToUrl = vi.fn();
    const adapter = createYouTubeAdapter(video, "www.youtube.com", navigateToUrl);
    expect(adapter).not.toBeNull();

    await syncVideoToRoom(
      sharedVideo({ currentTime: 20, paused: true }),
      video,
      100,
      "manual",
      adapter!
    );

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(navigateToUrl).toHaveBeenCalledWith("http://localhost:3000/?t=20s");
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
  });

  it("dedupes repeated seeks while the target video is buffering", async () => {
    const { player, rawCurrentTimeSetter, video } = createYouTubeVideo({
      bufferOnSeek: true,
      currentTime: 4,
      playerState: 2
    });
    const adapter = createPlaybackAdapter(video, "www.youtube.com");
    const shared = sharedVideo({ currentTime: 20, paused: true });

    await syncVideoToRoom(shared, video, 100, "manual", adapter);
    await syncVideoToRoom(shared, video, 101, "manual", adapter);

    expect(player.seekTo).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(20, false);
    expect(player.pauseVideo).toHaveBeenCalledTimes(1);
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
  });

  it("follows a paused loading YouTube position through a timestamped URL", async () => {
    const { player, rawCurrentTimeSetter, rawPlaybackRateSetter, video } = createYouTubeVideo({
      bufferedEnd: 10,
      currentTime: 4,
      playerState: 2
    });
    const navigateToUrl = vi.fn();
    const adapter = createYouTubeAdapter(video, "www.youtube.com", navigateToUrl);
    expect(adapter).not.toBeNull();

    await syncVideoToRoom(
      sharedVideo({ currentTime: 20, isLoading: true, paused: true, playbackRate: 1.5 }),
      video,
      100,
      "manual",
      adapter!
    );

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(navigateToUrl).toHaveBeenCalledWith("http://localhost:3000/?t=20s");
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
    expect(rawPlaybackRateSetter).not.toHaveBeenCalled();
  });

  it("does not spam YouTube seeks while a projected playing target is still buffering", async () => {
    const { player, rawCurrentTimeSetter, video } = createYouTubeVideo({
      bufferOnSeek: true,
      currentTime: 4,
      playerState: 2
    });
    const adapter = createPlaybackAdapter(video, "www.youtube.com");
    const shared = sharedVideo({
      currentTime: 20,
      lastUpdateClientTime: 100,
      paused: false,
      playbackRate: 1
    });

    await syncVideoToRoom(shared, video, 100, "manual", adapter);
    await syncVideoToRoom(shared, video, 120, "manual", adapter);

    expect(player.seekTo).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(20, false);
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
  });
});

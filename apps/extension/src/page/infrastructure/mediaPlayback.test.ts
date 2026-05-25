import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlaybackAdapter } from "./mediaPlayback";
import { isYouTubeOwnedHost } from "./playbackAdapters/youtubeAdapter";

interface FakeYouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
}

afterEach(() => {
  document.body.replaceChildren();
});

function createManagedYouTubeVideo({
  currentTime = 42,
  duration = 120,
  playerState = 1
}: {
  currentTime?: number;
  duration?: number;
  playerState?: number;
} = {}) {
  let nextCurrentTime = currentTime;
  let nextPlaybackRate = 1.25;
  const rawCurrentTimeSetter = vi.fn();
  const rawPlaybackRateSetter = vi.fn();
  const video = document.createElement("video");
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => nextCurrentTime,
    set: (value: number) => {
      nextCurrentTime = value;
      rawCurrentTimeSetter(value);
    }
  });
  Object.defineProperty(video, "duration", {
    configurable: true,
    get: () => duration
  });
  Object.defineProperty(video, "paused", {
    configurable: true,
    get: () => playerState !== 1 && playerState !== 3
  });
  Object.defineProperty(video, "playbackRate", {
    configurable: true,
    get: () => nextPlaybackRate,
    set: (value: number) => {
      nextPlaybackRate = value;
      rawPlaybackRateSetter(value);
    }
  });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    get: () => playerState === 3 ? 2 : 4
  });

  const player = document.createElement("div") as unknown as HTMLElement & FakeYouTubePlayer;
  player.className = "html5-video-player";
  player.getCurrentTime = vi.fn(() => nextCurrentTime);
  player.getDuration = vi.fn(() => duration);
  player.getPlaybackRate = vi.fn(() => nextPlaybackRate);
  player.getPlayerState = vi.fn(() => playerState);
  player.seekTo = vi.fn();
  player.append(video);
  document.body.append(player);

  return { player, rawCurrentTimeSetter, rawPlaybackRateSetter, video };
}

describe("mediaPlayback", () => {
  it("recognizes YouTube-owned hosts", () => {
    expect(isYouTubeOwnedHost("www.youtube.com")).toBe(true);
    expect(isYouTubeOwnedHost("music.youtube.com")).toBe(true);
    expect(isYouTubeOwnedHost("youtube-nocookie.com")).toBe(true);
    expect(isYouTubeOwnedHost("notyoutube.com")).toBe(false);
  });

  it("chooses the YouTube adapter on YouTube hosts with a page player", () => {
    const { video } = createManagedYouTubeVideo();
    const adapter = createPlaybackAdapter(video, "www.youtube.com");

    expect(adapter.kind).toBe("youtube");
    expect(adapter.snapshot()).toMatchObject({
      currentTime: 42,
      duration: 120,
      hasPlaybackError: false,
      isLoading: false,
      isStable: true,
      paused: false,
      phase: "playing",
      playbackRate: 1.25
    });
  });

  it("marks buffering YouTube snapshots as unstable", () => {
    const { video } = createManagedYouTubeVideo({ playerState: 3 });
    const adapter = createPlaybackAdapter(video, "www.youtube.com");

    expect(adapter.snapshot()).toMatchObject({
      isLoading: true,
      isStable: false,
      phase: "buffering"
    });
  });

  it("marks visible YouTube playback errors as unstable", () => {
    const { player, video } = createManagedYouTubeVideo();
    const error = document.createElement("div");
    error.className = "ytp-error-content-wrap-reason";
    error.textContent = "Something went wrong";
    player.append(error);

    expect(createPlaybackAdapter(video, "www.youtube.com").snapshot()).toMatchObject({
      hasPlaybackError: true,
      isLoading: true,
      isStable: false
    });
  });

  it("seeks YouTube through the native video element without using seekTo", () => {
    const { player, rawCurrentTimeSetter, video } = createManagedYouTubeVideo();
    const adapter = createPlaybackAdapter(video, "www.youtube.com");

    adapter.seek(50);

    expect(rawCurrentTimeSetter).toHaveBeenCalledWith(50);
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it("falls back to the HTML adapter off YouTube hosts", () => {
    const { rawCurrentTimeSetter, video } = createManagedYouTubeVideo();
    const adapter = createPlaybackAdapter(video, "example.com");

    expect(adapter.kind).toBe("html-video");
    adapter.seek(50);
    expect(rawCurrentTimeSetter).toHaveBeenCalledWith(50);
  });
});

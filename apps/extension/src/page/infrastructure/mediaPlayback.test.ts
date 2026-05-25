import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlaybackAdapter } from "./mediaPlayback";
import { createYouTubeAdapter, isYouTubeOwnedHost } from "./playbackAdapters/youtubeAdapter";

interface FakeYouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  getPlayerState: () => number;
  getVideoLoadedFraction: () => number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
}

afterEach(() => {
  document.body.replaceChildren();
});

function bufferedRange(end: number): TimeRanges {
  return {
    end: (index: number) => {
      if (index !== 0) {
        throw new DOMException("Index out of bounds");
      }
      return end;
    },
    length: end > 0 ? 1 : 0,
    start: (index: number) => {
      if (index !== 0) {
        throw new DOMException("Index out of bounds");
      }
      return 0;
    }
  };
}

function createManagedYouTubeVideo(options: {
  bufferedEnd?: number;
  currentTime?: number;
  duration?: number;
  playerCurrentTime?: number;
  playerState?: number;
  readyState?: number;
} = {}) {
  const {
    currentTime = 42,
    duration = 120,
    playerState = 1
  } = options;
  const bufferedEnd = options.bufferedEnd ?? duration;
  const readyState = options.readyState ?? (playerState === 3 ? 2 : 4);
  const playerCurrentTime = options.playerCurrentTime ?? currentTime;
  let nextCurrentTime = currentTime;
  const nextPlayerCurrentTime = playerCurrentTime;
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
    get: () => readyState
  });
  Object.defineProperty(video, "buffered", {
    configurable: true,
    get: () => bufferedRange(bufferedEnd)
  });

  const player = document.createElement("div") as unknown as HTMLElement & FakeYouTubePlayer;
  player.className = "html5-video-player";
  player.getCurrentTime = vi.fn(() => nextPlayerCurrentTime);
  player.getDuration = vi.fn(() => duration);
  player.getPlaybackRate = vi.fn(() => nextPlaybackRate);
  player.getPlayerState = vi.fn(() => playerState);
  player.getVideoLoadedFraction = vi.fn(() => bufferedEnd / duration);
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

  it("uses the YouTube player time when the native video time is stale", () => {
    const { video } = createManagedYouTubeVideo({ currentTime: 0, playerCurrentTime: 218 });
    const adapter = createPlaybackAdapter(video, "www.youtube.com");

    expect(adapter.snapshot().currentTime).toBe(218);
  });

  it("treats a paused YouTube frame with current data as stable", () => {
    const { video } = createManagedYouTubeVideo({ playerState: 2, readyState: 2 });
    const adapter = createPlaybackAdapter(video, "www.youtube.com");

    expect(adapter.snapshot()).toMatchObject({
      isLoading: false,
      isStable: true,
      paused: true,
      phase: "paused"
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

  it("seeks YouTube through the player API", () => {
    const { player, rawCurrentTimeSetter, video } = createManagedYouTubeVideo();
    const adapter = createPlaybackAdapter(video, "www.youtube.com");

    adapter.seek(50);

    expect(player.seekTo).toHaveBeenCalledWith(50, false);
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
  });

  it("does not navigate by default for unbuffered YouTube seeks", () => {
    const { player, rawCurrentTimeSetter, video } = createManagedYouTubeVideo({ bufferedEnd: 10 });
    const navigateToUrl = vi.fn();
    const adapter = createYouTubeAdapter(video, "www.youtube.com", navigateToUrl);
    expect(adapter).not.toBeNull();

    expect(adapter!.seek(50)).toBe(false);

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(navigateToUrl).not.toHaveBeenCalled();
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
  });

  it("loads unbuffered YouTube seeks through a timestamped URL when allowed", () => {
    const { player, rawCurrentTimeSetter, video } = createManagedYouTubeVideo({ bufferedEnd: 10 });
    const navigateToUrl = vi.fn();
    const adapter = createYouTubeAdapter(video, "www.youtube.com", navigateToUrl);
    expect(adapter).not.toBeNull();

    expect(adapter!.seek(50, { allowPageNavigation: true })).toBe(true);

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(navigateToUrl).toHaveBeenCalledWith("http://localhost:3000/?t=50s");
    expect(rawCurrentTimeSetter).not.toHaveBeenCalled();
  });

  it("falls back to the HTML adapter off YouTube hosts", () => {
    const { rawCurrentTimeSetter, video } = createManagedYouTubeVideo();
    const adapter = createPlaybackAdapter(video, "example.com");

    expect(adapter.kind).toBe("html-video");
    adapter.seek(50);
    expect(rawCurrentTimeSetter).toHaveBeenCalledWith(50);
  });
});

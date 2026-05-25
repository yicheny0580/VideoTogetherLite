import { clampSeekTime, finiteNumber, readFiniteNumber } from "./shared";
import type { PlaybackAdapter, PlaybackPhase, PlaybackSnapshot } from "./types";

interface YouTubePlayerElement extends HTMLElement {
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlaybackRate?: () => number;
  getPlayerState?: () => number;
  getVideoLoadedFraction?: () => number;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
}

type NavigateToUrl = (url: string) => void;

export function isYouTubeOwnedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "youtu.be"
    || normalized === "youtube.com"
    || normalized.endsWith(".youtube.com")
    || normalized === "youtube-nocookie.com"
    || normalized.endsWith(".youtube-nocookie.com");
}

function getYouTubePlayer(
  video: HTMLVideoElement,
  hostname: string
): YouTubePlayerElement | null {
  if (!isYouTubeOwnedHost(hostname) || typeof video.closest !== "function") {
    return null;
  }

  const player = video.closest<YouTubePlayerElement>(".html5-video-player");
  if (
    player === null
    || typeof player.getPlayerState !== "function"
  ) {
    return null;
  }

  return player;
}

function getPlayerState(player: YouTubePlayerElement): number | null {
  return readFiniteNumber(() => player.getPlayerState?.()) ?? null;
}

function isPaused(player: YouTubePlayerElement, video: HTMLVideoElement): boolean {
  if (video.paused) {
    return true;
  }
  const playerState = getPlayerState(player);
  if (playerState !== null) {
    return playerState !== 1 && playerState !== 3;
  }
  return false;
}

function isVideoLoaded(video: HTMLVideoElement, phase: PlaybackPhase): boolean {
  try {
    const readyState = Number(video.readyState);
    if (Number.isNaN(readyState)) {
      return true;
    }
    return readyState >= 3 || (phase === "paused" && readyState >= 2);
  } catch {
    return true;
  }
}

function phaseForPlayerState(playerState: number | null): PlaybackPhase {
  switch (playerState) {
    case -1:
      return "unstarted";
    case 0:
      return "ended";
    case 1:
      return "playing";
    case 2:
      return "paused";
    case 3:
      return "buffering";
    case 5:
      return "cued";
    default:
      return "unknown";
  }
}

function hasVisiblePlaybackError(player: YouTubePlayerElement): boolean {
  const errorElement = player.querySelector<HTMLElement>(".ytp-error-content-wrap-reason, .ytp-error");
  if (errorElement === null || errorElement.textContent?.trim() === "") {
    return false;
  }

  const style = window.getComputedStyle(errorElement);
  return style.display !== "none" && style.visibility !== "hidden";
}

function isTimeBuffered(
  player: YouTubePlayerElement,
  video: HTMLVideoElement,
  duration: number,
  targetTime: number
): boolean {
  try {
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (targetTime >= video.buffered.start(index) && targetTime <= video.buffered.end(index)) {
        return true;
      }
    }
  } catch {
    return false;
  }

  const loadedFraction = readFiniteNumber(() => player.getVideoLoadedFraction?.());
  return loadedFraction !== null
    && duration > 0
    && targetTime <= duration * loadedFraction;
}

function parseYouTubeUrlTime(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const numericValue = Number.parseFloat(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value.trim());
  if (match === null) {
    return null;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function seekWithTimestampNavigation(targetTime: number, navigateToUrl: NavigateToUrl): boolean {
  const targetSeconds = Math.max(0, Math.floor(targetTime));
  const url = new URL(window.location.href);
  const currentUrlTime = parseYouTubeUrlTime(url.searchParams.get("t"))
    ?? parseYouTubeUrlTime(url.searchParams.get("time_continue"))
    ?? parseYouTubeUrlTime(url.searchParams.get("start"));

  if (currentUrlTime !== null && Math.abs(currentUrlTime - targetSeconds) <= 1) {
    return true;
  }

  url.searchParams.delete("time_continue");
  url.searchParams.delete("start");
  url.searchParams.set("t", `${targetSeconds}s`);
  navigateToUrl(url.toString());
  return true;
}

function snapshotYouTubePlayer(
  player: YouTubePlayerElement,
  video: HTMLVideoElement
): PlaybackSnapshot {
  const currentTime = readFiniteNumber(() => player.getCurrentTime?.())
    ?? readFiniteNumber(() => video.currentTime);
  const duration = readFiniteNumber(() => player.getDuration?.())
    ?? readFiniteNumber(() => video.duration);
  const phase = phaseForPlayerState(getPlayerState(player));
  const hasPlaybackError = hasVisiblePlaybackError(player);
  const isLoading = hasPlaybackError || !isVideoLoaded(video, phase);
  const isStable = !hasPlaybackError
    && !isLoading
    && currentTime !== null
    && duration !== null
    && duration > 0
    && (phase === "ended" || phase === "paused" || phase === "playing");
  return {
    currentTime: currentTime ?? 0,
    duration: duration ?? 0,
    hasPlaybackError,
    isLoading,
    isStable,
    paused: isPaused(player, video),
    phase,
    playbackRate: readFiniteNumber(() => video.playbackRate)
      ?? readFiniteNumber(() => player.getPlaybackRate?.())
      ?? 1
  };
}

export function createYouTubeAdapter(
  video: HTMLVideoElement,
  hostname: string,
  navigateToUrl: NavigateToUrl = (url) => { window.location.href = url; }
): PlaybackAdapter | null {
  const player = getYouTubePlayer(video, hostname);
  if (player === null) {
    return null;
  }

  return {
    kind: "youtube",
    pause: () => {
      try {
        if (typeof player.pauseVideo === "function") {
          player.pauseVideo();
          return;
        }
        video.pause();
      } catch {
        // Ignore host-specific pause failures; future updates can retry.
      }
    },
    play: async () => {
      await video.play();
    },
    seek: (targetTime, options = {}) => {
      const snapshot = snapshotYouTubePlayer(player, video);
      const safeTarget = clampSeekTime(snapshot.duration, targetTime);
      if (!isTimeBuffered(player, video, snapshot.duration, safeTarget)) {
        if (options.allowPageNavigation === true) {
          return seekWithTimestampNavigation(safeTarget, navigateToUrl);
        }
        return false;
      }
      if (typeof player.seekTo === "function") {
        try {
          player.seekTo(safeTarget, false);
          return true;
        } catch {
          // Fall back to the native element only when it is already buffered.
        }
      }
      try {
        video.currentTime = safeTarget;
        return true;
      } catch {
        // Some host players reject seeks before metadata is ready.
        return false;
      }
    },
    setPlaybackRate: (playbackRate) => {
      const safeRate = finiteNumber(playbackRate);
      if (safeRate === null || snapshotYouTubePlayer(player, video).playbackRate === safeRate) {
        return;
      }
      try {
        video.playbackRate = safeRate;
      } catch {
        // YouTube may ignore unsupported rates.
      }
    },
    snapshot: () => snapshotYouTubePlayer(player, video)
  };
}

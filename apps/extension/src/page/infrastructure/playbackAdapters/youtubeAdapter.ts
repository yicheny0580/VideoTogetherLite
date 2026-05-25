import { clampSeekTime, finiteNumber, readFiniteNumber } from "./shared";
import type { PlaybackAdapter, PlaybackPhase, PlaybackSnapshot } from "./types";

interface YouTubePlayerElement extends HTMLElement {
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlaybackRate?: () => number;
  getPlayerState?: () => number;
}

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

function isVideoLoaded(video: HTMLVideoElement): boolean {
  try {
    if (Number.isNaN(Number(video.readyState))) {
      return true;
    }
    return video.readyState >= 3;
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

function snapshotYouTubePlayer(
  player: YouTubePlayerElement,
  video: HTMLVideoElement
): PlaybackSnapshot {
  const currentTime = readFiniteNumber(() => video.currentTime)
    ?? readFiniteNumber(() => player.getCurrentTime?.());
  const duration = readFiniteNumber(() => video.duration)
    ?? readFiniteNumber(() => player.getDuration?.());
  const phase = phaseForPlayerState(getPlayerState(player));
  const hasPlaybackError = hasVisiblePlaybackError(player);
  const isLoading = hasPlaybackError || !isVideoLoaded(video);
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
  hostname: string
): PlaybackAdapter | null {
  const player = getYouTubePlayer(video, hostname);
  if (player === null) {
    return null;
  }

  return {
    kind: "youtube",
    pause: () => {
      try {
        video.pause();
      } catch {
        // Ignore host-specific pause failures; future updates can retry.
      }
    },
    play: async () => {
      await video.play();
    },
    seek: (targetTime) => {
      const safeTarget = clampSeekTime(snapshotYouTubePlayer(player, video).duration, targetTime);
      try {
        video.currentTime = safeTarget;
      } catch {
        // Some host players reject seeks before metadata is ready.
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

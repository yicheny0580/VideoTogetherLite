import { clampSeekTime, finiteNumber, readFiniteNumber } from "./shared";
import type { PlaybackAdapter, PlaybackPhase, PlaybackSnapshot } from "./types";

interface BilibiliPlayerState {
  initError?: boolean;
}

interface BilibiliPlayer {
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlaybackRate?: () => number;
  getStates?: () => BilibiliPlayerState;
  isEnded?: () => boolean;
  isPaused?: () => boolean;
  isSeeking?: () => boolean;
  mediaElement?: () => HTMLMediaElement | null;
  pause?: () => void;
  play?: () => Promise<void> | void;
  seek?: (seconds: number) => void;
  setPlaybackRate?: (playbackRate: number) => void;
}

declare global {
  interface Window {
    player?: BilibiliPlayer;
  }
}

export function isBilibiliOwnedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "bilibili.com" || normalized.endsWith(".bilibili.com");
}

function readBoolean(read: () => unknown): boolean | null {
  try {
    const value = read();
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

function getBilibiliPlayer(video: HTMLVideoElement, hostname: string): BilibiliPlayer | null {
  if (!isBilibiliOwnedHost(hostname)) {
    return null;
  }

  const player = window.player;
  if (
    player === undefined
    || typeof player.mediaElement !== "function"
    || typeof player.getCurrentTime !== "function"
    || typeof player.getDuration !== "function"
  ) {
    return null;
  }

  try {
    if (player.mediaElement() !== video) {
      return null;
    }
  } catch {
    return null;
  }

  return player;
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

function phaseForPlayer(player: BilibiliPlayer, video: HTMLVideoElement): PlaybackPhase {
  if (readBoolean(() => player.isEnded?.()) ?? video.ended) {
    return "ended";
  }
  if (readBoolean(() => player.isSeeking?.()) === true) {
    return "buffering";
  }
  if (readBoolean(() => player.isPaused?.()) ?? video.paused) {
    return "paused";
  }
  return "playing";
}

function hasVisiblePlaybackError(player: BilibiliPlayer): boolean {
  try {
    if (player.getStates?.().initError === true) {
      return true;
    }
  } catch {
    return true;
  }

  const errorElement = document.querySelector<HTMLElement>(
    ".bpx-player-error-sign, .bilibili-player-video-error"
  );
  if (errorElement === null || errorElement.textContent?.trim() === "") {
    return false;
  }

  const style = window.getComputedStyle(errorElement);
  const rect = errorElement.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && rect.width > 0
    && rect.height > 0;
}

function snapshotBilibiliPlayer(
  player: BilibiliPlayer,
  video: HTMLVideoElement
): PlaybackSnapshot {
  const currentTime = readFiniteNumber(() => player.getCurrentTime?.())
    ?? readFiniteNumber(() => video.currentTime);
  const duration = readFiniteNumber(() => player.getDuration?.())
    ?? readFiniteNumber(() => video.duration);
  const phase = phaseForPlayer(player, video);
  const hasPlaybackError = hasVisiblePlaybackError(player);
  const isLoading = hasPlaybackError
    || phase === "buffering"
    || !isVideoLoaded(video, phase);
  return {
    currentTime: currentTime ?? 0,
    duration: duration ?? 0,
    hasPlaybackError,
    isLoading,
    isStable: !hasPlaybackError
      && !isLoading
      && currentTime !== null
      && duration !== null
      && duration > 0
      && (phase === "ended" || phase === "paused" || phase === "playing"),
    paused: phase !== "playing" && phase !== "buffering",
    phase,
    playbackRate: readFiniteNumber(() => player.getPlaybackRate?.())
      ?? readFiniteNumber(() => video.playbackRate)
      ?? 1
  };
}

export function createBilibiliAdapter(
  video: HTMLVideoElement,
  hostname: string
): PlaybackAdapter | null {
  const player = getBilibiliPlayer(video, hostname);
  if (player === null) {
    return null;
  }

  return {
    kind: "bilibili",
    pause: () => {
      try {
        if (typeof player.pause === "function") {
          player.pause();
          return;
        }
        video.pause();
      } catch {
        // Ignore host-specific pause failures; future updates can retry.
      }
    },
    play: async () => {
      if (typeof player.play === "function") {
        await player.play();
        return;
      }
      await video.play();
    },
    seek: (targetTime) => {
      const safeTarget = clampSeekTime(snapshotBilibiliPlayer(player, video).duration, targetTime);
      if (typeof player.seek === "function") {
        try {
          player.seek(safeTarget);
          return true;
        } catch {
          // Fall back to the native element when the host player rejects the seek.
        }
      }
      try {
        video.currentTime = safeTarget;
        return true;
      } catch {
        return false;
      }
    },
    setPlaybackRate: (playbackRate) => {
      const safeRate = finiteNumber(playbackRate);
      if (safeRate === null || snapshotBilibiliPlayer(player, video).playbackRate === safeRate) {
        return;
      }
      try {
        if (typeof player.setPlaybackRate === "function") {
          player.setPlaybackRate(safeRate);
          return;
        }
        video.playbackRate = safeRate;
      } catch {
        // Bilibili may ignore unsupported rates.
      }
    },
    snapshot: () => snapshotBilibiliPlayer(player, video)
  };
}

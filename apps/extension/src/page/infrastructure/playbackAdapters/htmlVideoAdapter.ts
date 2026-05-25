import { clampSeekTime, finiteNumber, readFiniteNumber } from "./shared";
import type { PlaybackAdapter, PlaybackPhase, PlaybackSnapshot } from "./types";

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

function snapshotVideo(video: HTMLVideoElement): PlaybackSnapshot {
  const currentTime = readFiniteNumber(() => video.currentTime) ?? 0;
  const duration = readFiniteNumber(() => video.duration) ?? 0;
  const phase: PlaybackPhase = video.ended ? "ended" : video.paused ? "paused" : "playing";
  return {
    currentTime,
    duration,
    hasPlaybackError: false,
    isLoading: !isVideoLoaded(video),
    isStable: true,
    paused: video.paused,
    phase,
    playbackRate: readFiniteNumber(() => video.playbackRate) ?? 1
  };
}

export function createHtmlVideoAdapter(video: HTMLVideoElement): PlaybackAdapter {
  return {
    kind: "html-video",
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
      const safeTarget = clampSeekTime(snapshotVideo(video).duration, targetTime);
      try {
        video.currentTime = safeTarget;
      } catch {
        // Some host players reject seeks before metadata is ready.
      }
    },
    setPlaybackRate: (playbackRate) => {
      const safeRate = finiteNumber(playbackRate);
      if (safeRate === null || video.playbackRate === safeRate) {
        return;
      }
      try {
        video.playbackRate = safeRate;
      } catch {
        // Some hosts block playbackRate updates.
      }
    },
    snapshot: () => snapshotVideo(video)
  };
}

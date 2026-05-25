import { calculateRealCurrent, type SharedVideoState } from "@videotogetherlite/shared";

function finiteNumber(value: unknown): number | null {
  const numberValue = Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : null;
}

function clampSeekTime(video: HTMLVideoElement, targetTime: number): number {
  const duration = finiteNumber(video.duration);
  if (duration !== null && duration > 0) {
    return Math.min(Math.max(targetTime, 0), duration);
  }
  return Math.max(targetTime, 0);
}

function seekVideo(video: HTMLVideoElement, targetTime: number): void {
  const safeTarget = clampSeekTime(video, targetTime);
  try {
    video.currentTime = safeTarget;
  } catch {
    // Some host players reject seeks before metadata is ready.
  }
}

function syncPlaybackRate(video: HTMLVideoElement, sharedVideo: SharedVideoState): void {
  const playbackRate = finiteNumber(sharedVideo.playbackRate);
  if (playbackRate === null || video.playbackRate === playbackRate) {
    return;
  }
  try {
    video.playbackRate = playbackRate;
  } catch {
    // Some hosts block playbackRate updates.
  }
}

async function syncPausedState(
  video: HTMLVideoElement,
  paused: boolean,
  manualPlayMessage: string
): Promise<void> {
  if (video.paused === paused) {
    return;
  }
  if (paused) {
    try {
      video.pause();
    } catch {
      // Ignore host-specific pause failures; future updates can retry.
    }
    return;
  }

  try {
    await video.play();
  } catch {
    throw new Error(manualPlayMessage);
  }
  if (video.paused) {
    throw new Error(manualPlayMessage);
  }
}

export async function syncVideoToRoom(
  sharedVideo: SharedVideoState,
  video: HTMLVideoElement,
  localTimestamp: number,
  manualPlayMessage: string
): Promise<void> {
  syncPlaybackRate(video, sharedVideo);

  const realCurrent = calculateRealCurrent(sharedVideo, localTimestamp);
  if (!sharedVideo.paused && Math.abs(video.currentTime - realCurrent) > 1) {
    seekVideo(video, realCurrent);
  } else if (sharedVideo.paused && Math.abs(video.currentTime - sharedVideo.currentTime) > 0.1) {
    seekVideo(video, sharedVideo.currentTime);
  }

  await syncPausedState(video, sharedVideo.paused, manualPlayMessage);
}

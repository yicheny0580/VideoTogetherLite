import { calculateRealCurrent, type SharedVideoState } from "@videotogetherlite/shared";

import { createPlaybackAdapter, type PlaybackAdapter } from "../infrastructure/mediaPlayback";

const pendingSeekTargetToleranceSeconds = 8;

interface PendingSeekRecord {
  targetTime: number;
}

const pendingSeekRecords = new WeakMap<HTMLVideoElement, PendingSeekRecord>();

function shouldSkipSeek(
  video: HTMLVideoElement,
  adapter: PlaybackAdapter,
  snapshot: ReturnType<PlaybackAdapter["snapshot"]>,
  targetTime: number
): boolean {
  const record = pendingSeekRecords.get(video);
  if (record === undefined) {
    return false;
  }

  if (adapter.kind === "youtube") {
    if (Math.abs(snapshot.currentTime - record.targetTime) <= 0.5) {
      pendingSeekRecords.delete(video);
      return false;
    }
    return true;
  }

  if (!snapshot.isLoading) {
    pendingSeekRecords.delete(video);
    return false;
  }

  const sameTarget = Math.abs(record.targetTime - targetTime) <= pendingSeekTargetToleranceSeconds;
  if (!sameTarget) {
    pendingSeekRecords.delete(video);
  }
  return sameTarget;
}

function rememberSeek(
  video: HTMLVideoElement,
  targetTime: number
): void {
  pendingSeekRecords.set(video, { targetTime });
}

async function syncPausedState(
  adapter: PlaybackAdapter,
  paused: boolean,
  manualPlayMessage: string
): Promise<void> {
  const snapshot = adapter.snapshot();
  if (snapshot.hasPlaybackError) {
    return;
  }
  if (snapshot.paused === paused) {
    return;
  }
  if (paused) {
    adapter.pause();
    return;
  }
  if (snapshot.isLoading) {
    return;
  }

  try {
    await adapter.play();
  } catch {
    throw new Error(manualPlayMessage);
  }
  if (adapter.snapshot().paused) {
    throw new Error(manualPlayMessage);
  }
}

export async function syncVideoToRoom(
  sharedVideo: SharedVideoState,
  video: HTMLVideoElement,
  localTimestamp: number,
  manualPlayMessage: string,
  playbackAdapter = createPlaybackAdapter(video)
): Promise<void> {
  const adapter = playbackAdapter;
  const initialSnapshot = adapter.snapshot();
  if (
    initialSnapshot.hasPlaybackError
    || (sharedVideo.isLoading && !sharedVideo.paused && adapter.kind !== "youtube")
  ) {
    return;
  }
  if (!sharedVideo.isLoading) {
    adapter.setPlaybackRate(sharedVideo.playbackRate);
  }

  const realCurrent = calculateRealCurrent(sharedVideo, localTimestamp);
  const snapshot = adapter.snapshot();
  if (!sharedVideo.paused && Math.abs(snapshot.currentTime - realCurrent) > 1) {
    if (!shouldSkipSeek(video, adapter, snapshot, realCurrent)) {
      if (adapter.seek(realCurrent, { allowPageNavigation: true })) {
        rememberSeek(video, realCurrent);
      }
    }
  } else if (sharedVideo.paused && Math.abs(snapshot.currentTime - sharedVideo.currentTime) > 0.1) {
    if (!shouldSkipSeek(video, adapter, snapshot, sharedVideo.currentTime)) {
      if (adapter.seek(sharedVideo.currentTime, { allowPageNavigation: true })) {
        rememberSeek(video, sharedVideo.currentTime);
      }
    }
  }

  await syncPausedState(adapter, sharedVideo.paused, manualPlayMessage);
}

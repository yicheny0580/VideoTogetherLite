import type { SharedVideoState } from "./protocol";

export interface TimeSyncState {
  minTrip: number;
  offset: number;
}

export function createTimeSyncState(): TimeSyncState {
  return {
    minTrip: Number.POSITIVE_INFINITY,
    offset: 0
  };
}

export function updateTimeSync(
  current: TimeSyncState,
  serverTimestamp: unknown,
  startTime: unknown,
  endTime: unknown
): TimeSyncState {
  if (
    typeof serverTimestamp !== "number"
    || typeof startTime !== "number"
    || typeof endTime !== "number"
  ) {
    return current;
  }

  const trip = endTime - startTime;
  if (trip >= current.minTrip) {
    return current;
  }

  return {
    minTrip: trip,
    offset: serverTimestamp - (startTime + endTime) / 2
  };
}

export function getLocalTimestamp(state: TimeSyncState): number {
  return Date.now() / 1000 + state.offset;
}

export function calculateRealCurrent(
  video: Pick<SharedVideoState, "currentTime" | "lastUpdateClientTime" | "playbackRate">,
  localTimestamp: number
): number {
  const playbackRate = Number.parseFloat(String(video.playbackRate));
  return video.currentTime
    + (localTimestamp - video.lastUpdateClientTime) * (Number.isNaN(playbackRate) ? 1 : playbackRate);
}

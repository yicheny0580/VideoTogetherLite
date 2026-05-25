import { linkWithoutState } from "@videotogetherlite/shared";

import { isYouTubeOwnedHost } from "../infrastructure/playbackAdapters/youtubeAdapter";

export function getDisplayTimeText(): string {
  const date = new Date();
  return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

export function getHostName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function getProgressText(currentTime: number, duration: number): string {
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return "0:00";
  }
  const current = formatSeconds(currentTime);
  if (!Number.isFinite(duration) || duration <= 0) {
    return current;
  }
  return `${current} / ${formatSeconds(duration)}`;
}

export function getPlaybackIdentityUrl(link: string | URL | Location): string {
  const url = new URL(linkWithoutState(link));
  if (isYouTubeOwnedHost(url.hostname)) {
    url.searchParams.delete("t");
    url.searchParams.delete("time_continue");
    url.searchParams.delete("start");
  }
  return url.toString();
}

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

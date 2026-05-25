import { createHtmlVideoAdapter } from "./playbackAdapters/htmlVideoAdapter";
import type { PlaybackAdapter, PlaybackSnapshot } from "./playbackAdapters/types";
import { createYouTubeAdapter } from "./playbackAdapters/youtubeAdapter";

export type {
  PlaybackAdapter,
  PlaybackAdapterKind,
  PlaybackPhase,
  PlaybackSnapshot
} from "./playbackAdapters/types";

export function createPlaybackAdapter(
  video: HTMLVideoElement,
  hostname = window.location.hostname
): PlaybackAdapter {
  return createYouTubeAdapter(video, hostname) ?? createHtmlVideoAdapter(video);
}

export function getPlaybackSnapshot(video: HTMLVideoElement): PlaybackSnapshot {
  return createPlaybackAdapter(video).snapshot();
}

export type PlaybackAdapterKind = "youtube" | "html-video";
export type PlaybackPhase = "buffering" | "cued" | "ended" | "paused" | "playing" | "unstarted" | "unknown";

export interface PlaybackSnapshot {
  currentTime: number;
  duration: number;
  hasPlaybackError: boolean;
  isLoading: boolean;
  isStable: boolean;
  paused: boolean;
  phase: PlaybackPhase;
  playbackRate: number;
}

export interface PlaybackSeekOptions {
  allowPageNavigation?: boolean;
}

export interface PlaybackAdapter {
  readonly kind: PlaybackAdapterKind;
  pause: () => void;
  play: () => Promise<void>;
  seek: (targetTime: number, options?: PlaybackSeekOptions) => boolean;
  setPlaybackRate: (playbackRate: number) => void;
  snapshot: () => PlaybackSnapshot;
}

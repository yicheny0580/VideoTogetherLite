import { describe, expect, it } from "vitest";

import { createTimeSyncState } from "@videotogetherlite/shared";

import type { FocusableVideo, VideoRegistry } from "../infrastructure/videoRegistry";
import { buildFocusedVideoState } from "./controllerState";

function registryFor(video: HTMLVideoElement | null): VideoRegistry {
  const summary: FocusableVideo = {
    currentTime: video?.currentTime ?? 0,
    duration: video?.duration ?? 0,
    id: "video-1",
    paused: video?.paused ?? true,
    title: "Selected video",
    visible: true
  };
  return {
    getFocusedVideoSummary: () => video === null ? null : summary,
    getVideoDom: () => video
  } as unknown as VideoRegistry;
}

function videoWithState(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    currentTime: 8,
    duration: 120,
    paused: false,
    playbackRate: 1.25,
    readyState: 2,
    ...overrides
  } as HTMLVideoElement;
}

describe("buildFocusedVideoState", () => {
  it("keeps a playing state even while the video is still loading", () => {
    const state = buildFocusedVideoState(
      registryFor(videoWithState({ paused: false, readyState: 2 })),
      true,
      createTimeSyncState()
    );

    expect(state?.isLoading).toBe(true);
    expect(state?.paused).toBe(false);
    expect(state?.playbackRate).toBe(1.25);
  });

  it("does not publish a focused video when sharing is off", () => {
    expect(buildFocusedVideoState(
      registryFor(videoWithState()),
      false,
      createTimeSyncState()
    )).toBeUndefined();
  });
});

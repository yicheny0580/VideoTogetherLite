import { describe, expect, it } from "vitest";

import { createTimeSyncState, type Room, type SharedVideoState } from "@videotogetherlite/shared";

import type { PlaybackAdapter } from "../infrastructure/mediaPlayback";
import type { FocusableVideo, VideoRegistry } from "../infrastructure/videoRegistry";
import { buildFocusedVideoState, syncFollowTargetVideo } from "./controllerState";

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

function sharedVideo(overrides: Partial<SharedVideoState> = {}): SharedVideoState {
  return {
    currentTime: 30,
    duration: 120,
    isLoading: false,
    lastUpdateClientTime: Date.now() / 1000,
    lastUpdateServerTime: 0,
    paused: true,
    playbackRate: 1,
    title: "Shared video",
    url: window.location.href,
    ...overrides
  };
}

function playbackAdapter(overrides: Partial<ReturnType<PlaybackAdapter["snapshot"]>> = {}): PlaybackAdapter {
  return {
    kind: "youtube",
    pause: () => undefined,
    play: async () => undefined,
    seek: () => undefined,
    setPlaybackRate: () => undefined,
    snapshot: () => ({
      currentTime: 8,
      duration: 120,
      hasPlaybackError: false,
      isLoading: false,
      isStable: true,
      paused: false,
      phase: "playing",
      playbackRate: 1.25,
      ...overrides
    })
  };
}

describe("buildFocusedVideoState", () => {
  it("keeps a playing state even while the video is still loading", () => {
    const state = buildFocusedVideoState(
      registryFor(videoWithState({ paused: false, readyState: 2 })),
      createTimeSyncState()
    );

    expect(state?.isLoading).toBe(true);
    expect(state?.paused).toBe(false);
    expect(state?.playbackRate).toBe(1.25);
  });

  it("does not publish without a focused video", () => {
    expect(buildFocusedVideoState(
      registryFor(null),
      createTimeSyncState()
    )).toBeUndefined();
  });

  it("publishes YouTube loading state instead of stale previous state", () => {
    const state = buildFocusedVideoState(
      registryFor(videoWithState()),
      createTimeSyncState(),
      {
        createAdapter: () => playbackAdapter({
          currentTime: 625,
          isLoading: true,
          isStable: false,
          phase: "buffering"
        })
      }
    );

    expect(state).toMatchObject({
      currentTime: 625,
      isLoading: true
    });
  });

  it("does not publish a YouTube playback error", () => {
    const state = buildFocusedVideoState(
      registryFor(videoWithState()),
      createTimeSyncState(),
      {
        createAdapter: () => playbackAdapter({
          hasPlaybackError: true,
          isLoading: true,
          isStable: false
        })
      }
    );

    expect(state).toBeUndefined();
  });

  it("follows with an automatic playback target instead of a picked video", async () => {
    const followerVideo = videoWithState({ currentTime: 0, paused: true });
    const room: Room = {
      participantCount: 2,
      participants: [{
        focusedVideo: sharedVideo({ currentTime: 33 }),
        lastSeenServerTime: 0,
        nickname: "Alice",
        sharing: true,
        userId: "alice"
      }],
      roomCode: "ROOM",
      uuid: "room-uuid"
    };
    const registry = {
      getPlaybackTargetVideoDom: () => followerVideo,
      getVideoDom: () => null
    } as unknown as VideoRegistry;

    await syncFollowTargetVideo({
      followUserId: "alice",
      manualPlayMessage: "manual",
      onStatus: () => undefined,
      pickVideoToFollowMessage: "no video",
      room,
      saveState: () => undefined,
      sessionToken: "session",
      timeSync: createTimeSyncState(),
      videoRegistry: registry
    });

    expect(followerVideo.currentTime).toBe(33);
  });
});

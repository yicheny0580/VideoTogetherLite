import {
  getLocalTimestamp,
  linkWithRoomState,
  linkWithoutState,
  type Room,
  type RoomParticipant,
  type SharedVideoState,
  type TimeSyncState
} from "@videotogetherlite/shared";

import type { VideoTogetherLiteApiClient } from "../infrastructure/httpClient";
import { isVideoLoaded, type VideoRegistry } from "../infrastructure/videoRegistry";
import type { VideoTogetherLiteWsClient } from "../infrastructure/wsClient";
import { getHostName } from "./controllerUtils";
import type { PanelState, ParticipantPanelState, StatusTone } from "./panelState";
import { syncVideoToRoom } from "./videoSync";

export function buildFocusedVideoState(
  videoRegistry: VideoRegistry,
  timeSync: TimeSyncState
): SharedVideoState | undefined {
  const video = videoRegistry.getVideoDom();
  if (video === null) {
    return undefined;
  }
  return {
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    isLoading: !isVideoLoaded(video),
    lastUpdateClientTime: getLocalTimestamp(timeSync),
    lastUpdateServerTime: 0,
    paused: video.paused,
    playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
    title: videoRegistry.getFocusedVideoSummary()?.title || document.title || "Untitled video",
    url: linkWithoutState(window.location)
  };
}

export function normalizeNickname(nickname: string, fallback: string): string {
  const trimmed = nickname.trim();
  return trimmed === "" ? fallback : trimmed.slice(0, 40);
}

export function followParticipantVideo({
  followUserId,
  notSharingText,
  onFollow,
  onStatus,
  room,
  roomCode,
  saveState,
  sessionToken
}: {
  followUserId: string;
  notSharingText: string;
  onFollow: () => void;
  onStatus: (statusText: string, statusTone: StatusTone) => void;
  room: Room | null;
  roomCode: string;
  saveState: (followUserId: string) => void;
  sessionToken: string;
}): void {
  const participant = room?.participants.find((item) => item.userId === followUserId);
  const video = participant?.focusedVideo;
  if (!participant?.sharing || video === undefined) {
    onStatus(notSharingText, "danger");
    return;
  }

  saveState(followUserId);
  if (video.url !== "" && video.url !== linkWithoutState(window.location)) {
    window.location.href = linkWithRoomState(video.url, roomCode, sessionToken, followUserId).toString();
    return;
  }
  onFollow();
}

export function startVideoPickerFlow({
  onSchedule,
  onUpdateFullscreen,
  setPanelState,
  text,
  videoRegistry
}: {
  onSchedule: () => void;
  onUpdateFullscreen: () => void;
  setPanelState: (next: Partial<PanelState>) => void;
  text: { focused: string; instruction: string; notFound: string };
  videoRegistry: VideoRegistry;
}): void {
  setPanelState({ pickingVideo: true, statusText: text.instruction, statusTone: "default" });
  const started = videoRegistry.startPicker(
    (video) => {
      setPanelState({ focusedVideo: video, pickingVideo: false, sharing: true, statusText: text.focused, statusTone: "success" });
      onUpdateFullscreen();
      onSchedule();
    },
    () => setPanelState({ pickingVideo: false })
  );
  if (!started) {
    setPanelState({ pickingVideo: false, statusText: text.notFound, statusTone: "danger" });
  }
}

export async function syncFollowTargetVideo({
  followUserId,
  manualPlayMessage,
  onStatus,
  pickVideoToFollowMessage,
  room,
  saveState,
  sessionToken,
  timeSync,
  videoRegistry
}: {
  followUserId: string;
  manualPlayMessage: string;
  onStatus: (statusText: string, statusTone: StatusTone) => void;
  pickVideoToFollowMessage: string;
  room: Room | null;
  saveState: (followUserId: string) => void;
  sessionToken: string;
  timeSync: TimeSyncState;
  videoRegistry: VideoRegistry;
}): Promise<void> {
  if (!room || followUserId === "") {
    return;
  }

  const participant = room.participants.find((item) => item.userId === followUserId);
  const sharedVideo = participant?.focusedVideo;
  if (!participant?.sharing || sharedVideo === undefined) {
    return;
  }

  const currentUrl = linkWithoutState(window.location);
  if (sharedVideo.url !== "" && sharedVideo.url !== currentUrl) {
    saveState(participant.userId);
    window.location.href = linkWithRoomState(sharedVideo.url, room.roomCode, sessionToken, participant.userId).toString();
    return;
  }

  const video = videoRegistry.getPlaybackTargetVideoDom();
  if (video === null) {
    onStatus(pickVideoToFollowMessage, "danger");
    return;
  }

  await syncVideoToRoom(sharedVideo, video, getLocalTimestamp(timeSync), manualPlayMessage);
}

export async function updateParticipantRoom({
  apiClient,
  applyRoomSession,
  nickname,
  onLostFocusedVideo,
  sessionToken,
  timeSync,
  videoRegistry,
  wsClient
}: {
  apiClient: VideoTogetherLiteApiClient;
  applyRoomSession: (response: { room: Room; sessionToken?: string }) => void;
  nickname: string;
  onLostFocusedVideo: () => void;
  sessionToken: string;
  timeSync: TimeSyncState;
  videoRegistry: VideoRegistry;
  wsClient: VideoTogetherLiteWsClient;
}): Promise<Room> {
  const focusedVideo = buildFocusedVideoState(videoRegistry, timeSync);
  if (focusedVideo === undefined) {
    onLostFocusedVideo();
  }
  const payload = {
    focusedVideo,
    nickname,
    sendLocalTimestamp: Date.now() / 1000,
    sessionToken,
    sharing: focusedVideo !== undefined
  };
  if (wsClient.isOpen()) {
    wsClient.updateRoom(payload);
    const wsRoom = wsClient.getRoom();
    if (wsRoom) {
      return wsRoom;
    }
  }

  const response = await apiClient.updateRoom(payload);
  applyRoomSession(response);
  return response.room;
}

export function toParticipantPanelState(
  participant: RoomParticipant,
  userId: string,
  followUserId: string,
  noSharedVideoText: string
): ParticipantPanelState {
  const video = participant.focusedVideo;
  return {
    currentTime: video?.currentTime ?? 0,
    duration: video?.duration ?? 0,
    isFollowing: participant.userId === followUserId,
    isLocal: participant.userId === userId,
    nickname: participant.nickname,
    paused: video?.paused ?? true,
    sharing: participant.sharing && video !== undefined,
    title: video?.title ?? noSharedVideoText,
    url: video?.url ?? "",
    urlHost: video?.url ? getHostName(video.url) : "",
    userId: participant.userId
  };
}

import type { FocusableVideo } from "../infrastructure/videoRegistry";

export type StatusTone = "default" | "danger" | "success";

export interface ParticipantPanelState {
  currentTime: number;
  duration: number;
  isFollowing: boolean;
  isLocal: boolean;
  nickname: string;
  paused: boolean;
  sharing: boolean;
  title: string;
  url: string;
  urlHost: string;
  userId: string;
}

export interface PanelState {
  focusedVideo: FocusableVideo | null;
  followUserId: string;
  inRoom: boolean;
  inviteCode: string;
  nickname: string;
  participantCount: number;
  participants: ParticipantPanelState[];
  pickingVideo: boolean;
  roomCode: string;
  sharing: boolean;
  statusText: string;
  statusTone: StatusTone;
}

export function initialPanelState(statusText: string, nickname = ""): PanelState {
  return {
    focusedVideo: null,
    followUserId: "",
    inRoom: false,
    inviteCode: "",
    nickname,
    participantCount: 0,
    participants: [],
    pickingVideo: false,
    roomCode: "",
    sharing: false,
    statusText,
    statusTone: "default"
  };
}

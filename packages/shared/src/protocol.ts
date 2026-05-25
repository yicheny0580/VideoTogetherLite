export interface Room {
  beginLoaddingTimestamp: number;
  currentTime: number;
  duration: number;
  lastUpdateClientTime: number;
  lastUpdateServerTime: number;
  memberCount: number;
  name: string;
  paused: boolean;
  playbackRate: number;
  protected: boolean;
  timestamp?: number;
  url: string;
  uuid: string;
  videoTitle: string;
  waitForLoadding: boolean;
}

export interface TimestampResponse {
  timestamp: number;
  vtVersion?: number;
}

export interface ErrorResponse {
  errorMessage?: string;
}

export interface RoomResponse extends ErrorResponse, Partial<TimestampResponse> {
  data?: Room;
}

export interface TimestampReplay {
  receiveServerTimestamp: number;
  sendLocalTimestamp: number;
  sendServerTimestamp: number;
}

export type WsMethod =
  | "/room/join"
  | "/room/update"
  | "/room/update_member"
  | "replay_timestamp";

export interface WsResponse<TData = unknown> {
  data?: TData;
  errorMessage?: string;
  method: WsMethod | string;
}

export interface UpdateRoomPayload {
  currentTime: number;
  duration: number;
  lastUpdateClientTime: number;
  name: string;
  password: string;
  paused: boolean;
  playbackRate: number;
  protected: boolean;
  sendLocalTimestamp: number;
  tempUser: string;
  url: string;
  videoTitle: string;
}

export interface UpdateMemberPayload {
  currentUrl: string;
  isLoadding: boolean;
  password: string;
  roomName: string;
  sendLocalTimestamp: number;
  userId: string;
}

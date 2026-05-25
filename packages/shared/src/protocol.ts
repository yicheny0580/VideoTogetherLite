export interface SharedVideoState {
  currentTime: number;
  duration: number;
  isLoading: boolean;
  lastUpdateClientTime: number;
  lastUpdateServerTime: number;
  paused: boolean;
  playbackRate: number;
  title: string;
  url: string;
}

export interface RoomParticipant {
  focusedVideo?: SharedVideoState;
  lastSeenServerTime: number;
  nickname: string;
  sharing: boolean;
  userId: string;
}

export interface Room {
  participantCount: number;
  participants: RoomParticipant[];
  roomCode: string;
  timestamp?: number;
  uuid: string;
}

export interface TimestampResponse {
  timestamp: number;
  videoTogetherLiteVersion?: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface RoomSessionResponse extends Partial<TimestampResponse> {
  inviteCode?: string;
  inviteSecret?: string;
  room: Room;
  sessionToken?: string;
}

export interface TimestampReplay {
  receiveServerTimestamp: number;
  sendLocalTimestamp: number;
  sendServerTimestamp: number;
}

export type WsMessageType =
  | "room.create"
  | "room.join"
  | "room.get"
  | "room.leave"
  | "room.update"
  | "room.updated"
  | "timestamp.replay"
  | "error";

export interface WsRequest<TData = unknown> {
  data: TData;
  id: string;
  type: Exclude<WsMessageType, "room.updated" | "timestamp.replay" | "error">;
}

export interface WsResponse<TData = unknown> {
  data?: TData;
  error?: ApiErrorBody;
  id?: string;
  type: WsMessageType | string;
}

export interface CreateRoomPayload {
  nickname: string;
  userId: string;
}

export interface GetRoomPayload {
  sessionToken: string;
}

export interface JoinRoomPayload {
  inviteCode?: string;
  inviteSecret?: string;
  nickname: string;
  roomCode?: string;
  userId: string;
}

export interface LeaveRoomPayload {
  sessionToken: string;
}

export interface UpdateRoomPayload {
  focusedVideo?: SharedVideoState;
  nickname?: string;
  sendLocalTimestamp: number;
  sessionToken: string;
  sharing: boolean;
}

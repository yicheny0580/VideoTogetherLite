export interface Room {
  beginLoadingTimestamp: number;
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
  waitForLoading: boolean;
}

export interface TimestampResponse {
  timestamp: number;
  vtVersion?: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface RoomSessionResponse extends Partial<TimestampResponse> {
  room: Room;
  sessionToken?: string;
}

export interface TimestampReplay {
  receiveServerTimestamp: number;
  sendLocalTimestamp: number;
  sendServerTimestamp: number;
}

export type WsMessageType =
  | "room.join"
  | "room.get"
  | "room.hostUpdate"
  | "room.memberUpdate"
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

export interface JoinRoomPayload {
  name: string;
  password: string;
  userId: string;
}

export interface GetRoomPayload {
  name: string;
  sessionToken: string;
}

export interface HostUpdatePayload {
  currentTime: number;
  duration: number;
  lastUpdateClientTime: number;
  name: string;
  password?: string;
  paused: boolean;
  playbackRate: number;
  protected: boolean;
  sendLocalTimestamp: number;
  sessionToken?: string;
  url: string;
  userId: string;
  videoTitle: string;
}

export interface MemberUpdatePayload {
  currentUrl: string;
  isLoading: boolean;
  roomName: string;
  sendLocalTimestamp: number;
  sessionToken: string;
  userId: string;
}

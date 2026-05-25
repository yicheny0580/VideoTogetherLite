import type {
  GetRoomPayload,
  HostUpdatePayload,
  JoinRoomPayload,
  Language,
  MemberUpdatePayload,
  Room,
  RoomSessionResponse,
  TimestampReplay,
  WsRequest,
  WsResponse
} from "@videotogetherlite/shared";

function toWsUrl(httpUrl: string, language: Language): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/api/v1/ws";
  url.search = `?language=${language}`;
  return url.toString();
}

function roomResponseToRoom(response: RoomSessionResponse | undefined): Room | null {
  return response?.room ?? null;
}

export class VideoTogetherLiteWsClient {
  private connectedToService = false;
  private joinedName: string | null = null;
  private lastConnectTime = 0;
  private lastErrorMessage: string | null = null;
  private lastRoom: Room | null = null;
  private lastUpdateTime = 0;
  private requestId = 0;
  private socket: WebSocket | null = null;

  constructor(
    private readonly language: Language,
    private readonly onRoom: (room: Room) => void,
    private readonly onTimestamp: (timestamp: TimestampReplay) => void,
    private readonly onSessionToken: (sessionToken: string) => void
  ) {}

  connect(host: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    if (
      this.socket?.readyState === WebSocket.CONNECTING
      && this.lastConnectTime + 10 > Date.now() / 1000
    ) {
      return;
    }

    this.lastConnectTime = Date.now() / 1000;
    this.connectedToService = false;
    try {
      this.disconnect();
      this.socket = new WebSocket(toWsUrl(host, this.language));
      this.socket.onmessage = (event) => this.handleMessage(String(event.data));
    } catch {
      this.socket = null;
    }
  }

  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore socket shutdown errors from pages that are unloading.
      }
    }
    this.connectedToService = false;
    this.joinedName = null;
    this.socket = null;
  }

  getRoom(): Room | null {
    if (this.lastUpdateTime + 5 <= Date.now() / 1000) {
      return null;
    }
    if (this.lastErrorMessage !== null) {
      throw new Error(this.lastErrorMessage);
    }
    return this.lastRoom;
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  joinRoom(payload: JoinRoomPayload): void {
    if (payload.name === this.joinedName) {
      return;
    }
    this.send({
      data: payload,
      id: this.nextRequestId(),
      type: "room.join"
    });
  }

  requestRoom(payload: GetRoomPayload): void {
    this.send({
      data: payload,
      id: this.nextRequestId(),
      type: "room.get"
    });
  }

  updateMember(payload: MemberUpdatePayload): void {
    this.send({
      data: payload,
      id: this.nextRequestId(),
      type: "room.memberUpdate"
    });
  }

  updateRoom(payload: HostUpdatePayload): void {
    this.send({
      data: payload,
      id: this.nextRequestId(),
      type: "room.hostUpdate"
    });
  }

  private handleMessage(raw: string): void {
    const response = JSON.parse(raw) as WsResponse<RoomSessionResponse | TimestampReplay>;
    if (response.type === "error" || response.error != null) {
      this.lastUpdateTime = Date.now() / 1000;
      this.lastErrorMessage = response.error?.message ?? "Unknown websocket error";
      this.lastRoom = null;
      return;
    }

    this.lastErrorMessage = null;
    if (response.type === "room.join") {
      const room = roomResponseToRoom(response.data as RoomSessionResponse);
      this.joinedName = room?.name ?? null;
    }
    if (
      response.type === "room.join"
      || response.type === "room.get"
      || response.type === "room.hostUpdate"
      || response.type === "room.memberUpdate"
      || response.type === "room.updated"
    ) {
      const data = response.data as RoomSessionResponse;
      const room = roomResponseToRoom(data);
      if (!room) {
        return;
      }
      if (data.sessionToken) {
        this.onSessionToken(data.sessionToken);
      }
      this.connectedToService = true;
      this.lastRoom = room;
      this.lastUpdateTime = Date.now() / 1000;
      this.onRoom(room);
    }
    if (response.type === "timestamp.replay") {
      this.onTimestamp(response.data as TimestampReplay);
    }
  }

  private nextRequestId(): string {
    this.requestId += 1;
    return `${this.requestId}:${Date.now()}`;
  }

  private send(data: WsRequest): void {
    try {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(data));
      }
    } catch {
      // Best-effort channel; HTTP requests remain the fallback.
    }
  }
}

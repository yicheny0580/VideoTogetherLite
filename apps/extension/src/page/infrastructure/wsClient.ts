import type {
  GetRoomPayload,
  Language,
  Room,
  RoomSessionResponse,
  TimestampReplay,
  UpdateRoomPayload,
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
  private lastConnectTime = 0;
  private lastErrorMessage: string | null = null;
  private lastRoom: Room | null = null;
  private lastUpdateTime = 0;
  private requestId = 0;
  private socket: WebSocket | null = null;

  constructor(
    private readonly language: Language,
    private readonly onRoom: (room: Room) => void,
    private readonly onTimestamp: (timestamp: TimestampReplay) => void
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

  requestRoom(payload: GetRoomPayload): void {
    this.send({
      data: payload,
      id: this.nextRequestId(),
      type: "room.get"
    });
  }

  updateRoom(payload: UpdateRoomPayload): void {
    this.send({
      data: payload,
      id: this.nextRequestId(),
      type: "room.update"
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
    if (
      response.type === "room.create"
      || response.type === "room.join"
      || response.type === "room.get"
      || response.type === "room.update"
      || response.type === "room.updated"
    ) {
      const room = roomResponseToRoom(response.data as RoomSessionResponse);
      if (!room) {
        return;
      }
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

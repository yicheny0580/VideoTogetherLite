import type {
  Language,
  Room,
  RoomResponse,
  TimestampReplay,
  UpdateMemberPayload,
  UpdateRoomPayload,
  WsResponse
} from "@videotogether/shared";

function toWsUrl(httpUrl: string, language: Language): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/ws";
  url.search = `?language=${language}`;
  return url.toString();
}

function roomResponseToRoom(response: RoomResponse | Room | undefined): Room | null {
  if (!response) {
    return null;
  }
  return ("data" in response && response.data ? response.data : response) as Room;
}

export class VideoTogetherWsClient {
  private connectedToService = false;
  private joinedName: string | null = null;
  private lastConnectTime = 0;
  private lastErrorMessage: string | null = null;
  private lastRoom: Room | null = null;
  private lastUpdateTime = 0;
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

  joinRoom(name: string, password: string): void {
    if (name === this.joinedName) {
      return;
    }
    this.send({
      data: { name, password },
      method: "/room/join"
    });
  }

  updateMember(payload: UpdateMemberPayload): void {
    this.send({
      data: payload,
      method: "/room/update_member"
    });
  }

  updateRoom(payload: UpdateRoomPayload): void {
    this.send({
      data: payload,
      method: "/room/update"
    });
  }

  private handleMessage(raw: string): void {
    for (const line of raw.split("\n")) {
      if (line.trim() !== "") {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    const response = JSON.parse(line) as WsResponse<RoomResponse | TimestampReplay>;
    if (response.errorMessage != null) {
      this.lastUpdateTime = Date.now() / 1000;
      this.lastErrorMessage = response.errorMessage;
      this.lastRoom = null;
      return;
    }

    this.lastErrorMessage = null;
    if (response.method === "/room/join") {
      const room = roomResponseToRoom(response.data as RoomResponse);
      this.joinedName = room?.name ?? null;
    }
    if (
      response.method === "/room/join"
      || response.method === "/room/update"
      || response.method === "/room/update_member"
    ) {
      const room = roomResponseToRoom(response.data as RoomResponse);
      if (!room) {
        return;
      }
      this.connectedToService = true;
      this.lastRoom = room;
      this.lastUpdateTime = Date.now() / 1000;
      this.onRoom(room);
    }
    if (response.method === "replay_timestamp") {
      this.onTimestamp(response.data as TimestampReplay);
    }
  }

  private send(data: unknown): void {
    try {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(data));
      }
    } catch {
      // Best-effort channel; HTTP polling remains the fallback.
    }
  }
}

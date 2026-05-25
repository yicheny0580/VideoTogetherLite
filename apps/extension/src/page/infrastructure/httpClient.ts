import {
  updateTimeSync,
  type ApiErrorResponse,
  type GetRoomPayload,
  type HostUpdatePayload,
  type JoinRoomPayload,
  type Language,
  type MemberUpdatePayload,
  type RoomSessionResponse,
  type TimeSyncState,
  type TimestampResponse
} from "@videotogetherlite/shared";

type TimeSyncSetter = (state: TimeSyncState) => void;
type TimeSyncGetter = () => TimeSyncState;

export class VideoTogetherLiteApiClient {
  constructor(
    private readonly host: string,
    private readonly language: Language,
    private readonly getVersion: () => string,
    private readonly getTimeSync: TimeSyncGetter,
    private readonly setTimeSync: TimeSyncSetter
  ) {}

  async timestamp(): Promise<TimestampResponse> {
    return this.fetchJson<TimestampResponse>("/api/v1/timestamp", undefined, "GET");
  }

  async joinRoom(payload: JoinRoomPayload): Promise<RoomSessionResponse> {
    return this.fetchJson<RoomSessionResponse>("/api/v1/rooms/join", payload);
  }

  async getRoom(payload: GetRoomPayload): Promise<RoomSessionResponse> {
    return this.fetchJson<RoomSessionResponse>("/api/v1/rooms/get", payload);
  }

  async updateRoom(payload: HostUpdatePayload): Promise<RoomSessionResponse> {
    return this.fetchJson<RoomSessionResponse>("/api/v1/rooms/host-update", payload);
  }

  async updateMember(payload: MemberUpdatePayload): Promise<RoomSessionResponse> {
    return this.fetchJson<RoomSessionResponse>("/api/v1/rooms/member-update", payload);
  }

  private async fetchJson<T>(
    path: string,
    body?: object,
    method = "POST"
  ): Promise<T> {
    const url = new URL(path, this.host);
    url.searchParams.set("version", this.getVersion());
    url.searchParams.set("language", this.language);

    const startTime = Date.now() / 1000;
    const response = await fetch(url.toString(), {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method
    });
    const endTime = Date.now() / 1000;
    const data = await response.json() as T & Partial<TimestampResponse> & Partial<ApiErrorResponse>;

    if (!response.ok) {
      throw new Error(data.error?.message ?? `http code: ${response.status}`);
    }
    if (data.error !== undefined) {
      throw new Error(data.error.message);
    }
    if (data.timestamp !== undefined) {
      this.setTimeSync(updateTimeSync(this.getTimeSync(), data.timestamp, startTime, endTime));
    }
    return data;
  }
}

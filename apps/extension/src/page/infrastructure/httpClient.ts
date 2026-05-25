import {
  updateTimeSync,
  type Language,
  type Room,
  type RoomResponse,
  type TimeSyncState,
  type TimestampResponse,
  type UpdateRoomPayload
} from "@videotogether/shared";

type TimeSyncSetter = (state: TimeSyncState) => void;
type TimeSyncGetter = () => TimeSyncState;

function roomResponseToRoom(response: RoomResponse | Room): Room {
  return ("data" in response && response.data ? response.data : response) as Room;
}

function appendParams(url: URL, params: object): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

export class VideoTogetherApiClient {
  constructor(
    private readonly host: string,
    private readonly language: Language,
    private readonly getVersion: () => string,
    private readonly getTimeSync: TimeSyncGetter,
    private readonly setTimeSync: TimeSyncSetter
  ) {}

  async timestamp(): Promise<TimestampResponse> {
    return this.fetchJson<TimestampResponse>("/timestamp");
  }

  async updateRoom(payload: UpdateRoomPayload): Promise<Room> {
    const response = await this.fetchJson<RoomResponse | Room>("/room/update", payload);
    return roomResponseToRoom(response);
  }

  async getRoom(name: string, password: string, tempUser: string): Promise<Room> {
    const response = await this.fetchJson<RoomResponse | Room>("/room/get", {
      name,
      password,
      tempUser
    });
    return roomResponseToRoom(response);
  }

  private async fetchJson<T>(
    path: string,
    params: object = {},
    method = "GET"
  ): Promise<T> {
    const url = new URL(path, this.host);
    appendParams(url, params);
    url.searchParams.set("version", this.getVersion());
    url.searchParams.set("language", this.language);

    const startTime = Date.now() / 1000;
    const response = await fetch(url.toString(), { method });
    const endTime = Date.now() / 1000;
    if (response.status !== 200) {
      throw new Error(`http code: ${response.status}`);
    }

    const data = await response.json() as T & {
      errorMessage?: string;
      timestamp?: number;
    };
    if (data.errorMessage !== undefined) {
      throw new Error(data.errorMessage);
    }
    if (data.timestamp !== undefined) {
      this.setTimeSync(updateTimeSync(this.getTimeSync(), data.timestamp, startTime, endTime));
    }
    return data;
  }
}

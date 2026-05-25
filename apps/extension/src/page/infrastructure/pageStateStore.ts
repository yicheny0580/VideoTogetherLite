import {
  Role,
  linkWithoutState,
  parseRole,
  stateKeys,
  type RoomState
} from "@videotogether/shared";

export class PageStateStore {
  constructor(private readonly maxAgeSeconds: number) {}

  clear(): void {
    for (const key of stateKeys) {
      sessionStorage.removeItem(key);
    }
  }

  recover(currentLocation: Location): RoomState | null {
    const currentUrl = new URL(currentLocation.toString());
    const urlTimestamp = Number.parseFloat(currentUrl.searchParams.get("VideoTogetherTimestamp") ?? "");
    const sessionTimestamp = Number.parseFloat(sessionStorage.getItem("VideoTogetherTimestamp") ?? "");
    const useUrl = !Number.isNaN(urlTimestamp)
      && (Number.isNaN(sessionTimestamp) || urlTimestamp >= sessionTimestamp);
    const getter = useUrl
      ? (key: string) => currentUrl.searchParams.get(key)
      : (key: string) => sessionStorage.getItem(key);
    const timestamp = Number.parseFloat(getter("VideoTogetherTimestamp") ?? "");

    if (Number.isNaN(timestamp) || timestamp + this.maxAgeSeconds < Date.now() / 1000) {
      return null;
    }

    const role = parseRole(getter("VideoTogetherRole"));
    const roomName = getter("VideoTogetherRoomName");
    const sessionToken = getter("VideoTogetherSessionToken");
    if (!roomName || !sessionToken || role === null) {
      return null;
    }

    return {
      role,
      roomName,
      sessionToken,
      timestamp,
      url: getter("VideoTogetherUrl") || linkWithoutState(currentLocation)
    };
  }

  save(roomName: string, sessionToken: string, role: Role, link: string): void {
    if (role === Role.Null) {
      return;
    }

    sessionStorage.setItem("VideoTogetherUrl", link);
    sessionStorage.setItem("VideoTogetherRoomName", roomName);
    sessionStorage.setItem("VideoTogetherSessionToken", sessionToken);
    sessionStorage.setItem("VideoTogetherRole", String(role));
    sessionStorage.setItem("VideoTogetherTimestamp", String(Date.now() / 1000));
  }
}

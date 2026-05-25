import {
  Role,
  linkWithoutState,
  parseRole,
  stateKeys,
  type RoomState
} from "@videotogetherlite/shared";

export class PageStateStore {
  constructor(private readonly maxAgeSeconds: number) {}

  clear(): void {
    for (const key of stateKeys) {
      sessionStorage.removeItem(key);
    }
  }

  recover(currentLocation: Location): RoomState | null {
    const currentUrl = new URL(currentLocation.toString());
    const urlTimestamp = Number.parseFloat(currentUrl.searchParams.get("VideoTogetherLiteTimestamp") ?? "");
    const sessionTimestamp = Number.parseFloat(sessionStorage.getItem("VideoTogetherLiteTimestamp") ?? "");
    const useUrl = !Number.isNaN(urlTimestamp)
      && (Number.isNaN(sessionTimestamp) || urlTimestamp >= sessionTimestamp);
    const getter = useUrl
      ? (key: string) => currentUrl.searchParams.get(key)
      : (key: string) => sessionStorage.getItem(key);
    const timestamp = Number.parseFloat(getter("VideoTogetherLiteTimestamp") ?? "");

    if (Number.isNaN(timestamp) || timestamp + this.maxAgeSeconds < Date.now() / 1000) {
      return null;
    }

    const role = parseRole(getter("VideoTogetherLiteRole"));
    const roomName = getter("VideoTogetherLiteRoomName");
    const sessionToken = getter("VideoTogetherLiteSessionToken");
    if (!roomName || !sessionToken || role === null) {
      return null;
    }

    return {
      role,
      roomName,
      sessionToken,
      timestamp,
      url: getter("VideoTogetherLiteUrl") || linkWithoutState(currentLocation)
    };
  }

  save(roomName: string, sessionToken: string, role: Role, link: string): void {
    if (role === Role.Null) {
      return;
    }

    sessionStorage.setItem("VideoTogetherLiteUrl", link);
    sessionStorage.setItem("VideoTogetherLiteRoomName", roomName);
    sessionStorage.setItem("VideoTogetherLiteSessionToken", sessionToken);
    sessionStorage.setItem("VideoTogetherLiteRole", String(role));
    sessionStorage.setItem("VideoTogetherLiteTimestamp", String(Date.now() / 1000));
  }
}

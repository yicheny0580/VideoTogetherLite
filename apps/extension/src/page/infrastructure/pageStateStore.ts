import {
  linkWithoutState,
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

    const roomCode = getter("VideoTogetherLiteRoomCode");
    const sessionToken = getter("VideoTogetherLiteSessionToken");
    if (!roomCode || !sessionToken) {
      return null;
    }

    return {
      followUserId: getter("VideoTogetherLiteFollowUserId") ?? "",
      roomCode,
      sessionToken,
      timestamp,
      url: getter("VideoTogetherLiteUrl") || linkWithoutState(currentLocation)
    };
  }

  save(roomCode: string, sessionToken: string, link: string, followUserId = ""): void {
    if (roomCode === "" || sessionToken === "") {
      return;
    }

    sessionStorage.setItem("VideoTogetherLiteUrl", link);
    sessionStorage.setItem("VideoTogetherLiteRoomCode", roomCode);
    sessionStorage.setItem("VideoTogetherLiteSessionToken", sessionToken);
    sessionStorage.setItem("VideoTogetherLiteTimestamp", String(Date.now() / 1000));
    if (followUserId === "") {
      sessionStorage.removeItem("VideoTogetherLiteFollowUserId");
    } else {
      sessionStorage.setItem("VideoTogetherLiteFollowUserId", followUserId);
    }
  }
}

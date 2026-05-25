import {
  linkWithoutState,
  stateKeys,
  type RoomState
} from "@videotogetherlite/shared";

const contentMessageSource = "VideoTogetherLiteContent";
const messageSource = "VideoTogetherLite";
const requestTimeoutMs = 500;

export class PageStateStore {
  private requestId = 0;

  constructor(private readonly maxAgeSeconds: number) {}

  clear(): void {
    for (const key of stateKeys) {
      sessionStorage.removeItem(key);
    }
    window.postMessage({
      source: messageSource,
      type: "room-state.clear"
    }, "*");
  }

  async recover(currentLocation: Location): Promise<RoomState | null> {
    const currentUrl = new URL(currentLocation.toString());
    const currentUrlWithoutState = linkWithoutState(currentLocation);

    const urlState = this.readState((key) => currentUrl.searchParams.get(key), currentUrlWithoutState);
    if (urlState !== null) {
      this.writeSessionState(urlState);
      return urlState;
    }

    const sessionState = this.readState((key) => sessionStorage.getItem(key), currentUrlWithoutState);
    if (sessionState !== null) {
      return sessionState;
    }

    const persistedState = await this.requestPersistedState();
    if (
      persistedState === null
      || persistedState.url !== currentUrlWithoutState
      || persistedState.timestamp + this.maxAgeSeconds < Date.now() / 1000
    ) {
      return null;
    }

    this.writeSessionState(persistedState);
    return persistedState;
  }

  save(roomCode: string, sessionToken: string, link: string, followUserId = "", sharing = false): void {
    if (roomCode === "" || sessionToken === "") {
      return;
    }

    const state: RoomState = {
      followUserId,
      roomCode,
      sessionToken,
      sharing,
      timestamp: Date.now() / 1000,
      url: link
    };
    this.writeSessionState(state);
    window.postMessage({
      data: state,
      source: messageSource,
      type: "room-state.save"
    }, "*");
  }

  private readState(getter: (key: string) => string | null, fallbackUrl: string): RoomState | null {
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
      sharing: getter("VideoTogetherLiteSharing") === "true",
      timestamp,
      url: getter("VideoTogetherLiteUrl") || fallbackUrl
    };
  }

  private requestPersistedState(): Promise<RoomState | null> {
    this.requestId += 1;
    const requestId = `${this.requestId}:${Date.now()}`;
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve(null);
      }, requestTimeoutMs);
      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) {
          return;
        }
        const message = event.data as { data?: unknown; id?: unknown; source?: unknown; type?: unknown };
        if (
          message.source !== contentMessageSource
          || message.type !== "room-state.get.result"
          || message.id !== requestId
        ) {
          return;
        }
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(isRoomState(message.data) ? message.data : null);
      };
      window.addEventListener("message", onMessage);
      window.postMessage({
        id: requestId,
        source: messageSource,
        type: "room-state.get"
      }, "*");
    });
  }

  private writeSessionState(state: RoomState): void {
    sessionStorage.setItem("VideoTogetherLiteUrl", state.url);
    sessionStorage.setItem("VideoTogetherLiteRoomCode", state.roomCode);
    sessionStorage.setItem("VideoTogetherLiteSessionToken", state.sessionToken);
    sessionStorage.setItem("VideoTogetherLiteSharing", String(state.sharing === true));
    sessionStorage.setItem("VideoTogetherLiteTimestamp", String(state.timestamp));
    if (state.followUserId === "") {
      sessionStorage.removeItem("VideoTogetherLiteFollowUserId");
    } else {
      sessionStorage.setItem("VideoTogetherLiteFollowUserId", state.followUserId);
    }
  }
}

function isRoomState(candidate: unknown): candidate is RoomState {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const state = candidate as Partial<RoomState>;
  return typeof state.followUserId === "string"
    && typeof state.roomCode === "string"
    && typeof state.sessionToken === "string"
    && (state.sharing === undefined || typeof state.sharing === "boolean")
    && typeof state.timestamp === "number"
    && typeof state.url === "string";
}

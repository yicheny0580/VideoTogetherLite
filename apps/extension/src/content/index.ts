import type {
  PagePanelResponse,
  PanelCommandResponse,
  PopupPanelRequest
} from "../bridge/panelBridge";

const blockedHosts = new Set(["challenges.cloudflare.com"]);
const contentRequestSource = "VideoTogetherLiteContent";
const contentResponseSource = "VideoTogetherLiteContent";
const languages = ["en-us", "zh-cn"] as const;
const nicknameKey = "VideoTogetherLiteNickname";
const pageResponseSource = "VideoTogetherLitePage";
const panelCommandResultType = "panel.command.result";
const panelCommandType = "panel.command";
const popupRequestSource = "VideoTogetherLitePopup";
const roomStateKey = "VideoTogetherLiteRoomState";
const userIdKey = "VideoTogetherLiteUserId";

type Language = typeof languages[number];

interface StoredRoomState {
  followUserId: string;
  roomCode: string;
  sessionToken: string;
  sharing?: boolean;
  timestamp: number;
  url: string;
}

function getValue<T>(key: string): Promise<T | undefined> {
  return chrome.storage.local.get([key]).then((result) => result[key] as T | undefined);
}

function setValue<T>(key: string, value: T): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

function generateUUID(): string {
  if (crypto.randomUUID !== undefined) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getOrCreateUserId(): Promise<string> {
  const storedUserId = await getValue<string>(userIdKey);
  if (storedUserId) {
    return storedUserId;
  }
  const nextUserId = generateUUID();
  await setValue(userIdKey, nextUserId);
  return nextUserId;
}

function resolveLanguage(candidate: unknown): Language {
  if (typeof candidate !== "string") {
    return "en-us";
  }

  const normalized = candidate.toLowerCase();
  const exact = languages.find((language) => language === normalized);
  if (exact) {
    return exact;
  }

  const prefix = normalized.split("-")[0];
  return languages.find((language) => language.split("-")[0] === prefix) ?? "en-us";
}

function listenForProfileUpdates(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }
    const message = event.data as { data?: { nickname?: unknown }; source?: unknown; type?: unknown };
    if (message?.source !== "VideoTogetherLite" || message.type !== "profile.save") {
      return;
    }
    if (typeof message.data?.nickname === "string") {
      void setValue(nicknameKey, message.data.nickname);
    }
  });
}

function isStoredRoomState(candidate: unknown): candidate is StoredRoomState {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const state = candidate as Partial<StoredRoomState>;
  return typeof state.followUserId === "string"
    && typeof state.roomCode === "string"
    && typeof state.sessionToken === "string"
    && (state.sharing === undefined || typeof state.sharing === "boolean")
    && typeof state.timestamp === "number"
    && typeof state.url === "string";
}

function listenForRoomStateMessages(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }
    const message = event.data as { data?: unknown; id?: unknown; source?: unknown; type?: unknown };
    if (message?.source !== "VideoTogetherLite") {
      return;
    }

    if (message.type === "room-state.get") {
      void getValue<StoredRoomState>(roomStateKey).then((state) => {
        window.postMessage({
          data: isStoredRoomState(state) ? state : null,
          id: message.id,
          source: "VideoTogetherLiteContent",
          type: "room-state.get.result"
        }, "*");
      });
      return;
    }

    if (message.type === "room-state.save" && isStoredRoomState(message.data)) {
      void setValue(roomStateKey, message.data);
      return;
    }

    if (message.type === "room-state.clear") {
      void chrome.storage.local.remove(roomStateKey);
    }
  });
}

function listenForPopupPanelMessages(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isPopupPanelRequest(message)) {
      return false;
    }

    forwardPanelRequest(message).then(sendResponse);
    return true;
  });
}

function forwardPanelRequest(request: PopupPanelRequest): Promise<PanelCommandResponse> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve({
        error: "VideoTogether Lite is not ready on this page",
        id: request.id,
        ok: false,
        source: contentResponseSource
      });
    }, 2_000);

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || !isPagePanelResponse(event.data) || event.data.id !== request.id) {
        return;
      }

      cleanup();
      resolve({
        ...event.data,
        source: contentResponseSource
      });
    };

    function cleanup(): void {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    window.postMessage({
      command: request.command,
      id: request.id,
      source: contentRequestSource,
      type: panelCommandType
    }, "*");
  });
}

function isPopupPanelRequest(candidate: unknown): candidate is PopupPanelRequest {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const message = candidate as Partial<PopupPanelRequest>;
  return message.source === popupRequestSource
    && typeof message.id === "string"
    && typeof message.command === "object"
    && message.command !== null;
}

function isPagePanelResponse(candidate: unknown): candidate is PagePanelResponse {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const message = candidate as Partial<PagePanelResponse>;
  return message.source === pageResponseSource
    && message.type === panelCommandResultType
    && typeof message.id === "string"
    && typeof message.ok === "boolean";
}

function injectPageScript(language: Language, userId: string, nickname: string): void {
  const script = document.createElement("script");
  const source = new URL(chrome.runtime.getURL("page.js"));
  source.searchParams.set("language", language);
  source.searchParams.set("nickname", nickname);
  source.searchParams.set("userId", userId);
  script.src = source.toString();
  script.type = "module";
  (document.body || document.documentElement).appendChild(script);
}

async function main(): Promise<void> {
  if (window.self !== window.top || document instanceof XMLDocument || blockedHosts.has(window.location.hostname)) {
    return;
  }

  const configuredLanguage = await getValue<string>("DisplayLanguage");
  const language = resolveLanguage(configuredLanguage ?? navigator.language);
  const userId = await getOrCreateUserId();
  const nickname = await getValue<string>(nicknameKey) ?? "";
  listenForProfileUpdates();
  listenForPopupPanelMessages();
  listenForRoomStateMessages();
  injectPageScript(language, userId, nickname);
}

void main();

const blockedHosts = new Set(["challenges.cloudflare.com"]);
const languages = ["en-us", "zh-cn"] as const;
const nicknameKey = "VideoTogetherLiteNickname";
const roomStateKey = "VideoTogetherLiteRoomState";
const userIdKey = "VideoTogetherLiteUserId";

type Language = typeof languages[number];

interface StoredRoomState {
  followUserId: string;
  roomCode: string;
  sessionToken: string;
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

function sendEnabledStatus(enabled: boolean): void {
  chrome.runtime.sendMessage({ enabled, type: 4 }).catch(() => undefined);
}

function mountLoadingIndicator(): void {
  if (document.getElementById("videoTogetherLiteLoading")) {
    return;
  }

  const loading = document.createElement("div");
  loading.id = "videoTogetherLiteLoading";
  loading.innerHTML = `
    <div id="videoTogetherLiteLoadingWrap">
      <img src="${chrome.runtime.getURL("icon/videotogether-lite_64x64.png")}" alt="">
      <a target="_blank" href="https://github.com/yicheny0580/VideoTogetherLite#readme">loading ...</a>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #videoTogetherLiteLoading {
      align-items: center;
      background: #ffffff;
      border: 1px solid #c9c8c8;
      border-radius: 5px;
      bottom: 15px;
      box-shadow: 0 3px 6px -4px #0000001f, 0 6px 16px #00000014, 0 9px 28px 8px #0000000d;
      color: #212529;
      display: flex;
      height: 50px;
      position: fixed;
      right: 15px;
      text-align: center;
      touch-action: none;
      width: 250px;
      z-index: 2147483646;
    }
    #videoTogetherLiteLoadingWrap {
      align-items: center;
      display: flex;
      justify-content: center;
      width: 100%;
    }
    #videoTogetherLiteLoadingWrap img {
      height: 16px;
      margin-right: 12px;
      width: 16px;
    }
    #videoTogetherLiteLoadingWrap a {
      color: #212529;
      text-decoration: none;
    }
    #videoTogetherLiteLoadingWrap a:hover {
      color: #1890ff;
      text-decoration: underline;
    }
  `;
  loading.appendChild(style);
  (document.body || document.documentElement).appendChild(loading);
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

  const enabled = await getValue<boolean>("videoTogetherLiteEnabled");
  if (enabled === false) {
    sendEnabledStatus(false);
    return;
  }

  sendEnabledStatus(true);
  const configuredLanguage = await getValue<string>("DisplayLanguage");
  const language = resolveLanguage(configuredLanguage ?? navigator.language);
  const userId = await getOrCreateUserId();
  const nickname = await getValue<string>(nicknameKey) ?? "";
  listenForProfileUpdates();
  listenForRoomStateMessages();
  mountLoadingIndicator();
  injectPageScript(language, userId, nickname);
}

void main();

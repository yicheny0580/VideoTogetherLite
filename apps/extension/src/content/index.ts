const blockedHosts = new Set(["challenges.cloudflare.com"]);
const languages = ["en-us", "zh-cn"] as const;

type Language = typeof languages[number];

function getValue<T>(key: string): Promise<T | undefined> {
  return chrome.storage.local.get([key]).then((result) => result[key] as T | undefined);
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
  if (document.getElementById("videoTogetherLoading")) {
    return;
  }

  const loading = document.createElement("div");
  loading.id = "videoTogetherLoading";
  loading.innerHTML = `
    <div id="videoTogetherLoadingwrap">
      <img src="${chrome.runtime.getURL("icon/vt_64x64.png")}" alt="">
      <a target="_blank" href="http://videotogether.github.io/guide/qa.html">loading ...</a>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #videoTogetherLoading {
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
    #videoTogetherLoadingwrap {
      align-items: center;
      display: flex;
      justify-content: center;
      width: 100%;
    }
    #videoTogetherLoadingwrap img {
      height: 16px;
      margin-right: 12px;
      width: 16px;
    }
    #videoTogetherLoadingwrap a {
      color: #212529;
      text-decoration: none;
    }
    #videoTogetherLoadingwrap a:hover {
      color: #1890ff;
      text-decoration: underline;
    }
  `;
  loading.appendChild(style);
  (document.body || document.documentElement).appendChild(loading);
}

function injectPageScript(language: Language): void {
  const script = document.createElement("script");
  const source = new URL(chrome.runtime.getURL("page.js"));
  source.searchParams.set("language", language);
  script.src = source.toString();
  script.type = "module";
  (document.body || document.documentElement).appendChild(script);
}

async function main(): Promise<void> {
  if (document instanceof XMLDocument || blockedHosts.has(window.location.hostname)) {
    return;
  }

  const enabled = await getValue<boolean>("vtEnabled");
  if (enabled === false) {
    sendEnabledStatus(false);
    return;
  }

  sendEnabledStatus(true);
  const configuredLanguage = await getValue<string>("DisplayLanguage");
  const language = resolveLanguage(configuredLanguage ?? navigator.language);
  mountLoadingIndicator();
  injectPageScript(language);
}

void main();

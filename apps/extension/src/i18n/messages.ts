import { resolveLanguage, type Language } from "@videotogetherlite/shared";

import enUs from "../locales/en-us.json";
import zhCn from "../locales/zh-cn.json";

export type LocaleKey = keyof typeof enUs;
export type LocaleMessages = Record<LocaleKey, string>;

const messages: Record<Language, LocaleMessages> = {
  "en-us": enUs,
  "zh-cn": zhCn
};

export const popupMessages: Record<Language, {
  pageErrorTitle: string;
  pageUnavailable: string;
  pageUnavailableTitle: string;
  readyStatus: string;
}> = {
  "en-us": {
    pageErrorTitle: "Connection issue",
    pageUnavailable: "Open a supported video page to control a room.",
    pageUnavailableTitle: "Page unavailable",
    readyStatus: "Ready"
  },
  "zh-cn": {
    pageErrorTitle: "连接异常",
    pageUnavailable: "打开支持的视频网页后即可控制房间。",
    pageUnavailableTitle: "页面不可用",
    readyStatus: "就绪"
  }
};

export const helpLinks: Record<Language, string> = {
  "en-us": "https://github.com/yicheny0580/VideoTogetherLite#readme",
  "zh-cn": "https://github.com/yicheny0580/VideoTogetherLite/blob/main/README_zh.MD"
};

export function getMessages(language: unknown): LocaleMessages {
  return messages[resolveLanguage(language)];
}

export function translate(language: Language, key: LocaleKey): string {
  return messages[language][key];
}

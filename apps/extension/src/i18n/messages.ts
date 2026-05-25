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
  disabled: string;
  enabled: string;
  refreshAfterChange: string;
}> = {
  "en-us": {
    disabled: "Disabled",
    enabled: "Enabled",
    refreshAfterChange: "Please refresh the page after change"
  },
  "zh-cn": {
    disabled: "停用",
    enabled: "启用",
    refreshAfterChange: "启用或禁用后请刷新网页生效"
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

export const supportedLanguages = ["en-us", "zh-cn"] as const;

export type Language = typeof supportedLanguages[number];

export function resolveLanguage(candidate: unknown): Language {
  if (typeof candidate !== "string") {
    return "en-us";
  }

  const normalized = candidate.toLowerCase();
  const exact = supportedLanguages.find((language) => language === normalized);
  if (exact) {
    return exact;
  }

  const prefix = normalized.split("-")[0];
  return supportedLanguages.find((language) => language.split("-")[0] === prefix) ?? "en-us";
}

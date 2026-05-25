import { resolveLanguage, type Language } from "@videotogether/shared";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { popupMessages } from "../i18n/messages";
import { getValue, setValue } from "./storage";

export function PopupApp(): ReactElement {
  const [enabled, setEnabled] = useState(true);
  const [language, setLanguage] = useState<Language>("en-us");

  useEffect(() => {
    let mounted = true;
    async function loadSettings(): Promise<void> {
      const [storedEnabled, storedLanguage] = await Promise.all([
        getValue<boolean>("vtEnabled"),
        getValue<string>("DisplayLanguage")
      ]);
      if (!mounted) {
        return;
      }
      setEnabled(storedEnabled !== false);
      setLanguage(resolveLanguage(storedLanguage ?? navigator.language));
    }

    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const strings = popupMessages[language] ?? popupMessages["en-us"]!;
  const updateEnabled = async (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    await setValue("vtEnabled", nextEnabled);
  };

  return (
    <main className="w-[220px] bg-white p-4 text-neutral-950">
      <p className="mb-4 text-center text-sm leading-5">
        {strings.refreshAfterChange}
      </p>
      <div className="flex items-center justify-center gap-6">
        <span className="min-w-16 text-center text-sm">
          {enabled ? strings.enabled : strings.disabled}
        </span>
        <label className="relative inline-flex h-[34px] w-[60px] items-center">
          <input
            checked={enabled}
            className="peer sr-only"
            id="extensionSwitch"
            onChange={(event) => void updateEnabled(event.target.checked)}
            type="checkbox"
          />
          <span className="absolute inset-0 cursor-pointer rounded-full bg-neutral-300 transition peer-checked:bg-sky-500" />
          <span className="absolute left-1 h-[26px] w-[26px] rounded-full bg-white transition peer-checked:translate-x-[26px]" />
        </label>
      </div>
    </main>
  );
}

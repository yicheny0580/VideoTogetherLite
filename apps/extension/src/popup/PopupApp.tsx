import { resolveLanguage, type Language } from "@videotogetherlite/shared";
import { useEffect, useState, type ReactElement } from "react";

import type { PanelCommand } from "../bridge/panelBridge";
import { getMessages, popupMessages } from "../i18n/messages";
import type { PanelState } from "../page/app/panelState";
import { sendPanelCommand } from "./activeTabBridge";
import { RoomPanel } from "./RoomPanel";
import { getValue, setValue } from "./storage";

export function PopupApp(): ReactElement {
  const [enabled, setEnabled] = useState(true);
  const [language, setLanguage] = useState<Language>("en-us");
  const [panelState, setPanelState] = useState<PanelState | null>(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadSettings(): Promise<void> {
      const [storedEnabled, storedLanguage] = await Promise.all([
        getValue<boolean>("videoTogetherLiteEnabled"),
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

  useEffect(() => {
    if (!enabled) {
      setPanelState(null);
      setPageError("");
      return;
    }

    let mounted = true;
    const refresh = async () => {
      const response = await sendPanelCommand({ type: "state.get" });
      if (!mounted) {
        return;
      }
      if (response.ok) {
        setPanelState(response.state);
        setPageError("");
      } else {
        setPageError(response.error);
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const strings = popupMessages[language] ?? popupMessages["en-us"]!;
  const messages = getMessages(language);

  const updateEnabled = async (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    await setValue("videoTogetherLiteEnabled", nextEnabled);
  };

  const runCommand = async (command: PanelCommand) => {
    const response = await sendPanelCommand(command);
    if (response.ok) {
      setPanelState(response.state);
      setPageError("");
      return;
    }
    if (response.state) {
      setPanelState(response.state);
    }
    setPageError(response.error);
  };

  return (
    <main className="w-[360px] bg-white text-neutral-950">
      <header className="border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
              <img
                alt=""
                className="h-6 w-6"
                draggable={false}
                src="/icon/videotogether-lite_64x64.png"
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">VideoTogether Lite</div>
              <div
                className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                  enabled
                    ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25"
                    : "bg-white/10 text-neutral-300 ring-white/15"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    enabled ? "bg-emerald-300" : "bg-neutral-500"
                  }`}
                />
                <span className="truncate">{enabled ? strings.enabled : strings.disabled}</span>
              </div>
            </div>
          </div>
          <label
            aria-label={enabled ? strings.enabled : strings.disabled}
            className="relative inline-flex h-8 w-[58px] shrink-0 items-center"
          >
            <input
              checked={enabled}
              className="peer sr-only"
              id="videoTogetherLiteExtensionSwitch"
              onChange={(event) => void updateEnabled(event.target.checked)}
              type="checkbox"
            />
            <span className="absolute inset-0 cursor-pointer rounded-full border border-white/10 bg-white/15 shadow-inner transition peer-checked:border-emerald-300/40 peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-300" />
            <span className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-lg shadow-black/25 transition peer-checked:translate-x-[26px]">
              <span
                className={`h-2 w-2 rounded-full transition ${
                  enabled ? "bg-emerald-500" : "bg-neutral-400"
                }`}
              />
            </span>
          </label>
        </div>
      </header>

      {!enabled ? (
        <p className="p-4 text-center text-sm leading-5 text-neutral-600">
          {strings.refreshAfterChange}
        </p>
      ) : panelState ? (
        <RoomPanel
          language={language}
          messages={messages}
          onCancelVideoPicker={() => void runCommand({ type: "cancelVideoPicker" })}
          onClearFocusedVideo={() => void runCommand({ type: "clearFocusedVideo" })}
          onCreate={(nickname) => void runCommand({ nickname, type: "create" })}
          onExit={() => void runCommand({ type: "exit" })}
          onFollow={(userId) => void runCommand({ type: "follow", userId })}
          onJoin={(inviteCode, nickname) => void runCommand({ inviteCode, nickname, type: "join" })}
          onNicknameChange={(nickname) => void runCommand({ nickname, type: "setNickname" })}
          onPickVideo={() => void runCommand({ type: "startVideoPicker" })}
          onStopFollow={() => void runCommand({ type: "stopFollow" })}
          state={panelState}
        />
      ) : (
        <div className="grid gap-2 p-4 text-sm leading-5 text-neutral-600">
          <p>{strings.pageUnavailable}</p>
          {pageError ? <p className="text-xs text-rose-600">{pageError}</p> : null}
        </div>
      )}
    </main>
  );
}

import { resolveLanguage, type Language } from "@videotogetherlite/shared";
import { Info, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import type { PanelCommand } from "../bridge/panelBridge";
import { getMessages, popupMessages } from "../i18n/messages";
import type { PanelState } from "../page/app/panelState";
import { sendPanelCommand } from "./activeTabBridge";
import { RoomPanel } from "./RoomPanel";
import { getValue } from "./storage";

export function PopupApp(): ReactElement {
  const [language, setLanguage] = useState<Language>("en-us");
  const [panelState, setPanelState] = useState<PanelState | null>(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadSettings(): Promise<void> {
      const storedLanguage = await getValue<string>("DisplayLanguage");
      if (!mounted) {
        return;
      }
      setLanguage(resolveLanguage(storedLanguage ?? navigator.language));
    }

    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
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
  }, []);

  const strings = popupMessages[language] ?? popupMessages["en-us"]!;
  const messages = getMessages(language);

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
    <main className="vtl-popup" id="videoTogetherLitePopup">
      <header className="vtl-header">
        <div className="flex min-w-0 items-center gap-3">
          <div className="vtl-app-icon">
            <img
              alt=""
              className="h-6 w-6"
              draggable={false}
              src="/icon/videotogether-lite_64x64.png"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-neutral-950">VideoTogether Lite</h1>
            <p className="truncate text-xs text-neutral-500">
              {panelState?.inRoom ? panelState.roomCode : strings.readyStatus}
            </p>
          </div>
        </div>
      </header>

      {panelState ? (
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
          pageError={pageError}
          pageErrorTitle={strings.pageErrorTitle}
          state={panelState}
        />
      ) : (
        <div className="vtl-body">
          <div className="vtl-alert vtl-alert-warning">
            <Info aria-hidden="true" className="vtl-alert-icon" />
            <div className="min-w-0">
              <div className="font-semibold">{strings.pageUnavailableTitle}</div>
              <p className="mt-0.5 text-xs leading-5">{strings.pageUnavailable}</p>
            </div>
          </div>
          {pageError ? (
            <div className="vtl-alert vtl-alert-danger" role="alert">
              <TriangleAlert aria-hidden="true" className="vtl-alert-icon" />
              <div className="min-w-0">
                <div className="font-semibold">{strings.pageErrorTitle}</div>
                <p className="mt-0.5 break-words text-xs leading-5">{pageError}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

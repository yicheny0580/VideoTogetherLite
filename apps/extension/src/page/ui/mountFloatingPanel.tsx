import { resolveLanguage, type Language } from "@videotogetherlite/shared";
import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import type { ReactElement } from "react";

import { getMessages } from "../../i18n/messages";
import type { VideoTogetherLiteController } from "../app/VideoTogetherLiteController";
import { FloatingPanel } from "./FloatingPanel";
import styles from "../../styles/injected.css?inline";

interface PanelRootProps {
  controller: VideoTogetherLiteController;
  iconUrl: string;
  language: Language;
}

function PanelRoot({ controller, iconUrl, language }: PanelRootProps): ReactElement {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getPanelState,
    controller.getPanelState
  );

  return (
    <FloatingPanel
      iconUrl={iconUrl}
      language={language}
      messages={getMessages(language)}
      onCancelVideoPicker={() => controller.cancelVideoPicker()}
      onClearFocusedVideo={() => controller.clearFocusedVideo()}
      onCreate={(nickname) => controller.createRoom(nickname)}
      onExit={() => controller.exitRoom()}
      onFollow={(userId) => controller.followParticipant(userId)}
      onJoin={(inviteCode, nickname) => controller.joinRoom(inviteCode, nickname)}
      onNicknameChange={(nickname) => controller.setNickname(nickname)}
      onPickVideo={() => controller.startVideoPicker()}
      onSetSharing={(sharing) => controller.setSharing(sharing)}
      state={state}
    />
  );
}

export function mountFloatingPanel(controller: VideoTogetherLiteController, language: unknown): void {
  if (window.self !== window.top || document.getElementById("VideoTogetherLiteWrapper")) {
    return;
  }

  const normalizedLanguage = resolveLanguage(language);
  const shadowWrapper = document.createElement("div");
  shadowWrapper.id = "VideoTogetherLiteWrapper";
  shadowWrapper.ontouchstart = (event) => event.stopPropagation();

  const shadowRoot = shadowWrapper.attachShadow({ mode: "open" });
  shadowRoot.addEventListener("keydown", (event) => event.stopPropagation());

  const style = document.createElement("style");
  style.textContent = styles;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);
  (document.body || document.documentElement).appendChild(shadowWrapper);

  const iconUrl = new URL(/* @vite-ignore */ "icon/videotogether-lite_64x64.png", import.meta.url).toString();
  createRoot(mountPoint).render(
    <PanelRoot controller={controller} iconUrl={iconUrl} language={normalizedLanguage} />
  );
  document.querySelector("#videoTogetherLiteLoading")?.remove();
}

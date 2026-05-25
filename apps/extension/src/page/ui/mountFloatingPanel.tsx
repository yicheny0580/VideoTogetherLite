import { resolveLanguage, type Language } from "@videotogether/shared";
import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import type { ReactElement } from "react";

import { getMessages } from "../../i18n/messages";
import type { VideoTogetherController } from "../app/VideoTogetherController";
import { FloatingPanel } from "./FloatingPanel";
import styles from "../../styles/injected.css?inline";

interface PanelRootProps {
  controller: VideoTogetherController;
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
      onCreate={(name, password) => controller.createRoom(name, password)}
      onExit={() => controller.exitRoom()}
      onJoin={(name, password) => controller.joinRoom(name, password)}
      state={state}
    />
  );
}

export function mountFloatingPanel(controller: VideoTogetherController, language: unknown): void {
  if (window.self !== window.top || document.getElementById("VideoTogetherWrapper")) {
    return;
  }

  const normalizedLanguage = resolveLanguage(language);
  const shadowWrapper = document.createElement("div");
  shadowWrapper.id = "VideoTogetherWrapper";
  shadowWrapper.ontouchstart = (event) => event.stopPropagation();

  const shadowRoot = shadowWrapper.attachShadow({ mode: "open" });
  shadowRoot.addEventListener("keydown", (event) => event.stopPropagation());

  const style = document.createElement("style");
  style.textContent = styles;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);
  (document.body || document.documentElement).appendChild(shadowWrapper);

  const iconUrl = new URL(/* @vite-ignore */ "icon/vt_64x64.png", import.meta.url).toString();
  createRoot(mountPoint).render(
    <PanelRoot controller={controller} iconUrl={iconUrl} language={normalizedLanguage} />
  );
  document.querySelector("#videoTogetherLoading")?.remove();
}

import { resolveLanguage } from "@videotogetherlite/shared";

import { VideoTogetherLiteController } from "./app/VideoTogetherLiteController";
import { listenForPopupPanelCommands } from "./app/popupCommandBridge";

function getParamFromScriptUrl(name: string): string {
  try {
    return new URL(import.meta.url).searchParams.get(name) ?? "";
  } catch {
    return "";
  }
}

if (!window.VideoTogetherLiteLoading) {
  window.VideoTogetherLiteLoading = true;

  try {
    if (window.videoTogetherLiteExtension === undefined) {
      const language = resolveLanguage(getParamFromScriptUrl("language") || navigator.language);
      const controller = new VideoTogetherLiteController(
        language,
        getParamFromScriptUrl("userId"),
        getParamFromScriptUrl("nickname")
      );
      window.videoTogetherLiteExtension = controller;
      listenForPopupPanelCommands(controller);
      controller.start();
    }
  } catch (error) {
    console.error(error);
  }
}

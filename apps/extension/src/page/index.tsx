import { resolveLanguage } from "@videotogether/shared";

import { VideoTogetherController } from "./app/VideoTogetherController";
import { mountFloatingPanel } from "./ui/mountFloatingPanel";

function postMessageToSelf(type: number, data: unknown): void {
  window.postMessage({
    data,
    source: "VideoTogether",
    type
  }, "*");
}

function getLanguageFromScriptUrl(): string | null {
  try {
    return new URL(import.meta.url).searchParams.get("language");
  } catch {
    return null;
  }
}

if (!window.VideoTogetherLoading) {
  window.VideoTogetherLoading = true;

  try {
    if (window.videoTogetherExtension === undefined) {
      const language = resolveLanguage(getLanguageFromScriptUrl() ?? navigator.language);
      const controller = new VideoTogetherController(language);
      window.videoTogetherExtension = controller;
      mountFloatingPanel(controller, language);
      controller.start();
      postMessageToSelf(17, {});
    }
  } catch (error) {
    console.error(error);
  }
}

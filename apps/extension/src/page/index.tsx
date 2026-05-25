import { resolveLanguage } from "@videotogetherlite/shared";

import { VideoTogetherLiteController } from "./app/VideoTogetherLiteController";
import { mountFloatingPanel } from "./ui/mountFloatingPanel";

function postMessageToSelf(type: number, data: unknown): void {
  window.postMessage({
    data,
    source: "VideoTogetherLite",
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

if (!window.VideoTogetherLiteLoading) {
  window.VideoTogetherLiteLoading = true;

  try {
    if (window.videoTogetherLiteExtension === undefined) {
      const language = resolveLanguage(getLanguageFromScriptUrl() ?? navigator.language);
      const controller = new VideoTogetherLiteController(language);
      window.videoTogetherLiteExtension = controller;
      mountFloatingPanel(controller, language);
      controller.start();
      postMessageToSelf(17, {});
    }
  } catch (error) {
    console.error(error);
  }
}

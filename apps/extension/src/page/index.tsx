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
      mountFloatingPanel(controller, language);
      controller.start();
      postMessageToSelf(17, {});
    }
  } catch (error) {
    console.error(error);
  }
}

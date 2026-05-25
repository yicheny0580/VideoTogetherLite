import {
  contentRequestSource,
  pageResponseSource,
  panelCommandResultType,
  panelCommandType,
  type PagePanelRequest,
  type PagePanelResponse,
  type PanelCommand
} from "../../bridge/panelBridge";
import type { VideoTogetherLiteController } from "./VideoTogetherLiteController";

export function listenForPopupPanelCommands(controller: VideoTogetherLiteController): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isPagePanelRequest(event.data)) {
      return;
    }

    void handlePanelRequest(controller, event.data);
  });
}

async function handlePanelRequest(
  controller: VideoTogetherLiteController,
  request: PagePanelRequest
): Promise<void> {
  try {
    await executeCommand(controller, request.command);
    postResponse({
      id: request.id,
      ok: true,
      source: pageResponseSource,
      state: controller.getPanelState(),
      type: panelCommandResultType
    });
  } catch (error) {
    postResponse({
      error: error instanceof Error ? error.message : String(error),
      id: request.id,
      ok: false,
      source: pageResponseSource,
      state: controller.getPanelState(),
      type: panelCommandResultType
    });
  }
}

async function executeCommand(
  controller: VideoTogetherLiteController,
  command: PanelCommand
): Promise<void> {
  switch (command.type) {
    case "cancelVideoPicker":
      controller.cancelVideoPicker();
      return;
    case "clearFocusedVideo":
      controller.clearFocusedVideo();
      return;
    case "create":
      await controller.createRoom(command.nickname);
      return;
    case "exit":
      controller.exitRoom();
      return;
    case "follow":
      await controller.followParticipant(command.userId);
      return;
    case "join":
      await controller.joinRoom(command.inviteCode, command.nickname);
      return;
    case "setNickname":
      controller.setNickname(command.nickname);
      return;
    case "startVideoPicker":
      controller.startVideoPicker();
      return;
    case "state.get":
      return;
    case "stopFollow":
      controller.stopFollowing();
      return;
  }
}

function isPagePanelRequest(candidate: unknown): candidate is PagePanelRequest {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const message = candidate as Partial<PagePanelRequest>;
  return message.source === contentRequestSource
    && message.type === panelCommandType
    && typeof message.id === "string"
    && typeof message.command === "object"
    && message.command !== null
    && typeof (message.command as Partial<PanelCommand>).type === "string";
}

function postResponse(response: PagePanelResponse): void {
  window.postMessage(response, "*");
}

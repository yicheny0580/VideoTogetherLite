import type { PanelState } from "../page/app/panelState";

export const popupRequestSource = "VideoTogetherLitePopup";
export const contentRequestSource = "VideoTogetherLiteContent";
export const contentResponseSource = "VideoTogetherLiteContent";
export const pageResponseSource = "VideoTogetherLitePage";
export const panelCommandType = "panel.command";
export const panelCommandResultType = "panel.command.result";

export type PanelCommand =
  | { type: "cancelVideoPicker" }
  | { type: "clearFocusedVideo" }
  | { nickname: string; type: "create" }
  | { type: "exit" }
  | { type: "follow"; userId: string }
  | { inviteCode: string; nickname: string; type: "join" }
  | { nickname: string; type: "setNickname" }
  | { type: "startVideoPicker" }
  | { type: "state.get" }
  | { type: "stopFollow" };

export interface PopupPanelRequest {
  command: PanelCommand;
  id: string;
  source: typeof popupRequestSource;
}

export type PanelCommandResponse =
  | {
    id: string;
    ok: true;
    source: typeof contentResponseSource | typeof pageResponseSource;
    state: PanelState;
  }
  | {
    error: string;
    id: string;
    ok: false;
    source: typeof contentResponseSource | typeof pageResponseSource;
    state?: PanelState;
  };

export interface PagePanelRequest {
  command: PanelCommand;
  id: string;
  source: typeof contentRequestSource;
  type: typeof panelCommandType;
}

export type PagePanelResponse = PanelCommandResponse & {
  type: typeof panelCommandResultType;
};

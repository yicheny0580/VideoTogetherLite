import {
  contentResponseSource,
  popupRequestSource,
  type PanelCommand,
  type PanelCommandResponse,
  type PopupPanelRequest
} from "../bridge/panelBridge";

export async function sendPanelCommand(command: PanelCommand): Promise<PanelCommandResponse> {
  const tab = await getTargetTab();
  if (tab?.id === undefined) {
    return unavailableResponse("No active web page found");
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, createRequest(command));
    return isPanelCommandResponse(response)
      ? response
      : unavailableResponse("VideoTogether Lite is not available on this page");
  } catch (error) {
    return unavailableResponse(error instanceof Error ? error.message : String(error));
  }
}

async function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  const currentTab = await chrome.tabs.getCurrent().catch(() => undefined);
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = activeTabs.find((tab) => tab.id !== undefined && tab.id !== currentTab?.id);
  if (activeTab) {
    return activeTab;
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const candidates = tabs.filter((tab) => tab.id !== undefined && tab.id !== currentTab?.id);
  candidates.sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0));
  return candidates[0] ?? null;
}

function createRequest(command: PanelCommand): PopupPanelRequest {
  return {
    command,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source: popupRequestSource
  };
}

function unavailableResponse(error: string): PanelCommandResponse {
  return {
    error,
    id: "",
    ok: false,
    source: contentResponseSource
  };
}

function isPanelCommandResponse(candidate: unknown): candidate is PanelCommandResponse {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const response = candidate as Partial<PanelCommandResponse>;
  return response.source === contentResponseSource
    && typeof response.id === "string"
    && typeof response.ok === "boolean";
}

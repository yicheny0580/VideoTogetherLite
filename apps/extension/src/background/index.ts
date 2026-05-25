type ContentStatusMessage = {
  enabled?: boolean;
  type?: number;
};

function parseMessage(message: unknown): ContentStatusMessage | null {
  if (typeof message === "string") {
    try {
      return JSON.parse(message) as ContentStatusMessage;
    } catch {
      return null;
    }
  }

  if (typeof message === "object" && message !== null) {
    return message as ContentStatusMessage;
  }

  return null;
}

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  const message = parseMessage(rawMessage);
  if (message?.type !== 4 || !sender.tab?.id) {
    sendResponse();
    return;
  }

  chrome.action.setIcon({
    path: message.enabled ? "/icon/videotogether-lite_64x64.png" : "/icon/videotogether-lite-gray_64x64.png",
    tabId: sender.tab.id
  });
  sendResponse();
});

function getBrowser() {
    return chrome;
}

getBrowser().runtime.onMessage.addListener(function (msgText, sender, sendResponse) {
    const msg = JSON.parse(msgText);
    switch (msg.type) {
        case 4:
            if (!sender.tab) {
                sendResponse();
                break;
            }
            getBrowser().action.setIcon({
                path: msg.enabled ? "/icon/vt_64x64.png" : "/icon/vt_gray_64x64.png",
                tabId: sender.tab.id
            });
            sendResponse();
            break;
    }
});

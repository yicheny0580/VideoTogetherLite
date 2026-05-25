(async function () {
    if (document instanceof XMLDocument) {
        return;
    }
    if (['challenges.cloudflare.com'].indexOf(window.location.hostname) != -1) {
        return;
    }

    function getBrowser() {
        return chrome;
    }

    function getValue(key) {
        return new Promise((resolve, reject) => {
            try {
                getBrowser().storage.local.get([key], result => resolve(result[key]));
            } catch (e) {
                reject(e);
            }
        });
    }

    function sendMessage(message) {
        try {
            getBrowser().runtime.sendMessage(JSON.stringify(message));
        } catch { }
    }

    const enabled = await getValue('vtEnabled');
    if (enabled === false) {
        sendMessage({ type: 4, enabled: false });
        return;
    }
    sendMessage({ type: 4, enabled: true });

    const languages = ['en-us', 'zh-cn'];
    let language = 'en-us';
    let settingLanguage = await getValue("DisplayLanguage");
    if (typeof settingLanguage != 'string') {
        settingLanguage = navigator.language;
    }
    if (typeof settingLanguage == 'string') {
        settingLanguage = settingLanguage.toLowerCase();
        if (languages.includes(settingLanguage)) {
            language = settingLanguage;
        } else {
            const prefix = settingLanguage.split('-')[0];
            const matched = languages.find(lan => lan.split('-')[0] == prefix);
            if (matched) {
                language = matched;
            }
        }
    }

    try {
        const loading = document.createElement("div");
        loading.innerHTML = `{{{ {"": "./html/loading.html", "order":1} }}}`;
        (document.body || document.documentElement).appendChild(loading);
    } catch { }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = getBrowser().runtime.getURL(`vt.${language}.user.js`);
    (document.body || document.documentElement).appendChild(script);
})();

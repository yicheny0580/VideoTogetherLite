(async function () {
    const storage = {
        setValue: async (key, value) => {
            await chrome.storage.local.set({ [key]: value });
        },
        getValue: async (key) => {
            const result = await chrome.storage.local.get([key]);
            return result[key];
        }
    };

    const strings = {
        'zh-cn': {
            'enabled': "启用",
            'disabled': "停用",
            'refreshAfterChange': "启用或禁用后请刷新网页生效"
        },
        'en-us': {
            'enabled': "Enabled",
            'disabled': "Disabled",
            'refreshAfterChange': "Please refresh the page after change"
        }
    }

    let languages = ['en-us', 'zh-cn'];
    let language = 'en-us';
    let prefixLen = 0;
    let settingLanguage = undefined;
    try {
        settingLanguage = await storage.getValue("DisplayLanguage");
    } catch (e) { };

    if (typeof settingLanguage != 'string') {
        settingLanguage = navigator.language;
    }
    if (typeof settingLanguage == 'string') {
        settingLanguage = settingLanguage.toLowerCase();
        for (let i = 0; i < languages.length; i++) {
            for (let j = 0; j < languages[i].length && j < settingLanguage.length; j++) {
                if (languages[i][j] != settingLanguage[j]) {
                    break;
                }
                if (j > prefixLen) {
                    prefixLen = j;
                    language = languages[i];
                }
            }
        }
    }


    let updateText = () => {
        let checked = document.querySelector("#extensionSwitch").checked;
        document.querySelector("#status").textContent = strings[language][checked ? 'enabled' : 'disabled'];
        document.querySelector("#refreshAfterChange").textContent = strings[language]['refreshAfterChange'];
    }
    document.querySelector("#extensionSwitch").oninput = async (e) => {
        await storage.setValue('vtEnabled', e.target.checked);
        updateText();
    }

    document.querySelector("#extensionSwitch").checked = !(await storage.getValue('vtEnabled') === false);
    updateText();
})();

// ==UserScript==
// @name         Video Together Lite
// @namespace    https://2gether.video/
// @version      {{timestamp}}
// @description  Watch video together
// @author       maggch@outlook.com
// @match        *://*/*
// @icon         https://2gether.video/icon/favicon-32x32.png
// @grant        none
// ==/UserScript==

(function () {
    if (window.VideoTogetherLoading) {
        return;
    }
    window.VideoTogetherLoading = true;

    const language = '{$language$}';
    const releaseHost = '{{{ {"":"./config/release_host","debug":"./config/debug_host","order":0} }}}';
    const stateMaxAgeSeconds = 60;
    const videoExpiredSeconds = 10;

    const RoleEnum = {
        Null: 1,
        Master: 2,
        Member: 3,
    };

    function generateUUID() {
        if (crypto.randomUUID != undefined) {
            return crypto.randomUUID();
        }
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    function generateTempUserId() {
        return generateUUID() + ":" + Date.now() / 1000;
    }

    function isVideoLoaded(video) {
        try {
            if (isNaN(video.readyState)) {
                return true;
            }
            return video.readyState >= 3;
        } catch {
            return true;
        }
    }

    function updateInnerHTML(e, html) {
        if (!e) {
            return;
        }
        try {
            e.innerHTML = html;
        } catch {
            e.textContent = html;
        }
    }

    function postMessageToSelf(type, data) {
        window.postMessage({
            source: "VideoTogether",
            type: type,
            data: data
        }, "*");
    }

    function toWsUrl(httpUrl) {
        const url = new URL(httpUrl);
        url.protocol = url.protocol == "http:" ? "ws:" : "wss:";
        url.pathname = "/ws";
        url.search = `?language=${language}`;
        return url.toString();
    }

    function roomResponseToRoom(data) {
        return data && data.data ? data.data : data;
    }

    class FloatingPanel {
        constructor(extension) {
            this.extension = extension;
            this.isMain = window.self == window.top;
            if (!this.isMain) {
                return;
            }

            const shadowWrapper = document.createElement("div");
            shadowWrapper.id = "VideoTogetherWrapper";
            shadowWrapper.ontouchstart = (e) => e.stopPropagation();
            const wrapper = shadowWrapper.attachShadow({ mode: "open" });
            wrapper.addEventListener('keydown', (e) => e.stopPropagation());
            updateInnerHTML(wrapper, `{{{ {"": "./html/pannel.html","order":100} }}}`);
            (document.body || document.documentElement).appendChild(shadowWrapper);

            this.shadowWrapper = shadowWrapper;
            this.wrapper = wrapper;
            this.panel = wrapper.getElementById("videoTogetherFlyPannel");
            this.smallIcon = wrapper.getElementById("videoTogetherSamllIcon");
            this.header = wrapper.querySelector("#videoTogetherHeader");
            this.minimizeButton = wrapper.querySelector("#videoTogetherMinimize");
            this.maximizeButton = wrapper.querySelector("#videoTogetherMaximize");
            this.createButton = wrapper.querySelector('#videoTogetherCreateButton');
            this.joinButton = wrapper.querySelector("#videoTogetherJoinButton");
            this.exitButton = wrapper.querySelector("#videoTogetherExitButton");
            this.helpButton = wrapper.querySelector("#videoTogetherHelpButton");
            this.lobbyButtons = wrapper.querySelector("#lobbyBtnGroup");
            this.roomButtons = wrapper.querySelector('#roomButtonGroup');
            this.roleText = wrapper.querySelector("#videoTogetherRoleText");
            this.memberCount = wrapper.querySelector("#memberCount");
            this.statusText = wrapper.querySelector("#videoTogetherStatusText");
            this.inputRoomName = wrapper.querySelector('#videoTogetherRoomNameInput');
            this.inputRoomPassword = wrapper.querySelector("#videoTogetherRoomPdIpt");
            this.inputRoomPasswordLabel = wrapper.querySelector("#videoTogetherRoomPasswordLabel");

            this.minimized = false;
            this.minimizeButton.onclick = () => this.minimize();
            this.maximizeButton.onclick = () => this.maximize();
            this.createButton.onclick = () => this.extension.createRoom(this.inputRoomName.value, this.inputRoomPassword.value);
            this.joinButton.onclick = () => this.extension.joinRoom(this.inputRoomName.value, this.inputRoomPassword.value);
            this.exitButton.onclick = () => this.extension.exitRoom();
            this.helpButton.onclick = () => window.open(language == 'zh-cn'
                ? 'https://www.bilibili.com/opus/956528691876200471'
                : 'https://videotogether.github.io/guide/qa.html', '_blank');

            this.enableDrag();
            this.restoreSize();
            this.inLobby(true);

            try {
                document.querySelector("#videoTogetherLoading").remove();
            } catch { }
        }

        select(query) {
            return this.wrapper.querySelector(query);
        }

        show(e) {
            if (e) {
                e.style.display = null;
            }
        }

        hide(e) {
            if (e) {
                e.style.display = "none";
            }
        }

        setRole(role) {
            switch (role) {
                case RoleEnum.Master:
                    updateInnerHTML(this.roleText, "{$host_role$}");
                    break;
                case RoleEnum.Member:
                    updateInnerHTML(this.roleText, "{$memeber_role$}");
                    break;
                default:
                    updateInnerHTML(this.roleText, "");
                    break;
            }
        }

        updateMemberCount(count) {
            updateInnerHTML(this.memberCount, count > 0 ? String.fromCodePoint("0x1f465") + " " + count : "");
        }

        updateStatus(text, color) {
            updateInnerHTML(this.statusText, text);
            this.statusText.style.color = color || "black";
        }

        inRoom() {
            this.maximize();
            this.inputRoomName.disabled = true;
            this.hide(this.lobbyButtons);
            this.show(this.roomButtons);
            this.hide(this.inputRoomPasswordLabel);
            this.hide(this.inputRoomPassword);
        }

        inLobby(init = false) {
            if (!init) {
                this.maximize();
            }
            this.inputRoomName.disabled = false;
            this.inputRoomName.value = "";
            this.inputRoomPassword.value = "";
            this.show(this.lobbyButtons);
            this.hide(this.roomButtons);
            this.show(this.inputRoomPasswordLabel);
            this.show(this.inputRoomPassword);
            this.setRole(RoleEnum.Null);
            this.updateMemberCount(0);
        }

        saveIsMinimized(minimized) {
            localStorage.setItem("VideoTogetherMinimizedHere", minimized ? 1 : 0);
        }

        restoreSize() {
            if (localStorage.getItem("VideoTogetherMinimizedHere") == 1) {
                this.minimize(true);
            } else {
                this.maximize(true);
            }
        }

        minimize(isDefault = false) {
            this.minimized = true;
            if (!isDefault) {
                this.saveIsMinimized(true);
            }
            this.hide(this.panel);
            this.show(this.smallIcon);
        }

        maximize(isDefault = false) {
            this.minimized = false;
            if (!isDefault) {
                this.saveIsMinimized(false);
            }
            this.show(this.panel);
            this.hide(this.smallIcon);
        }

        enableDrag() {
            const header = this.header;
            const panel = this.panel;
            const startDrag = (e) => {
                e.preventDefault();
                panel.videoTogetherMoving = true;
                const point = e.clientX ? e : e.touches[0];
                panel.oldX = point.clientX;
                panel.oldY = point.clientY;
                panel.oldLeft = Number(window.getComputedStyle(panel).getPropertyValue('left').replace('px', ''));
                panel.oldTop = Number(window.getComputedStyle(panel).getPropertyValue('top').replace('px', ''));
                if (Number.isNaN(panel.oldLeft)) {
                    panel.oldLeft = document.documentElement.clientWidth - panel.clientWidth - 15;
                }
                if (Number.isNaN(panel.oldTop)) {
                    panel.oldTop = document.documentElement.clientHeight - panel.clientHeight - 15;
                }
            };
            const drag = (e) => {
                if (!panel.videoTogetherMoving) {
                    return;
                }
                const point = e.clientX ? e : e.touches[0];
                const left = panel.oldLeft + point.clientX - panel.oldX;
                const top = panel.oldTop + point.clientY - panel.oldY;
                panel.style.left = Math.min(document.documentElement.clientWidth - panel.clientWidth, Math.max(0, left)) + "px";
                panel.style.top = Math.min(document.documentElement.clientHeight - panel.clientHeight, Math.max(0, top)) + "px";
                panel.style.right = "auto";
                panel.style.bottom = "auto";
            };
            const endDrag = () => {
                panel.videoTogetherMoving = false;
            };
            header.onmousedown = startDrag;
            header.ontouchstart = startDrag;
            document.addEventListener("mousemove", drag);
            document.addEventListener("touchmove", drag);
            document.addEventListener("mouseup", endDrag);
            document.addEventListener("touchend", endDrag);
        }
    }

    const WS = {
        socket: null,
        lastConnectTime: 0,
        connectTimeout: 10,
        expiredTime: 5,
        lastUpdateTime: 0,
        lastErrorMessage: null,
        lastRoom: null,
        connectedToService: false,
        joinedName: null,

        isOpen() {
            return this.socket != null && this.socket.readyState === WebSocket.OPEN && this.connectedToService;
        },

        connect() {
            if (this.socket != null) {
                if (this.socket.readyState === WebSocket.OPEN) {
                    return;
                }
                if (this.socket.readyState === WebSocket.CONNECTING && this.lastConnectTime + this.connectTimeout > Date.now() / 1000) {
                    return;
                }
            }
            this.lastConnectTime = Date.now() / 1000;
            this.connectedToService = false;
            try {
                this.disconnect();
                this.socket = new WebSocket(toWsUrl(extension.videoTogetherHost));
                this.socket.onmessage = async e => {
                    const lines = e.data.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].trim() != "") {
                            this.onmessage(lines[i]);
                        }
                    }
                };
            } catch { }
        },

        onmessage(str) {
            const data = JSON.parse(str);
            if (data.errorMessage != null) {
                this.lastUpdateTime = Date.now() / 1000;
                this.lastErrorMessage = data.errorMessage;
                this.lastRoom = null;
                return;
            }
            this.lastErrorMessage = null;
            if (data.method == "/room/join") {
                this.joinedName = data.data.name;
            }
            if (data.method == "/room/join" || data.method == "/room/update" || data.method == "/room/update_member") {
                this.connectedToService = true;
                this.lastRoom = roomResponseToRoom(data.data);
                this.lastUpdateTime = Date.now() / 1000;
                extension.applyRoomInfo(this.lastRoom);
                extension.scheduledTask();
            }
            if (data.method == "replay_timestamp") {
                const ts = Date.now() / 1000;
                const replay = data.data;
                extension.updateTimestampIfNeeded(
                    replay.receiveServerTimestamp,
                    replay.sendLocalTimestamp,
                    ts - replay.sendServerTimestamp + replay.receiveServerTimestamp
                );
            }
        },

        getRoom() {
            if (this.lastUpdateTime + this.expiredTime > Date.now() / 1000) {
                if (this.lastErrorMessage != null) {
                    throw new Error(this.lastErrorMessage);
                }
                return this.lastRoom;
            }
            return null;
        },

        send(data) {
            try {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify(data));
                }
            } catch { }
        },

        updateRoom(name, password, url, playbackRate, currentTime, paused, duration, localTimestamp) {
            this.send({
                method: "/room/update",
                data: {
                    tempUser: extension.tempUser,
                    password: password,
                    name: name,
                    playbackRate: playbackRate,
                    currentTime: currentTime,
                    paused: paused,
                    url: url,
                    lastUpdateClientTime: localTimestamp,
                    duration: duration,
                    protected: extension.isRoomProtected(),
                    videoTitle: document.title,
                    sendLocalTimestamp: Date.now() / 1000
                }
            });
        },

        joinRoom(name, password) {
            if (name == this.joinedName) {
                return;
            }
            this.send({
                method: "/room/join",
                data: {
                    password: password,
                    name: name,
                }
            });
        },

        updateMember(name, password, isLoadding, currentUrl) {
            this.send({
                method: "/room/update_member",
                data: {
                    password: password,
                    roomName: name,
                    sendLocalTimestamp: Date.now() / 1000,
                    userId: extension.tempUser,
                    isLoadding: isLoadding,
                    currentUrl: currentUrl
                }
            });
        },

        disconnect() {
            if (this.socket != null) {
                try {
                    this.socket.close();
                } catch { }
            }
            this.joinedName = null;
            this.socket = null;
            this.connectedToService = false;
        }
    };

    class VideoTogetherExtension {
        constructor() {
            this.RoleEnum = RoleEnum;
            this.videoTogetherHost = releaseHost;
            this.role = RoleEnum.Null;
            this.roomName = "";
            this.password = "";
            this.url = "";
            this.duration = undefined;
            this.tempUser = generateTempUserId();
            this.version = "{{timestamp}}";
            this.timeOffset = 0;
            this.minTrip = 1e9;
            this.httpSucc = false;
            this.lastScheduledTaskTs = 0;
            this.videoMap = new Map();
            this.activatedVideo = undefined;
            this.waitForLoadding = false;
            this.playAfterLoadding = false;
            this.isMain = window.self == window.top;

            this.panel = new FloatingPanel(this);
            this.createVideoDomObserver();
            this.recoverState();
            this.timer = setInterval(() => this.scheduledTask(true), 2000);
        }

        setRole(role) {
            this.role = role;
            if (this.panel && this.panel.isMain) {
                this.panel.setRole(role);
            }
        }

        updateStatus(text, color) {
            if (this.panel && this.panel.isMain) {
                this.panel.updateStatus(text, color);
            }
        }

        applyRoomInfo(room) {
            if (!room) {
                return;
            }
            this.duration = room.duration;
            if (room.memberCount != undefined && this.panel && this.panel.isMain) {
                this.panel.updateMemberCount(room.memberCount);
            }
            this.setWaitForLoadding(room.waitForLoadding);
        }

        isRoomProtected() {
            try {
                return window.VideoTogetherStorage == undefined || window.VideoTogetherStorage.PasswordProtectedRoom != false;
            } catch {
                return true;
            }
        }

        async fetchJson(url, method = "GET") {
            url.searchParams.set("version", this.version);
            url.searchParams.set("language", language);
            const startTime = Date.now() / 1000;
            const response = await fetch(url.toString(), { method: method });
            const endTime = Date.now() / 1000;
            if (response.status != 200) {
                throw new Error("http code: " + response.status);
            }
            const data = await response.json();
            if (data.errorMessage != undefined) {
                throw new Error(data.errorMessage);
            }
            if (data.timestamp != undefined) {
                this.updateTimestampIfNeeded(data.timestamp, startTime, endTime);
            }
            return data;
        }

        async syncTimeWithServer() {
            const url = new URL(this.videoTogetherHost + "/timestamp");
            const data = await this.fetchJson(url);
            this.httpSucc = true;
            return data;
        }

        updateTimestampIfNeeded(serverTimestamp, startTime, endTime) {
            if (typeof serverTimestamp == 'number' && typeof startTime == 'number' && typeof endTime == 'number') {
                if (endTime - startTime < this.minTrip) {
                    this.timeOffset = serverTimestamp - (startTime + endTime) / 2;
                    this.minTrip = endTime - startTime;
                }
            }
        }

        getLocalTimestamp() {
            return Date.now() / 1000 + this.timeOffset;
        }

        createRoom(name, password) {
            if (name == "") {
                this.updateStatus("{$please_input_room_name$}", "red");
                return;
            }
            this.tempUser = generateTempUserId();
            this.roomName = name;
            this.password = password;
            this.url = this.linkWithoutState(window.location);
            this.setRole(RoleEnum.Master);
            this.panel.inputRoomName.value = name;
            this.panel.inRoom();
            this.saveState("");
            this.scheduledTask();
        }

        joinRoom(name, password) {
            if (name == "") {
                this.updateStatus("{$please_input_room_name$}", "red");
                return;
            }
            this.tempUser = generateTempUserId();
            this.roomName = name;
            this.password = password;
            this.setRole(RoleEnum.Member);
            this.panel.inputRoomName.value = name;
            this.panel.inRoom();
            this.saveState("");
            this.scheduledTask();
        }

        exitRoom() {
            WS.disconnect();
            this.roomName = "";
            this.password = "";
            this.url = "";
            this.duration = undefined;
            this.setRole(RoleEnum.Null);
            this.panel.inLobby();
            this.clearState();
            this.updateStatus("{$global_notification$}", "black");
        }

        createVideoModel(video) {
            if (video.VideoTogetherVideoId == undefined) {
                video.VideoTogetherVideoId = generateUUID();
            }
            return {
                id: video.VideoTogetherVideoId,
                duration: video.duration,
                activatedTime: video.VideoTogetherActivatedTime || 0,
                refreshTime: Date.now() / 1000,
            };
        }

        setActivatedVideoDom(videoDom) {
            if (videoDom.VideoTogetherVideoId == undefined) {
                videoDom.VideoTogetherVideoId = generateUUID();
            }
            videoDom.VideoTogetherActivatedTime = Date.now() / 1000;
            this.activatedVideo = this.createVideoModel(videoDom);
        }

        addVideoListener(videoDom) {
            if (videoDom.VideoTogetherLiteListenerAdded) {
                return;
            }
            videoDom.VideoTogetherLiteListenerAdded = true;
            const listener = (e) => {
                this.setActivatedVideoDom(e.target);
                this.scheduledTask();
            };
            "play pause seeked".split(" ").forEach(eventName => videoDom.addEventListener(eventName, listener, false));
        }

        createVideoDomObserver() {
            const root = document.body || document.documentElement;
            if (!root) {
                setTimeout(() => this.createVideoDomObserver(), 500);
                return;
            }
            const observeVideo = (video) => {
                this.addVideoListener(video);
                this.videoMap.set(video.VideoTogetherVideoId, this.createVideoModel(video));
            };
            document.querySelectorAll("video").forEach(observeVideo);
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.tagName == "VIDEO") {
                            observeVideo(node);
                        }
                        try {
                            node.querySelectorAll("video").forEach(observeVideo);
                        } catch { }
                    });
                });
            });
            observer.observe(root, { childList: true, subtree: true });
        }

        forEachVideo(func) {
            document.querySelectorAll("video").forEach(video => {
                try {
                    if (!video.VideoTogetherLiteListenerAdded) {
                        this.addVideoListener(video);
                    }
                    func(video);
                } catch { }
            });
        }

        getVideoDom() {
            let selected = null;
            let selectedDuration = -1;
            const now = Date.now() / 1000;
            this.forEachVideo(video => {
                const model = this.createVideoModel(video);
                this.videoMap.set(model.id, model);
                if (this.activatedVideo != undefined && model.id == this.activatedVideo.id && this.activatedVideo.activatedTime + videoExpiredSeconds > now) {
                    selected = video;
                    selectedDuration = Number.MAX_SAFE_INTEGER;
                    return;
                }
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                if (duration > selectedDuration) {
                    selected = video;
                    selectedDuration = duration;
                }
            });
            return selected;
        }

        async scheduledTask(scheduled = false) {
            if (scheduled && this.lastScheduledTaskTs + 2 > Date.now() / 1000) {
                return;
            }
            this.lastScheduledTaskTs = Date.now() / 1000;

            if (this.role == RoleEnum.Null) {
                return;
            }

            try {
                WS.connect();
                if (this.minTrip == 1e9 || !this.httpSucc) {
                    this.syncTimeWithServer();
                }
            } catch { }

            try {
                switch (this.role) {
                    case RoleEnum.Master:
                        await this.masterTask();
                        break;
                    case RoleEnum.Member:
                        await this.memberTask();
                        break;
                }
            } catch (e) {
                this.updateStatus(e.message || e, "red");
            }
        }

        async masterTask() {
            const video = this.getVideoDom();
            const pageUrl = this.linkWithoutState(window.location);
            if (video == undefined) {
                await this.updateRoom(this.roomName, this.password, pageUrl, 1, 0, true, 1e9, this.getLocalTimestamp());
                throw new Error("{$no_video_in_this_page$}");
            }

            if (this.waitForLoadding) {
                if (!video.paused) {
                    video.pause();
                    this.playAfterLoadding = true;
                }
            } else if (this.playAfterLoadding) {
                await video.play();
                this.playAfterLoadding = false;
            }

            let paused = video.paused;
            if (!isVideoLoaded(video)) {
                paused = true;
            }
            const room = await this.updateRoom(
                this.roomName,
                this.password,
                pageUrl,
                video.playbackRate,
                video.currentTime,
                paused,
                Number.isFinite(video.duration) ? video.duration : 1e9,
                this.getLocalTimestamp()
            );
            this.applyRoomInfo(room);
            this.saveState("");
            this.updateStatus("{$sync_success$} " + this.getDisplayTimeText(), "green");
        }

        async memberTask() {
            const room = await this.getRoom(this.roomName, this.password);
            this.applyRoomInfo(room);
            const newUrl = room.url;
            if (newUrl && newUrl != this.url) {
                const target = this.linkWithMemberState(newUrl, RoleEnum.Member);
                window.location = target.toString();
                return;
            }
            this.url = newUrl;
            this.saveState("");

            const video = this.getVideoDom();
            if (video == undefined) {
                throw new Error("{$no_video_in_this_page$}");
            }
            await this.syncMemberVideo(room, video);
        }

        async syncMemberVideo(room, video) {
            let paused = room.paused;
            const realCurrent = this.calculateRealCurrent(room);
            if (paused == false) {
                if (Math.abs(video.currentTime - realCurrent) > 1) {
                    video.currentTime = realCurrent;
                }
            } else if (Math.abs(video.currentTime - room.currentTime) > 0.1) {
                video.currentTime = room.currentTime;
            }

            if (video.paused != paused) {
                if (paused) {
                    video.pause();
                } else {
                    await video.play();
                    if (video.paused) {
                        throw new Error("{$need_to_play_manually$}");
                    }
                }
            }

            if (video.playbackRate != room.playbackRate) {
                try {
                    video.playbackRate = parseFloat(room.playbackRate);
                } catch { }
            }

            const isLoadding = !isVideoLoaded(video);
            WS.updateMember(this.roomName, this.password, isLoadding, this.linkWithoutState(window.location));
            this.updateStatus("{$sync_success$} " + this.getDisplayTimeText(), "green");
        }

        async updateRoom(name, password, url, playbackRate, currentTime, paused, duration, localTimestamp) {
            WS.updateRoom(name, password, url, playbackRate, currentTime, paused, duration, localTimestamp);
            const wsRoom = WS.getRoom();
            if (wsRoom != null) {
                return wsRoom;
            }

            const apiUrl = new URL(this.videoTogetherHost + "/room/update");
            apiUrl.searchParams.set("name", name);
            apiUrl.searchParams.set("password", password);
            apiUrl.searchParams.set("playbackRate", playbackRate);
            apiUrl.searchParams.set("currentTime", currentTime);
            apiUrl.searchParams.set("paused", paused);
            apiUrl.searchParams.set("url", url);
            apiUrl.searchParams.set("lastUpdateClientTime", localTimestamp);
            apiUrl.searchParams.set("duration", duration);
            apiUrl.searchParams.set("tempUser", this.tempUser);
            apiUrl.searchParams.set("protected", this.isRoomProtected());
            apiUrl.searchParams.set("videoTitle", document.title);
            return await this.fetchJson(apiUrl);
        }

        async getRoom(name, password) {
            WS.joinRoom(name, password);
            const wsRoom = WS.getRoom();
            if (wsRoom != null) {
                return wsRoom;
            }
            const url = new URL(this.videoTogetherHost + "/room/get");
            url.searchParams.set("name", name);
            url.searchParams.set("tempUser", this.tempUser);
            url.searchParams.set("password", password);
            return await this.fetchJson(url);
        }

        setWaitForLoadding(value) {
            let enabled = true;
            try {
                enabled = window.VideoTogetherStorage.WaitForLoadding != false;
            } catch { }
            this.waitForLoadding = enabled && value;
        }

        calculateRealCurrent(data) {
            const playbackRate = parseFloat(data.playbackRate);
            return data.currentTime + (this.getLocalTimestamp() - data.lastUpdateClientTime) * (isNaN(playbackRate) ? 1 : playbackRate);
        }

        getDisplayTimeText() {
            const date = new Date();
            return date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
        }

        linkWithoutState(link) {
            const url = new URL(link);
            url.searchParams.delete("VideoTogetherUrl");
            url.searchParams.delete("VideoTogetherRoomName");
            url.searchParams.delete("VideoTogetherRole");
            url.searchParams.delete("VideoTogetherPassword");
            url.searchParams.delete("VideoTogetherTimestamp");
            return url.toString();
        }

        linkWithMemberState(link, newRole = undefined) {
            const url = new URL(link);
            const oldSearch = url.search;
            url.search = "";
            url.searchParams.set("VideoTogetherUrl", link);
            url.searchParams.set("VideoTogetherRoomName", this.roomName);
            url.searchParams.set("VideoTogetherPassword", this.password);
            url.searchParams.set("VideoTogetherRole", newRole || this.role);
            url.searchParams.set("VideoTogetherTimestamp", Date.now() / 1000);
            let urlStr = url.toString();
            if (oldSearch.length > 1) {
                urlStr = urlStr + "&" + oldSearch.slice(1);
            }
            return new URL(urlStr);
        }

        saveState(link) {
            if (!this.isMain || this.role == RoleEnum.Null) {
                return;
            }
            sessionStorage.setItem("VideoTogetherUrl", link);
            sessionStorage.setItem("VideoTogetherRoomName", this.roomName);
            sessionStorage.setItem("VideoTogetherPassword", this.password);
            sessionStorage.setItem("VideoTogetherRole", this.role);
            sessionStorage.setItem("VideoTogetherTimestamp", Date.now() / 1000);
        }

        clearState() {
            [
                "VideoTogetherUrl",
                "VideoTogetherRoomName",
                "VideoTogetherPassword",
                "VideoTogetherRole",
                "VideoTogetherTimestamp"
            ].forEach(key => sessionStorage.removeItem(key));
        }

        recoverState() {
            if (!this.isMain) {
                return;
            }
            const currentUrl = new URL(window.location);
            const urlTimestamp = parseFloat(currentUrl.searchParams.get("VideoTogetherTimestamp"));
            const sessionTimestamp = parseFloat(sessionStorage.getItem("VideoTogetherTimestamp"));
            const useUrl = !isNaN(urlTimestamp) && (isNaN(sessionTimestamp) || urlTimestamp >= sessionTimestamp);
            const getter = useUrl
                ? key => currentUrl.searchParams.get(key)
                : key => sessionStorage.getItem(key);
            const timestamp = parseFloat(getter("VideoTogetherTimestamp"));
            if (isNaN(timestamp) || timestamp + stateMaxAgeSeconds < Date.now() / 1000) {
                return;
            }

            const role = parseInt(getter("VideoTogetherRole"));
            const roomName = getter("VideoTogetherRoomName");
            const password = getter("VideoTogetherPassword") || "";
            const vtUrl = getter("VideoTogetherUrl") || this.linkWithoutState(window.location);
            if (!roomName || (role != RoleEnum.Master && role != RoleEnum.Member)) {
                return;
            }

            this.roomName = roomName;
            this.password = password;
            this.url = vtUrl;
            this.setRole(role);
            this.panel.inputRoomName.value = roomName;
            this.panel.inputRoomPassword.value = password;
            this.panel.inRoom();
            this.scheduledTask();
        }
    }

    try {
        if (window.videoTogetherExtension === undefined) {
            window.videoTogetherExtension = null;
            var extension = new VideoTogetherExtension();
            window.videoTogetherExtension = extension;
            postMessageToSelf(17, {});
        }
    } catch (e) {
        console.error(e);
    }
})();

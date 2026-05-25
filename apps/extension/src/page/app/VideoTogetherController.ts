import { Role, calculateRealCurrent, createTimeSyncState, getLocalTimestamp, linkWithMemberState, linkWithoutState, updateTimeSync, type Language, type Room } from "@videotogether/shared";

import { translate, type LocaleKey } from "../../i18n/messages";
import { VideoTogetherApiClient } from "../infrastructure/httpClient";
import { PageStateStore } from "../infrastructure/pageStateStore";
import { VideoTogetherWsClient } from "../infrastructure/wsClient";
import { generateUUID, isVideoLoaded, VideoRegistry } from "../infrastructure/videoRegistry";
import { getServiceHost, stateMaxAgeSeconds } from "./config";

export type StatusTone = "default" | "danger" | "success";

export interface PanelState {
  inRoom: boolean;
  memberCount: number;
  password: string;
  role: Role;
  roomName: string;
  statusText: string;
  statusTone: StatusTone;
}

type Listener = () => void;

export class VideoTogetherController {
  private readonly apiClient: VideoTogetherApiClient;
  private httpSucc = false;
  private lastScheduledTaskTs = 0;
  private readonly listeners = new Set<Listener>();
  private readonly stateStore = new PageStateStore(stateMaxAgeSeconds);
  private tempUser = this.generateTempUserId();
  private timer: number | undefined;
  private timeSync = createTimeSyncState();
  private url = "";
  private waitForLoadding = false;
  private playAfterLoadding = false;
  private readonly videoRegistry: VideoRegistry;
  private readonly wsClient: VideoTogetherWsClient;

  private panelState: PanelState = {
    inRoom: false,
    memberCount: 0,
    password: "",
    role: Role.Null,
    roomName: "",
    statusText: "",
    statusTone: "default"
  };

  constructor(
    private readonly language: Language,
    private readonly serviceHost = getServiceHost()
  ) {
    this.apiClient = new VideoTogetherApiClient(
      serviceHost,
      language,
      () => this.version,
      () => this.timeSync,
      (state) => {
        this.timeSync = state;
      }
    );
    this.wsClient = new VideoTogetherWsClient(
      language,
      (room) => {
        this.applyRoomInfo(room);
        void this.scheduledTask();
      },
      (replay) => {
        const now = Date.now() / 1000;
        this.updateTimestampIfNeeded(
          replay.receiveServerTimestamp,
          replay.sendLocalTimestamp,
          now - replay.sendServerTimestamp + replay.receiveServerTimestamp
        );
      }
    );
    this.videoRegistry = new VideoRegistry(() => void this.scheduledTask());
    this.panelState.statusText = this.message("global_notification");
  }

  readonly version = String(Math.floor(Date.now() / 1000));

  createRoom(name: string, password: string): void {
    if (name === "") {
      this.updateStatus(this.message("please_input_room_name"), "danger");
      return;
    }

    this.tempUser = this.generateTempUserId();
    this.url = linkWithoutState(window.location);
    this.enterRoom(name, password, Role.Master);
  }

  dispose(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
    }
    this.wsClient.disconnect();
  }

  exitRoom(): void {
    this.wsClient.disconnect();
    this.url = "";
    this.waitForLoadding = false;
    this.playAfterLoadding = false;
    this.stateStore.clear();
    this.setPanelState({
      inRoom: false,
      memberCount: 0,
      password: "",
      role: Role.Null,
      roomName: "",
      statusText: this.message("global_notification"),
      statusTone: "default"
    });
  }

  getPanelState = (): PanelState => this.panelState;

  joinRoom(name: string, password: string): void {
    if (name === "") {
      this.updateStatus(this.message("please_input_room_name"), "danger");
      return;
    }

    this.tempUser = this.generateTempUserId();
    this.enterRoom(name, password, Role.Member);
  }

  start(): void {
    this.videoRegistry.observe();
    this.recoverState();
    this.timer = window.setInterval(() => void this.scheduledTask(true), 2000);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private applyRoomInfo(room: Room | null): void {
    if (!room) {
      return;
    }

    this.setWaitForLoadding(room.waitForLoadding);
    this.setPanelState({ memberCount: room.memberCount ?? 0 });
  }

  private async getRoom(name: string, password: string): Promise<Room> {
    this.wsClient.joinRoom(name, password);
    const wsRoom = this.wsClient.getRoom();
    return wsRoom ?? await this.apiClient.getRoom(name, password, this.tempUser);
  }

  private getDisplayTimeText(): string {
    const date = new Date();
    return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  }

  private getMainPageUrl(): string {
    return linkWithoutState(window.location);
  }

  private async masterTask(): Promise<void> {
    const video = this.videoRegistry.getVideoDom();
    const pageUrl = this.getMainPageUrl();
    this.url = pageUrl;
    if (video === null) {
      await this.updateRoom(pageUrl, 1, 0, true, 1e9, getLocalTimestamp(this.timeSync));
      throw new Error(this.message("no_video_in_this_page"));
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

    const paused = isVideoLoaded(video) ? video.paused : true;
    const room = await this.updateRoom(
      pageUrl,
      video.playbackRate,
      video.currentTime,
      paused,
      Number.isFinite(video.duration) ? video.duration : 1e9,
      getLocalTimestamp(this.timeSync)
    );
    this.applyRoomInfo(room);
    this.saveState();
    this.updateStatus(`${this.message("sync_success")} ${this.getDisplayTimeText()}`, "success");
  }

  private async memberTask(): Promise<void> {
    const room = await this.getRoom(this.panelState.roomName, this.panelState.password);
    this.applyRoomInfo(room);
    const nextUrl = room.url;
    if (nextUrl && nextUrl !== this.url) {
      window.location.href = linkWithMemberState(
        nextUrl,
        this.panelState.roomName,
        this.panelState.password,
        Role.Member
      ).toString();
      return;
    }

    this.url = nextUrl;
    this.saveState();
    const video = this.videoRegistry.getVideoDom();
    if (video === null) {
      throw new Error(this.message("no_video_in_this_page"));
    }
    await this.syncMemberVideo(room, video);
  }

  private message(key: LocaleKey): string {
    return translate(this.language, key);
  }

  private recoverState(): void {
    if (window.self !== window.top) {
      return;
    }

    const state = this.stateStore.recover(window.location);
    if (!state) {
      return;
    }

    this.url = state.url;
    this.setPanelState({
      inRoom: true,
      password: state.password,
      role: state.role,
      roomName: state.roomName
    });
    void this.scheduledTask();
  }

  private async scheduledTask(scheduled = false): Promise<void> {
    if (scheduled && this.lastScheduledTaskTs + 2 > Date.now() / 1000) {
      return;
    }
    this.lastScheduledTaskTs = Date.now() / 1000;
    if (this.panelState.role === Role.Null) {
      return;
    }

    try {
      this.wsClient.connect(this.serviceHost);
      if (!Number.isFinite(this.timeSync.minTrip) || !this.httpSucc) {
        void this.syncTimeWithServer();
      }
    } catch {
      // HTTP requests below still provide a fallback path.
    }

    try {
      if (this.panelState.role === Role.Master) {
        await this.masterTask();
      } else if (this.panelState.role === Role.Member) {
        await this.memberTask();
      }
    } catch (error) {
      this.updateStatus(error instanceof Error ? error.message : String(error), "danger");
    }
  }

  private saveState(): void {
    if (window.self === window.top) {
      this.stateStore.save(
        this.panelState.roomName,
        this.panelState.password,
        this.panelState.role,
        this.url
      );
    }
  }

  private setPanelState(next: Partial<PanelState>): void {
    this.panelState = { ...this.panelState, ...next };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async syncMemberVideo(room: Room, video: HTMLVideoElement): Promise<void> {
    const realCurrent = calculateRealCurrent(room, getLocalTimestamp(this.timeSync));
    if (!room.paused && Math.abs(video.currentTime - realCurrent) > 1) {
      video.currentTime = realCurrent;
    } else if (room.paused && Math.abs(video.currentTime - room.currentTime) > 0.1) {
      video.currentTime = room.currentTime;
    }

    if (video.paused !== room.paused) {
      if (room.paused) {
        video.pause();
      } else {
        await video.play();
        if (video.paused) {
          throw new Error(this.message("need_to_play_manually"));
        }
      }
    }

    if (video.playbackRate !== room.playbackRate) {
      try {
        video.playbackRate = Number.parseFloat(String(room.playbackRate));
      } catch {
        // Some hosts block playbackRate updates.
      }
    }

    this.wsClient.updateMember({
      currentUrl: this.getMainPageUrl(),
      isLoadding: !isVideoLoaded(video),
      password: this.panelState.password,
      roomName: this.panelState.roomName,
      sendLocalTimestamp: Date.now() / 1000,
      userId: this.tempUser
    });
    this.updateStatus(`${this.message("sync_success")} ${this.getDisplayTimeText()}`, "success");
  }

  private async syncTimeWithServer(): Promise<void> {
    await this.apiClient.timestamp();
    this.httpSucc = true;
  }

  private updateRoom(
    url: string,
    playbackRate: number,
    currentTime: number,
    paused: boolean,
    duration: number,
    localTimestamp: number
  ): Promise<Room> {
    const payload = {
      currentTime,
      duration,
      lastUpdateClientTime: localTimestamp,
      name: this.panelState.roomName,
      password: this.panelState.password,
      paused,
      playbackRate,
      protected: this.isRoomProtected(),
      sendLocalTimestamp: Date.now() / 1000,
      tempUser: this.tempUser,
      url,
      videoTitle: document.title
    };
    this.wsClient.updateRoom(payload);
    const wsRoom = this.wsClient.getRoom();
    return wsRoom ? Promise.resolve(wsRoom) : this.apiClient.updateRoom(payload);
  }

  private updateStatus(statusText: string, statusTone: StatusTone): void {
    this.setPanelState({ statusText, statusTone });
  }

  private updateTimestampIfNeeded(serverTimestamp: number, startTime: number, endTime: number): void {
    this.timeSync = updateTimeSync(this.timeSync, serverTimestamp, startTime, endTime);
  }

  private enterRoom(name: string, password: string, role: Role): void {
    this.setPanelState({
      inRoom: true,
      password,
      role,
      roomName: name
    });
    this.saveState();
    void this.scheduledTask();
  }

  private generateTempUserId(): string {
    return `${generateUUID()}:${Date.now() / 1000}`;
  }

  private isRoomProtected(): boolean {
    return window.VideoTogetherStorage === undefined
      || window.VideoTogetherStorage.PasswordProtectedRoom !== false;
  }

  private setWaitForLoadding(value: boolean): void {
    const enabled = window.VideoTogetherStorage?.WaitForLoadding !== false;
    this.waitForLoadding = enabled && value;
  }
}

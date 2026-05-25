import { Role, createTimeSyncState, getLocalTimestamp, linkWithMemberState, linkWithoutState, updateTimeSync, type HostUpdatePayload, type Language, type MemberUpdatePayload, type Room, type RoomSessionResponse } from "@videotogether/shared";

import { translate, type LocaleKey } from "../../i18n/messages";
import { VideoTogetherApiClient } from "../infrastructure/httpClient";
import { PageStateStore } from "../infrastructure/pageStateStore";
import { VideoTogetherWsClient } from "../infrastructure/wsClient";
import { isVideoLoaded, VideoRegistry } from "../infrastructure/videoRegistry";
import { getServiceHost, stateMaxAgeSeconds } from "./config";
import { generateTempUserId, getDisplayTimeText, isRoomProtected, isWaitForLoadingEnabled } from "./controllerUtils";
import { initialPanelState, type PanelState, type StatusTone } from "./panelState";
import { syncVideoToRoom } from "./videoSync";

export type { PanelState, StatusTone } from "./panelState";

type Listener = () => void;

export class VideoTogetherController {
  private readonly apiClient: VideoTogetherApiClient;
  private httpSucc = false;
  private lastScheduledTaskTs = 0;
  private readonly listeners = new Set<Listener>();
  private readonly stateStore = new PageStateStore(stateMaxAgeSeconds);
  private sessionToken = "";
  private tempUser = generateTempUserId();
  private timer: number | undefined;
  private timeSync = createTimeSyncState();
  private url = "";
  private waitForLoading = false;
  private playAfterLoading = false;
  private readonly videoRegistry: VideoRegistry;
  private readonly wsClient: VideoTogetherWsClient;

  private panelState: PanelState = initialPanelState("");

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
      },
      (sessionToken) => this.setSessionToken(sessionToken)
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

    this.tempUser = generateTempUserId();
    this.sessionToken = "";
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
    this.sessionToken = "";
    this.url = "";
    this.waitForLoading = false;
    this.playAfterLoading = false;
    this.stateStore.clear();
    this.setPanelState(initialPanelState(this.message("global_notification")));
  }

  getPanelState = (): PanelState => this.panelState;

  joinRoom(name: string, password: string): void {
    if (name === "") {
      this.updateStatus(this.message("please_input_room_name"), "danger");
      return;
    }

    this.tempUser = generateTempUserId();
    this.sessionToken = "";
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

    this.setWaitForLoading(room.waitForLoading);
    this.setPanelState({ memberCount: room.memberCount ?? 0 });
  }

  private async getRoom(): Promise<Room> {
    if (this.sessionToken === "") {
      const joined = await this.apiClient.joinRoom({
        name: this.panelState.roomName,
        password: this.panelState.password,
        userId: this.tempUser
      });
      this.applyRoomSession(joined);
    }

    this.wsClient.requestRoom({
      name: this.panelState.roomName,
      sessionToken: this.sessionToken
    });
    const wsRoom = this.wsClient.getRoom();
    if (wsRoom) {
      return wsRoom;
    }

    const response = await this.apiClient.getRoom({
      name: this.panelState.roomName,
      sessionToken: this.sessionToken
    });
    this.applyRoomSession(response);
    return response.room;
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

    if (this.waitForLoading) {
      if (!video.paused) {
        video.pause();
        this.playAfterLoading = true;
      }
    } else if (this.playAfterLoading) {
      await video.play();
      this.playAfterLoading = false;
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
    this.updateStatus(`${this.message("sync_success")} ${getDisplayTimeText()}`, "success");
  }

  private async memberTask(): Promise<void> {
    const room = await this.getRoom();
    this.applyRoomInfo(room);
    const nextUrl = room.url;
    if (nextUrl && nextUrl !== this.url) {
      window.location.href = linkWithMemberState(
        nextUrl,
        this.panelState.roomName,
        this.sessionToken,
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

    this.sessionToken = state.sessionToken;
    this.url = state.url;
    this.setPanelState({
      inRoom: true,
      password: "",
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
    if (window.self === window.top && this.sessionToken !== "") {
      this.stateStore.save(
        this.panelState.roomName,
        this.sessionToken,
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
    await syncVideoToRoom(
      room,
      video,
      getLocalTimestamp(this.timeSync),
      this.message("need_to_play_manually")
    );
    if (this.sessionToken === "") {
      return;
    }

    const payload: MemberUpdatePayload = {
      currentUrl: this.getMainPageUrl(),
      isLoading: !isVideoLoaded(video),
      roomName: this.panelState.roomName,
      sendLocalTimestamp: Date.now() / 1000,
      sessionToken: this.sessionToken,
      userId: this.tempUser
    };
    if (this.wsClient.isOpen()) {
      this.wsClient.updateMember(payload);
    } else {
      const response = await this.apiClient.updateMember(payload);
      this.applyRoomSession(response);
    }
    this.updateStatus(`${this.message("sync_success")} ${getDisplayTimeText()}`, "success");
  }

  private async syncTimeWithServer(): Promise<void> {
    await this.apiClient.timestamp();
    this.httpSucc = true;
  }

  private async updateRoom(
    url: string,
    playbackRate: number,
    currentTime: number,
    paused: boolean,
    duration: number,
    localTimestamp: number
  ): Promise<Room> {
    const payload: HostUpdatePayload = {
      currentTime,
      duration,
      lastUpdateClientTime: localTimestamp,
      name: this.panelState.roomName,
      paused,
      playbackRate,
      protected: isRoomProtected(),
      sendLocalTimestamp: Date.now() / 1000,
      url,
      userId: this.tempUser,
      videoTitle: document.title
    };
    if (this.sessionToken !== "") {
      payload.sessionToken = this.sessionToken;
      this.wsClient.updateRoom(payload);
      const wsRoom = this.wsClient.getRoom();
      if (wsRoom) {
        return wsRoom;
      }
    } else {
      payload.password = this.panelState.password;
    }

    const response = await this.apiClient.updateRoom(payload);
    this.applyRoomSession(response);
    return response.room;
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
    void this.scheduledTask();
  }

  private applyRoomSession(response: RoomSessionResponse): void {
    if (response.sessionToken) {
      this.setSessionToken(response.sessionToken);
    }
    this.applyRoomInfo(response.room);
  }

  private setSessionToken(sessionToken: string): void {
    if (sessionToken === "" || sessionToken === this.sessionToken) {
      return;
    }
    this.sessionToken = sessionToken;
    this.saveState();
  }

  private setWaitForLoading(value: boolean): void {
    this.waitForLoading = isWaitForLoadingEnabled() && value;
  }
}

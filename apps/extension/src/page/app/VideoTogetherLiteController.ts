import {
  createTimeSyncState,
  updateTimeSync,
  type Language, type Room, type RoomSessionResponse
} from "@videotogetherlite/shared";

import { translate, type LocaleKey } from "../../i18n/messages";
import { ApiClientError, VideoTogetherLiteApiClient } from "../infrastructure/httpClient";
import { PageStateStore } from "../infrastructure/pageStateStore";
import { VideoTogetherLiteWsClient } from "../infrastructure/wsClient";
import { VideoRegistry } from "../infrastructure/videoRegistry";
import { getServiceHost, stateMaxAgeSeconds } from "./config";
import { getDisplayTimeText, getPlaybackIdentityUrl } from "./controllerUtils";
import { followParticipantVideo, normalizeNickname, startVideoPickerFlow, syncFollowTargetVideo, toParticipantPanelState, updateParticipantRoom } from "./controllerState";
import { initialPanelState, type PanelState, type StatusTone } from "./panelState";

export type { PanelState, ParticipantPanelState, StatusTone } from "./panelState";

type Listener = () => void;

export class VideoTogetherLiteController {
  private readonly apiClient: VideoTogetherLiteApiClient;
  private httpSucc = false;
  private inviteCode = "";
  private lastRoom: Room | null = null;
  private lastScheduledTaskTs = 0;
  private readonly listeners = new Set<Listener>();
  private readonly stateStore = new PageStateStore(stateMaxAgeSeconds);
  private sessionToken = "";
  private timer: number | undefined;
  private timeSync = createTimeSyncState();
  private readonly videoRegistry: VideoRegistry;
  private readonly wsClient: VideoTogetherLiteWsClient;

  private panelState: PanelState;

  constructor(
    private readonly language: Language,
    private readonly userId: string,
    initialNickname: string,
    private readonly serviceHost = getServiceHost()
  ) {
    this.panelState = initialPanelState(this.message("global_notification"), initialNickname);
    this.apiClient = new VideoTogetherLiteApiClient(
      serviceHost,
      language,
      () => this.version,
      () => this.timeSync,
      (state) => {
        this.timeSync = state;
      }
    );
    this.wsClient = new VideoTogetherLiteWsClient(
      language,
      (room) => {
        this.applyRoomInfo(room);
        void this.syncFollowTarget(room);
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
  }

  readonly version = String(Math.floor(Date.now() / 1000));

  cancelVideoPicker(): void {
    this.videoRegistry.cancelPicker();
    this.setPanelState({ pickingVideo: false });
  }

  clearFocusedVideo(): void {
    this.videoRegistry.clearFocus();
    this.setPanelState({ focusedVideo: null, sharing: false });
    void this.scheduledTask();
  }

  createRoom(nickname: string): Promise<void> {
    const normalizedNickname = normalizeNickname(nickname, this.message("default_nickname"));
    this.setNickname(normalizedNickname);
    return this.createRoomAsync(normalizedNickname);
  }

  dispose(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
    }
    this.wsClient.disconnect();
    this.videoRegistry.disconnect();
  }

  exitRoom(): void {
    const token = this.sessionToken;
    this.clearLocalRoomState();
    if (token !== "") {
      void this.apiClient.leaveRoom({ sessionToken: token }).catch(() => undefined);
    }
  }

  followParticipant(userId: string): Promise<void> {
    this.setPanelState({ followUserId: userId });
    let followPromise = Promise.resolve();
    followParticipantVideo({
      followUserId: userId,
      notSharingText: this.message("participant_not_sharing"),
      onFollow: () => {
        followPromise = this.syncFollowTarget(this.lastRoom);
      },
      onStatus: (text, tone) => this.updateStatus(text, tone),
      room: this.lastRoom,
      roomCode: this.panelState.roomCode,
      saveState: (followUserId) => this.saveState(followUserId),
      sessionToken: this.sessionToken
    });
    return followPromise;
  }

  getPanelState = (): PanelState => this.panelState;

  joinRoom(inviteCode: string, nickname: string): Promise<void> {
    const normalizedInvite = inviteCode.trim();
    if (normalizedInvite === "") {
      this.updateStatus(this.message("please_input_invite_code"), "danger");
      return Promise.resolve();
    }

    const normalizedNickname = normalizeNickname(nickname, this.message("default_nickname"));
    this.setNickname(normalizedNickname);
    return this.joinRoomAsync(normalizedInvite, normalizedNickname);
  }

  setNickname(nickname: string): void {
    const normalizedNickname = normalizeNickname(nickname, this.message("default_nickname"));
    this.setPanelState({ nickname: normalizedNickname });
    window.postMessage({
      data: { nickname: normalizedNickname },
      source: "VideoTogetherLite",
      type: "profile.save"
    }, "*");
    void this.scheduledTask();
  }

  start(): void {
    this.videoRegistry.observe();
    void this.recoverState();
    this.timer = window.setInterval(() => void this.scheduledTask(true), 2000);
  }

  startVideoPicker(): void {
    startVideoPickerFlow({
      onSchedule: () => void this.scheduledTask(),
      onUpdateFullscreen: () => undefined,
      setPanelState: (next) => this.setPanelState(next),
      text: {
        focused: this.message("video_focused"),
        instruction: this.message("pick_video_instruction"),
        notFound: this.message("no_videos_found")
      },
      videoRegistry: this.videoRegistry
    });
  }

  stopFollowing(): void {
    this.setPanelState({
      followUserId: "",
      participants: this.panelState.participants.map((participant) => ({
        ...participant,
        isFollowing: false
      }))
    });
    this.saveState("");
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

    this.lastRoom = room;
    const participants = room.participants.map((participant) => toParticipantPanelState(
      participant,
      this.userId,
      this.panelState.followUserId,
      this.message("no_shared_video")
    ));
    const localParticipant = room.participants.find((participant) => participant.userId === this.userId);
    this.setPanelState({
      participantCount: room.participantCount,
      participants,
      roomCode: room.roomCode,
      sharing: Boolean(localParticipant?.sharing && localParticipant.focusedVideo !== undefined)
    });
    this.saveState();
  }

  private applyRoomSession(response: RoomSessionResponse, inviteCode = ""): void {
    if (response.sessionToken) {
      this.sessionToken = response.sessionToken;
    }
    if (response.inviteCode) {
      this.inviteCode = response.inviteCode;
    } else if (inviteCode !== "") {
      this.inviteCode = inviteCode;
    }
    this.setPanelState({ inRoom: true, inviteCode: this.inviteCode });
    this.applyRoomInfo(response.room);
  }

  private clearLocalRoomState(): void {
    this.wsClient.disconnect();
    this.sessionToken = "";
    this.inviteCode = "";
    this.lastRoom = null;
    this.stateStore.clear();
    this.setPanelState({
      ...initialPanelState(this.message("global_notification"), this.panelState.nickname),
      focusedVideo: this.videoRegistry.getFocusedVideoSummary()
    });
  }

  private async createRoomAsync(nickname: string): Promise<void> {
    try {
      const response = await this.apiClient.createRoom({
        nickname,
        userId: this.userId
      });
      this.applyRoomSession(response);
      this.updateStatus(this.message("room_created"), "success");
      void this.scheduledTask();
    } catch (error) {
      this.handleActionError(error);
    }
  }

  private async joinRoomAsync(inviteCode: string, nickname: string): Promise<void> {
    try {
      const response = await this.apiClient.joinRoom({
        inviteCode,
        nickname,
        userId: this.userId
      });
      this.applyRoomSession(response, inviteCode);
      this.updateStatus(this.message("room_joined"), "success");
      void this.scheduledTask();
    } catch (error) {
      this.handleActionError(error);
    }
  }

  private handleActionError(error: unknown): void {
    const statusText = error instanceof Error ? error.message : String(error);
    this.updateStatus(statusText, "danger");
  }

  private handleStaleRoomError(error: unknown): boolean {
    if (
      error instanceof ApiClientError
      && (error.code === "room_not_found" || error.code === "unauthorized")
    ) {
      const message = error.message;
      this.clearLocalRoomState();
      this.updateStatus(message, "danger");
      return true;
    }
    return false;
  }

  private message(key: LocaleKey): string { return translate(this.language, key); }

  private async recoverState(): Promise<void> {
    if (window.self !== window.top) {
      return;
    }

    const state = await this.stateStore.recover(window.location);
    if (!state) {
      return;
    }

    this.sessionToken = state.sessionToken;
    this.setPanelState({
      followUserId: state.followUserId,
      inRoom: true,
      roomCode: state.roomCode,
      sharing: state.sharing === true
    });
    void this.scheduledTask();
  }

  private refreshFocusedVideo(): void {
    const focusedVideo = this.videoRegistry.getFocusedVideoSummary()
      ?? (this.panelState.sharing ? this.videoRegistry.focusPlaybackTargetVideo() : null);
    this.setPanelState({ focusedVideo });
  }

  private saveState(followUserId = this.panelState.followUserId): void {
    if (window.self === window.top && this.sessionToken !== "" && this.panelState.roomCode !== "") {
      this.stateStore.save(this.panelState.roomCode, this.sessionToken, getPlaybackIdentityUrl(window.location), followUserId, this.panelState.sharing);
    }
  }

  private async scheduledTask(scheduled = false): Promise<void> {
    if (scheduled && this.lastScheduledTaskTs + 2 > Date.now() / 1000) {
      return;
    }
    this.lastScheduledTaskTs = Date.now() / 1000;
    this.refreshFocusedVideo();
    if (!this.panelState.inRoom || this.sessionToken === "") {
      return;
    }
    if (this.panelState.sharing && this.panelState.focusedVideo === null) {
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
      const room = await this.updateCurrentParticipant();
      this.applyRoomInfo(room);
      await this.syncFollowTarget(room);
      this.saveState();
      this.updateStatus(`${this.message("sync_success")} ${getDisplayTimeText()}`, "success");
    } catch (error) {
      if (this.handleStaleRoomError(error)) {
        return;
      }
      this.handleActionError(error);
    }
  }

  private setPanelState(next: Partial<PanelState>): void {
    this.panelState = { ...this.panelState, ...next };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async syncFollowTarget(room: Room | null): Promise<void> {
    await syncFollowTargetVideo({
      followUserId: this.panelState.followUserId,
      manualPlayMessage: this.message("need_to_play_manually"),
      onStatus: (text, tone) => this.updateStatus(text, tone),
      pickVideoToFollowMessage: this.message("please_pick_video_to_follow"),
      room,
      saveState: (followUserId) => this.saveState(followUserId),
      sessionToken: this.sessionToken,
      timeSync: this.timeSync,
      videoRegistry: this.videoRegistry
    });
  }

  private async syncTimeWithServer(): Promise<void> { await this.apiClient.timestamp(); this.httpSucc = true; }

  private async updateCurrentParticipant(): Promise<Room> {
    return updateParticipantRoom({
      apiClient: this.apiClient,
      applyRoomSession: (response) => this.applyRoomSession(response),
      nickname: this.panelState.nickname,
      onLostFocusedVideo: () => this.setPanelState({ focusedVideo: null, sharing: false }),
      sessionToken: this.sessionToken,
      timeSync: this.timeSync,
      videoRegistry: this.videoRegistry,
      wsClient: this.wsClient
    });
  }

  private updateStatus(statusText: string, statusTone: StatusTone): void { this.setPanelState({ statusText, statusTone }); }

  private updateTimestampIfNeeded(serverTimestamp: number, startTime: number, endTime: number): void {
    this.timeSync = updateTimeSync(this.timeSync, serverTimestamp, startTime, endTime);
  }
}

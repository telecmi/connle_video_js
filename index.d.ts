// Type definitions for connle-video-sdk
// The SDK ships as plain JS; these ambient types describe its public surface.

/** {audio, video} requested for / received with a call. */
export interface CallMedia {
  audio: boolean;
  video: boolean;
}

export type ConnleHandler = (data: any) => void;
export type ConnleAck = (ack: any) => void;

export default class ConnleVideo {
  socket?: any;
  video?: any;
  isConnected?: boolean;
  outboundCallInFlight?: boolean;

  /**
   * @param serverUrl  Signalling WebSocket URL (e.g. wss://signal.connle.com).
   * @param token      Auth token that identifies the connecting user.
   * @param mediaURL   Media / SFU WebSocket URL (e.g. wss://sfu.connle.com). Optional.
   */
  constructor(
    serverUrl: string,
    token: string,
    mediaURL?: string,
    options?: {
      /**
       * React Native: automatically register this device's push token with
       * TeleCMI and receive incoming-video-call pushes ('video_call' /
       * 'video_cancel'), including when the voice SDK shares the app (one
       * push pipeline, routed by payload type). Default true; no-op on web.
       */
      autoPush?: boolean;
      /** Override the push REST endpoints (testing/staging). */
      push?: { apiBase?: string; registerPath?: string; unregisterPath?: string };
    },
  );

  // ---- Connection ----
  /** Open the signalling connection. */
  connect(): void;
  /** Remove this device's video push registration (e.g. on sign-out). React Native only. */
  unregisterPush(callback?: ConnleAck): void;
  /** Close the signalling connection. */
  disconnect(): void;

  // ---- Signalling callbacks (single handler each) ----
  /** Fires when the signalling socket connects. */
  onConnect(callback: ConnleHandler): void;
  /** Fires when the signalling socket disconnects. */
  onDisconnect(callback: ConnleHandler): void;
  /** Fires when another user calls you. */
  onIncomingCall(callback: ConnleHandler): void;
  /** Fires when your outbound call is answered by the remote side. */
  onAnswered(callback: ConnleHandler): void;
  /** Fires when the call ends. */
  onEnded(callback: ConnleHandler): void;
  /** General call/status updates. */
  onStatus(callback: ConnleHandler): void;
  /** Error events. */
  onError(callback: ConnleHandler): void;
  /** Custom data-channel / chat messages. */
  onMessage(callback: ConnleHandler): void;
  /** Send a custom message to the peer. */
  sendMessage(content: any, callback?: ConnleAck): void;

  // ---- Call control ----
  /** Place an outbound call. `media` selects audio and/or video. */
  call(userId: string, media: CallMedia, callback?: ConnleAck): void;
  /** Answer the current incoming call. */
  answer(callback?: ConnleAck): void;
  /** Reject the current incoming call. */
  reject(callback?: ConnleAck): void;
  /** End the active call. */
  hangup(callback?: ConnleAck): void;
  /** Cancel a still-ringing outbound call. */
  cancelOutgoingCall(callback?: ConnleAck): void;
  /** Whether a media session is currently connected. */
  onCall(): boolean;

  // ---- Microphone ----
  mute(): void;
  unmute(): void;
  toggleAudio(): void;

  // ---- Camera ----
  /** Turn the camera off. */
  pause(): void;
  /** Turn the camera on. */
  play(): void;
  toggleVideo(): void;

  // ---- Mobile audio & camera (React Native only; no-op on web) ----
  /** Route call audio to the loudspeaker (true) or earpiece (false). */
  setSpeaker(enabled: boolean): void;
  toggleSpeaker(): void;
  /** Flip between the front and back camera. */
  switchCamera(): void;

  // ---- Screen share ----
  shareScreen(): void;
  stopScreenShare(): void;
  toggleScreenShare(): void;

  // ---- EventEmitter surface (media & in-call events) ----
  on(event: string, handler: ConnleHandler): this;
  off(event: string, handler: ConnleHandler): this;
  once(event: string, handler: ConnleHandler): this;
  removeAllListeners(event?: string): this;
  emit(event: string, ...args: any[]): boolean;
}

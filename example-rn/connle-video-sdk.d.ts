// Minimal ambient types for the local connle-video-sdk (it ships as plain JS).
// Lets the example app's editor/tsc understand the imported class. These mirror
// the public surface in ../src/connly.js.
declare module 'connle-video-sdk' {
  type ConnleHandler = (data: any) => void;
  type ConnleAck = (ack: any) => void;

  /** {audio, video} requested for a call. */
  export interface CallMedia {
    audio: boolean;
    video: boolean;
  }

  export default class ConnleVideo {
    constructor(
      serverUrl: string,
      token: string,
      mediaURL?: string,
      options?: {
        autoPush?: boolean;
        push?: {apiBase?: string; registerPath?: string; unregisterPath?: string};
      },
    );

    /** Open the signalling connection. */
    connect(): void;
    /** Close the signalling connection. */
    disconnect(): void;

    // ---- Signalling callbacks ----
    onConnect(cb: ConnleHandler): void;
    onDisconnect(cb: ConnleHandler): void;
    onIncomingCall(cb: ConnleHandler): void;
    onAnswered(cb: ConnleHandler): void;
    onEnded(cb: ConnleHandler): void;
    onStatus(cb: ConnleHandler): void;
    onError(cb: ConnleHandler): void;
    onMessage(cb: ConnleHandler): void;
    sendMessage(content: any, cb?: ConnleAck): void;

    // ---- Call control ----
    call(userId: string, media: CallMedia, cb?: ConnleAck): void;
    answer(cb?: ConnleAck): void;
    reject(cb?: ConnleAck): void;
    hangup(cb?: ConnleAck): void;
    cancelOutgoingCall(cb?: ConnleAck): void;

    // ---- Media control ----
    onCall(): boolean;
    mute(): void;
    unmute(): void;
    toggleAudio(): void;
    play(): void;
    pause(): void;
    toggleVideo(): void;
    shareScreen(): void;
    stopScreenShare(): void;
    toggleScreenShare(): void;
    /** Route call audio to the loudspeaker (true) or earpiece (false). RN only. */
    setSpeaker(enabled: boolean): void;
    toggleSpeaker(): void;
    /** Flip between front and back camera. RN only. */
    switchCamera(): void;

    // ---- EventEmitter surface (extends Node's EventEmitter) ----
    on(event: string, handler: ConnleHandler): this;
    off(event: string, handler: ConnleHandler): this;
    once(event: string, handler: ConnleHandler): this;
    removeAllListeners(event?: string): this;
    emit(event: string, ...args: any[]): boolean;
  }
}

// VideoView typing is provided by @livekit/react-native; nothing extra needed here.

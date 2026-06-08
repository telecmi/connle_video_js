// Platform LiveKit bindings — web / default build.
//
// In the browser the WebRTC primitives (RTCPeerConnection, getUserMedia, ...)
// are provided by the environment, so livekit-client is used directly. The
// React Native counterpart lives in ./livekit.native.js and is picked up
// automatically by Metro's `.native.js` resolution.
export { Room, VideoPresets, setLogLevel, LogLevel } from 'livekit-client';

// AudioSession only exists on React Native. Expose no-op stubs on web so the
// shared media code can call it unconditionally without platform checks.
export const AudioSession = {
    configureAudio: async () => {},
    startAudioSession: async () => {},
    stopAudioSession: async () => {},
    setAppleAudioConfiguration: async () => {},
    setDefaultRemoteAudioTrackVolume: async () => {},
    selectAudioOutput: async () => {},
    getAudioOutputs: async () => [],
};

export const AndroidAudioTypePresets = {
    communication: {},
    media: {},
};

export const getDefaultAppleAudioConfigurationForMode = () => ( {} );

// Platform LiveKit bindings — React Native build.
//
// Metro selects this file over ./livekit.js for native targets. React Native
// ships no WebRTC stack, so @livekit/react-native installs the native
// implementation (RTCPeerConnection, MediaStream, getUserMedia, ...) onto the
// global scope. registerGlobals() must run once, before any livekit-client code
// executes — importing this module guarantees that ordering.
//
// @livekit/react-native and @livekit/react-native-webrtc are optional peer
// dependencies; install them in the host app to enable the React Native build.
import { registerGlobals, AudioSession, AndroidAudioTypePresets, getDefaultAppleAudioConfigurationForMode } from '@livekit/react-native';
registerGlobals();
const {
  Room,
  VideoPresets,
  setLogLevel,
  LogLevel
} = require('livekit-client');

// ---- ICE server safety patch --------------------------------------------
// livekit-client passes iceServers from RoomOptions.rtcConfig to each
// RTCPeerConnection. As a belt-and-suspenders guarantee (in case any internal
// config merging drops the list), we wrap the native RTCPeerConnection here —
// BEFORE livekit-client is imported and wraps it again — so our STUN is
// injected at the lowest level if it is ever missing.
//
// To add TURN relay (needed for cellular / carrier-grade NAT), append:
//   { urls: 'turn:<host>:<port>', username: '<user>', credential: '<pass>' }
const ICE_SERVERS = [{
  urls: 'stun:stunind.telecmi.com:3478'
}
// { urls: 'turn:turnind.telecmi.com:3478', username: 'user', credential: 'pass' },
];
if (global.RTCPeerConnection) {
  const _NativePC = global.RTCPeerConnection;
  function PatchedRTCPeerConnection(config) {
    const c = Object.assign({}, config);
    const configuredIceServers = c.iceServers || [];
    const hasConnleStun = configuredIceServers.some(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some(url => typeof url === 'string' && url.includes('stunind.telecmi.com'));
    });
    if (!hasConnleStun) {
      c.iceServers = [...ICE_SERVERS, ...configuredIceServers];
    }
    return new _NativePC(c);
  }
  PatchedRTCPeerConnection.prototype = _NativePC.prototype;
  Object.assign(PatchedRTCPeerConnection, _NativePC);
  global.RTCPeerConnection = PatchedRTCPeerConnection;
}
// -------------------------------------------------------------------------

export { Room, VideoPresets, setLogLevel, LogLevel, AudioSession, AndroidAudioTypePresets, getDefaultAppleAudioConfigurationForMode };
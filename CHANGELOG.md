# Changelog

All notable changes to this project will be documented in this file.

## [0.3.1] - 2026-06-08

### Added
- **React Native support (iOS & Android)**: the SDK now runs on React Native via
  a platform-specific media layer (`src/livekit.native.js`) that uses
  `@livekit/react-native` + `@livekit/react-native-webrtc`. The same call API
  works on Web, Electron, and React Native — your bundler selects the right build.
- **Mobile call controls**: `setSpeaker(on)` / `toggleSpeaker()` to route audio to
  the loudspeaker or earpiece, and `switchCamera()` to flip the front/back camera.
  New `speakerChanged` and `cameraSwitched` events.
- **React Native example app** (`example-rn/`): a runnable iPhone/Android test app
  with connect, inbound/outbound audio & video calls, and mute / camera / speaker
  / flip-camera controls.
- **Cross-platform documentation**: dedicated platform guides — `README.web.md`,
  `README.react-native-ios.md`, `README.react-native-android.md` — plus a unified
  API reference in `README.md` and root TypeScript types (`index.d.ts`).
- `streamAdded` / `localStreamAdded` now also emit the full LiveKit `track` object
  (for `<VideoView>` on React Native), alongside the existing raw `stream`
  `MediaStreamTrack` (for the browser's `<video>` element).

### Changed
- **Audio routing**: video calls default to the **loudspeaker**, audio calls to
  the **earpiece** — instead of always forcing the loudspeaker. Audio routing now
  goes through LiveKit's AudioManager exclusively, fixing an issue where audio
  could play on both the earpiece and loudspeaker at once (and the resulting echo).

## [0.1.6] - 2025-05-11

### Added
- Initial public release: voice & video calling for the Web with signalling
  (Socket.IO) + LiveKit media, call control (mute, camera, screen share), and an
  event-driven API.

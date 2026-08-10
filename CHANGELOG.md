# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-08-07

### Fixed
- **Video negotiation failed in apps built from the published package** ("NegotiationError: negotiation timed out" when enabling video). 1.0.0 declared `livekit-client ^2.15.0`, but the production media server requires the 2.11 line — fresh installs pulled 2.15 and renegotiation timed out. Pinned back to the tested `~2.11.2` (development setups always ran 2.11, which is why the issue only appeared in released builds).

## [1.0.0] - 2026-08-07

First stable release — device-verified end to end on iOS and Android.

### Added
- **Two packages, one codebase**: `@telecmi/connle-video` (browser) and `@telecmi/connle-video-native` (React Native) — versions synced, same API. The native package bundles its entire call stack (video/WebRTC engine, `@telecmi/react-native-callkeep`, iOS VoIP push support): apps install one package.
- **Native incoming-call experience owned by the SDK**: CallKit (iOS) / ConnectionService (Android) ringing on every push-delivered call with the caller's display name (`from_name`); Answer/End taps on the native screen drive the SDK directly; video answers bring the app to the foreground (audio answers stay on the system call screen); lock-screen answering; cold-start answers (tap before the app is ready) and answers that land while the socket is down are parked and completed automatically.
- **Android zero-config engine init**: a bundled init library runs the engine's required native setup before `Application.onCreate` — no MainApplication changes.
- **Runtime media permissions handled by the SDK**: mic (+ camera for video) requested at answer; a denied camera degrades to audio-only instead of failing the call.
- **Multi-device**: all registered devices ring; answering or rejecting on one dismisses the others; the acting device's call is never affected.
- **Reliability**: ring self-terminates (~40s) even with no network; one ring per call (socket+push dedupe by `call_id`); a signed-out device refuses call pushes; cancel dismisses the exact ringing call; Telecom-level unmute asserted on media connect (Android one-way-audio fix); camera flip via exact device id (Android).
- **Production defaults built in, all overridable**: signalling `wss://signal.connle.com`, media `wss://sfu.connle.com`, push REST `https://api.connle.com` (`options.push.apiBase`).
- New events: `callCancelled`, `cameraSwitched`. New method: `unregisterPush(callback)` — call before sign-out.
- Documentation: platform picker, React Native landing page with the RN-only API, full iOS/Android native setup guides.

## [0.5.0] - 2026-08-04

### Added
- **Push wake-ups for incoming video calls (React Native).** The SDK registers this device's push token with TeleCMI REST automatically (`autoPush`, on by default; `unregisterPush()` for sign-out) and receives `video_call` / `video_cancel` pushes sent by the video push server — surfaced through the same `onIncomingCall` path with `transport: 'push'`, so app UIs work unchanged.
- **Voice + video SDKs coexist in one app.** A shared TeleCMI push router (no dependency between the packages) gives the app ONE push pipeline: whichever SDK loads first owns the OS handlers, every payload routes by its `type`, the device token is fetched once and shared, and each SDK works identically when installed alone.

## [0.4.0] - 2026-08-04

### Changed
- **Package renamed: `connle-video-sdk` → `@telecmi/connle-video`** (the old npm name was stale at 0.1.6 — none of the React Native support ever shipped under it). Update imports: `import ConnleVideo from '@telecmi/connle-video'`.
- **Media controls are async**: `toggleAudio()`, `toggleVideo()`, `play()`, `pause()`, `toggleScreenShare()` now return promises that resolve with the actual state change — adopted from the production app's battle-tested copy.
- Packaging hygiene: npm ships exactly the built `lib/` + typings + docs (files whitelist, `prepublishOnly` build); build outputs are no longer committed to the repo.

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

# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-08-20

### Changed — custom video call screens return to combined apps
- Bundled `@telecmi/react-native-callkeep` moves to **^4.5.0** (required):
  two Android phone accounts — video/team calls ring self-managed on the
  SDK's custom call screens, a co-resident voice SDK's calls ring
  system-managed on the OS call UI — routed per call. The SDK no longer
  requests `selfManaged` at setup.
- Answered incoming calls open the SDK call screen even with the app
  foregrounded (opt out: `options.ui = { callScreen: 'app' }`).

### Fixed
- Answer before the signalling socket is up (native answer on a killed or
  backgrounded app) is queued and completed at connect instead of failing
  `NOT_CONNECTED`; the media room joins with the answer ack's fresh token
  (the ring-time token could expire while an answer was parked).
- Cold answers are adopted even when no session state exists yet (the
  ownership pre-check rejected legitimate killed-state answers); shared
  push router v3 per-call ownership guarantees a voice SDK's calls are
  never adopted, answered, or ended by this SDK.
- The native ring is skipped when the call was already answered here; the
  in-call shell keeps nudging the answer until the room connects, shows
  Connecting…/timer correctly, and force-closes the native call screen
  when the call dies.
- **Packaging: `android/build.gradle` ships again** — 1.1.2 and 1.1.3 were
  published without it (a build-intermediates filter matched it by
  prefix), which broke React Native autolinking entirely
  (`No package name found`). Those two versions are deprecated; upgrade
  straight to 1.2.0.

## [1.1.0] - 2026-08-12

### Added — one SDK call screen for every answered incoming call (Android)
- The SDK's call screen is THE in-call UI whenever the app's own UI isn't
  what the user is looking at: lock-screen answers, background answers,
  notification answers. With the app focused, the call stays in the app.
  Opt out entirely with `options.ui = { callScreen: 'app' }`.
- Icon-only round controls (native Material icons bundled as SDK assets):
  flip camera (shown only while video is on), video on/off, mute, speaker,
  end — every control drives and reflects the engine's real state.
- Audio calls (or video not yet flowing) show an avatar — app-customizable
  via the constructor option `{ avatar: url }`, initial-letter fallback.
  Caller names render title-cased everywhere.
- `ConnleVideo.registerColdBoot(factory)` — killed-app answers build the
  session headlessly from app-stored credentials; no app UI involved.
- The ongoing-call notification returns to the call screen; unlocking keeps
  the live call on top; answered calls survive activity relaunches.

### Added / changed — iOS
- Every incoming call is reported to CallKit as a video call from a
  phone-number handle; answers complete instantly; the media engine owns
  the audio session (`audioSession.autoConfigure = false`, LiveKit pattern).
- Answering follows the call's own media; either side toggles their camera
  with the Video control at any time.
- Known iOS behavior: LOCKED answers authenticate and hand into the app;
  on current iOS, unlocked answers land on the system call screen with the
  app one tap away (classic-CallKit limitation; LiveCommunicationKit
  adoption is the planned path to in-app answers everywhere).

### Fixed
- Camera flip no longer blanks the self-preview (the new native stream is
  followed continuously); remote video renders under adaptive streaming
  (element visibility reported via the engine's VideoView); a muted remote
  camera shows the avatar instead of a frozen frame; remote video is
  hard full-bleed.
- The multi-device dismissal cancel can no longer end the call on the
  device that answered it (Android multi-instance case and the iOS
  answered-but-connecting race).
- In-app answers complete the native (Telecom/CallKit) answer transaction.

### Added — Android lock-screen call experience (SDK-owned, zero app code)
- **Full-screen ring on the locked phone**: caller name + Answer/Decline over
  the keyguard, heads-up CallStyle notification, screen wake that does not
  depend on OEM full-screen-intent permission.
- **Full in-call screen over the lock screen**: edge-to-edge remote video,
  local camera preview, caller name + live talk timer, and icon-only round
  controls (flip camera, video on/off, mute, speaker, end) — native Material
  icons bundled with the SDK, every control driving and reflecting the real
  media state. Rendered on a second React surface inside the SDK's
  over-keyguard activity (Bridgeless `ReactHost.createSurface`, legacy-bridge
  fallback, native timer shell as last resort).
- **Audio-call avatar**: audio calls (or video not yet flowing) show an
  app-customizable image — constructor option `{ avatar: url }` — with an
  initial-letter circle fallback. Caller names render title-cased everywhere.
- **Cold-start locked answers**: answering with the app process dead boots
  the app invisibly behind the call screen; the session forms and the call
  completes with no visible loading. Unlocking hands off to the app UI.
- Media/network `uses-permission`s now merge from the SDK's library manifest —
  apps declare no manifest permissions at all.

### Fixed
- Stale FCM call pushes (redelivered after the device was offline or the
  push channel was wedged) are discarded past the server's no-answer window —
  they could ring a long-dead call whose UI then hijacked the next answer.
- Zombie Telecom calls left by a process death mid-ring are purged at process
  start (they re-asserted their ring and made later calls fail); any answer
  the SDK gives up on now also ends its native call.
- The multi-device dismissal cancel no longer ends the call on the device
  that answered it when the app holds more than one SDK instance.
- Answers that arrive while the socket is down force an immediate reconnect —
  JS timers (socket reconnection included) are frozen while a native activity
  is frontmost, so the parked answer could otherwise wait until the server
  timed the call out.
- The in-call surface survives system-initiated activity relaunches (config
  changes) instead of resurrecting the ring screen mid-call.

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

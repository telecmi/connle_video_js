# Connle Video SDK — React Native

Official Connle video SDK for React Native: high-quality video/audio calls,
native incoming-call UI (CallKit on iOS, ConnectionService on Android), and
push wake-ups in every app state — foreground, background, or killed.

```bash
npm install @telecmi/connle-video-native
```

Everything call-related ships **with** the SDK — its own native video/WebRTC engine,
`@telecmi/react-native-callkeep`, and iOS VoIP push support. You install one
package (plus Firebase Messaging on Android; see the Android guide).

> Building for the **browser** instead? Use
> [`@telecmi/connle-video`](https://www.npmjs.com/package/@telecmi/connle-video)
> — same API, web build.

## Platform setup

One-time native configuration per platform:

- **[iOS setup guide](README.react-native-ios.md)** — CocoaPods, permissions,
  VoIP push + CallKit wiring (required for incoming calls)
- **[Android setup guide](README.react-native-android.md)** — permissions,
  Firebase Messaging, FCM push wiring

## Quick start

```js
import ConnleVideo from '@telecmi/connle-video-native';

const connle = new ConnleVideo('wss://signal.connle.com', token);

connle.onConnect(() => console.log('ready'));           // push token registers automatically
connle.onIncomingCall((call) => { /* call.from_name, call.media */ });
connle.on('streamAdded', ({type, track}) => { /* render via RTCView */ });

connle.connect();

// Outbound
connle.call(userId, {audio: true, video: true}, (ack) => {});

// Inbound (arrives via push — see the platform guides)
connle.answer((ack) => {});
connle.reject();
connle.hangup();

// BEFORE sign-out — otherwise this device keeps ringing:
connle.unregisterPush(() => connle.disconnect());
```

## How incoming calls work on mobile

Incoming calls are delivered by **push notification only** (VoIP push on iOS,
FCM data message on Android) — a mobile app has no reliable socket in the
background, so the push is the ring in every app state. The payload
(`type:'video_call'`, `call_id`, room, token, `from`/`from_name`) is
self-sufficient: answering joins the room even when the push launched a killed
app. A `type:'video_cancel'` push dismisses the ringing UI when the caller
hangs up.

Voice + video in one app: if `@telecmi/piopiy-native` is installed alongside,
both SDKs share one device token and one background handler through the
TeleCMI push router — payloads route by `type`, with zero configuration.

## React Native–only API

Everything below exists only in `@telecmi/connle-video-native` (the browser
build either has no equivalent or treats it as a no-op).

### Constructor options (4th argument)

```js
const connle = new ConnleVideo(serverUrl, token, mediaUrl, {
  autoPush: true,                       // set false to disable push entirely
  push: {
    apiBase: 'https://api.connle.com',  // TeleCMI REST base (override for staging)
  },
});
```

| Option | Default | Purpose |
| :--- | :--- | :--- |
| `autoPush` | `true` | Fetch the device push token and register it automatically on every successful `connect()`. |
| `push.apiBase` | production REST | Where the token is registered. |

### `unregisterPush(callback)`

Removes this device's push registration. **Call it before sign-out** — a
signed-out device must stop ringing:

```js
connle.unregisterPush(() => connle.disconnect());
```

After `unregisterPush()` the SDK also refuses any incoming-call push until the
next successful `connect()`, so a late or failed server-side removal cannot
ring a signed-out device.

### Incoming call payload (push-delivered)

`onIncomingCall` receives the same object on every platform, with these fields
on React Native:

| Field | Meaning |
| :--- | :--- |
| `call_id` | Unique call id — also the native call UI's identifier. |
| `from` | Caller's user id (stable identity). |
| `from_name` | Caller's display name — show this, never `from`. |
| `media` | `{audio, video}` requested for the call. |
| `transport` | `'push'` when delivered by push (always, on mobile). |

### Events

| Event | When | What to do |
| :--- | :--- | :--- |
| `callCancelled` | The ring is over without this device answering: the caller cancelled, or the user answered/rejected on **another of their devices**. | Clear any ringing UI. The native ring is dismissed automatically. |
| `cameraSwitched` | `switchCamera()` completed. Payload `{facingMode}`. | Optional — update a front/back indicator. |

### Behavior the SDK handles for you (no API needed)

- **Native answer/end**: taps on the CallKit / ConnectionService screen answer
  or end the call in the SDK directly, bring the app to the foreground on
  Android, and survive app-killed and socket-down states (the answer is parked
  and completed the moment the session is live).
- **Runtime permissions**: mic (+ camera for video calls) are requested when a
  call is answered; a denied camera degrades the call to audio-only instead of
  failing.
- **Ring timeout**: an unanswered ring self-terminates (~40 s) even with no
  network — a device can never ring forever.
- **Multi-device**: all of a user's registered devices ring; answering or
  rejecting on one dismisses the others; the answering device's call is never
  affected by that dismissal.
- **Audio routing**: video calls default to the loudspeaker, audio calls to
  the earpiece; `setSpeaker(true|false)` overrides at any time.
- **Coexistence**: with `@telecmi/piopiy-native` in the same app, one device
  token and one push pipeline are shared automatically.

## Example app

A complete runnable app (login, calls, CallKit answer/end, push) lives in
[`example-rn/`](example-rn/) in this repository.

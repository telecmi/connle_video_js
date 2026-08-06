# Connle Video SDK — React Native

Official Connle video SDK for React Native: video/audio calls over LiveKit,
native incoming-call UI (CallKit on iOS, ConnectionService on Android), and
push wake-ups in every app state — foreground, background, or killed.

```bash
npm install @telecmi/connle-video-native
```

Everything call-related ships **with** the SDK — the LiveKit WebRTC engine,
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

## Example app

A complete runnable app (login, calls, CallKit answer/end, push) lives in
[`example-rn/`](example-rn/) in this repository.

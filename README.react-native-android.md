# Connle Video SDK — React Native Android Setup

**Platform:** 🤖 Android

> 🤖 **This is the Android guide.** Building for **iOS** or **Web / Electron**?
> → **[iOS guide](README.react-native-ios.md)** · **[Web & Electron guide](README.web.md)**

Use `@telecmi/connle-video` in a **bare React Native** Android app to make and receive
audio & video calls.

---

## Requirements

- **Node 20+** and **JDK 17**.
- **Android Studio** / Android SDK. A real device is best; the emulator can use
  your computer's camera/mic for basic testing.
- A Connle **token**, signalling URL, and media server URL.

---

## 1. Install the SDK and its native peers

```bash
npm install @telecmi/connle-video-native

# Android push wake-ups additionally need Firebase Messaging (installed
# explicitly in YOUR app — see the push section below):
npm install @react-native-firebase/app @react-native-firebase/messaging
```

| Package | Why it's needed |
| :--- | :--- |
| `@telecmi/connle-video-native` | The Connle SDK (signalling + call control). |
| `@livekit/react-native` | The SDK's engine bindings (audio session + globals). **Required.** |
| `@livekit/react-native-webrtc` | The native WebRTC implementation. **Required.** |

> [!IMPORTANT]
> Pin these versions — they are the line compatible with the SDK's
> `livekit-client` (`2.11.x`). Install all three in **your own app's root**.
> The call-related native modules ship **nested** inside the SDK — list them
> in `react-native.config.js` at your app root so autolinking finds them
> (autolinking only scans your app's direct dependencies):
>
> ```js
> module.exports = {
>   dependencies: {
>     '@livekit/react-native': {},
>     '@livekit/react-native-webrtc': {},
>     '@telecmi/react-native-callkeep': {},
>     'react-native-voip-push-notification': {},
>     // Firebase is Android-only (iOS uses VoIP push):
>     '@react-native-firebase/app': {platforms: {ios: null}},
>     '@react-native-firebase/messaging': {platforms: {ios: null}},
>   },
> };
> ```

---

## 2. Native engine initialization — automatic

The engine's Android audio module is initialized by the SDK's bundled
init provider **before `Application.onCreate`** — you write no native setup
code. (If your app also calls `LiveKitReactNative.setup(this)` manually —
e.g. it already integrates the engine directly — that's harmless; the same
initialization just runs again.)

Troubleshooting: if a call join ever throws
"Audio device module is not initialized", the init library didn't get
autolinked — check `npx react-native config` lists
`@telecmi/connle-video-native` with an Android project.

## 2b. MainActivity — nothing to do

Keep `MainActivity` completely stock. **Do not** add `showWhenLocked` /
`turnScreenOn` to the activity or manifest — a permanent flag makes any
screen-wake reveal the app instead of the lock screen. On a locked phone the
SDK shows its **own** full call surface (ring screen, then in-call video +
controls) over the keyguard, boots your app invisibly behind it, and hands
off to your UI when the user unlocks.

## 2c. Manifest permissions — none to add

Every permission the SDK needs merges in automatically from its library
manifests: media/network (`INTERNET`, `CAMERA`, `RECORD_AUDIO`,
`MODIFY_AUDIO_SETTINGS`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`,
`BLUETOOTH_CONNECT`) from `@telecmi/connle-video-native`, and everything
call-related (`FOREGROUND_SERVICE*`, `POST_NOTIFICATIONS`,
`USE_FULL_SCREEN_INTENT`, `MANAGE_OWN_CALLS`, `READ_PHONE_STATE`/
`READ_PHONE_NUMBERS`, `CALL_PHONE`, the `VoiceConnectionService`
declaration) from the bundled `@telecmi/react-native-callkeep`. Do not
re-declare any of them.

Runtime permission dialogs (mic, camera, notifications) are requested by
the SDK when a call is answered. **Also request camera + microphone once at
login**: permission dialogs cannot appear over a locked screen, so a
first-ever call answered from the lock screen would otherwise connect
without media (see §3).

## 3. Request runtime permissions

On Android, `CAMERA` and `RECORD_AUDIO` are runtime permissions — request them
**before** starting a call:

```js
import { PermissionsAndroid } from 'react-native';

async function ensureCallPermissions(video) {
  const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (video) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const res = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}
```

---

## 4. Build Configurations

### A. Gradle SDK requirements
If you hit a `minSdkVersion` error, ensure `minSdkVersion` is **24+** (Android 7.0) in your `android/build.gradle` (or `android/app/build.gradle`) — WebRTC requires this.

### B. ProGuard / R8 Rules (Release Builds)
If you compile release builds with minification enabled, add the following line to `android/app/proguard-rules.pro` to keep WebRTC modules from being stripped:

```proguard
-keep class org.webrtc.** { *; }
```

---

## 5. Build & run

```bash
npx react-native run-android
```

---

## 6. Usage

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { View, PermissionsAndroid } from 'react-native';
import { VideoView } from '@livekit/react-native';
import ConnleVideo from '@telecmi/connle-video-native';

export default function CallScreen() {
  const connleRef = useRef(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState(null);
  const [localVideoTrack,  setLocalVideoTrack]  = useState(null);

  useEffect(() => {
    const connle = new ConnleVideo(
      'wss://signal.connle.com',
      '<YOUR_TOKEN>',
      'wss://sfu.connle.com',
    );
    connleRef.current = connle;

    connle.onConnect(() => console.log('connected — ready for calls'));
    connle.onIncomingCall((data) => {
      console.log('incoming from', data.from);
      // connle.answer();  /  connle.reject();
    });

    connle.on('streamAdded',  (d) => { if (d.type === 'video') setRemoteVideoTrack(d.track); });
    connle.on('streamRemoved',(d) => { if (d.type === 'video') setRemoteVideoTrack(null); });
    connle.on('localStreamAdded', (d) => { if (d.type === 'video') setLocalVideoTrack(d.track); });

    connle.connect();
    return () => { connle.hangup(); connle.disconnect(); connle.removeAllListeners(); };
  }, []);

  // Before calling, request permissions, then:
  // connleRef.current.call('bob123', { audio: true, video: true });

  return (
    <View style={{ flex: 1 }}>
      {remoteVideoTrack && (
        <VideoView videoTrack={remoteVideoTrack} objectFit="cover" style={{ flex: 1 }} />
      )}
      {localVideoTrack && (
        <VideoView
          videoTrack={localVideoTrack}
          mirror
          style={{ position: 'absolute', top: 40, right: 16, width: 120, height: 160 }}
        />
      )}
    </View>
  );
}
```

For the full method & event list see the **[API reference](README.md#api-reference)**.

### Rendering video
Render the video track from `streamAdded` / `localStreamAdded` (the `data.track`
field) with **`<VideoView>`** from `@livekit/react-native`. Audio plays automatically.

### Audio routing & camera
The SDK manages the audio session automatically: **video calls default to the
loudspeaker, audio calls to the earpiece**. Override or flip the camera at runtime:

```js
connle.setSpeaker(true);    // loudspeaker
connle.setSpeaker(false);   // earpiece
connle.toggleSpeaker();
connle.switchCamera();      // flip front / back
```

---

## Inbound calls — FCM push (required)

On mobile, **incoming calls arrive via push only** (the socket invite is for
browsers). Android setup:

1. **Install Firebase** (step 1 above) and register your `applicationId` in the
   Firebase console; drop the downloaded `google-services.json` into
   `android/app/`.
2. **Gradle wiring** — in `android/build.gradle`:
   `classpath("com.google.gms:google-services:4.4.2")`, and at the END of
   `android/app/build.gradle`: `apply plugin: 'com.google.gms.google-services'`.
3. That's it for the SDK: the FCM token is fetched and registered with TeleCMI
   automatically on every successful `connect()`; `video_call` /
   `video_cancel` pushes are received and routed in every app state (the SDK
   registers its own background handler). Remove the registration with
   `connle.unregisterPush(cb)` **before sign-out**.

Coexistence: if `@telecmi/piopiy-native` (voice) is installed in the same app,
both SDKs share one FCM token and one background handler via the TeleCMI push
router — payloads route by `type`, nothing extra to configure.

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **No audio/video after answering** | `CAMERA` / `RECORD_AUDIO` not granted — request them at runtime before calling. |
| **`minSdkVersion` build error** | Set `minSdkVersion = 24` (or higher) in `android/build.gradle`. |
| **Release build crashes** | R8/ProGuard stripped WebRTC bindings. Add `-keep class org.webrtc.** { *; }` to `proguard-rules.pro`. |
| **Duplicate WebRTC classes at build time** | Use only `@livekit/react-native-webrtc`, not also the standalone `react-native-webrtc`. |
| **Media never connects** | Ensure the device has network access and `ACCESS_NETWORK_STATE` is in the manifest. |
| **No call audio in background** | Ensure `FOREGROUND_SERVICE` and `WAKE_LOCK` are added to your Manifest, and background service routing is set up. |

---

## License

MIT © [TeleCMI](https://telecmi.com)

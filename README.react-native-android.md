# Connle Video SDK — React Native Android Setup

**Platform:** 🤖 Android

> 🤖 **This is the Android guide.** Building for **iOS** or **Web / Electron**?
> → **[iOS guide](README.react-native-ios.md)** · **[Web & Electron guide](README.web.md)**

Use `connle-video-sdk` in a **bare React Native** Android app to make and receive
audio & video calls.

---

## Requirements

- **Node 20+** and **JDK 17**.
- **Android Studio** / Android SDK. A real device is best; the emulator can use
  your computer's camera/mic for basic testing.
- A Connle **token**, signalling URL, and media (SFU) URL.

---

## 1. Install the SDK and its native peers

```bash
npm install connle-video-sdk @livekit/react-native@2.8.0 @livekit/react-native-webrtc@^125.0.12
```

| Package | Why it's needed |
| :--- | :--- |
| `connle-video-sdk` | The Connle SDK (signalling + call control). |
| `@livekit/react-native` | LiveKit RN bindings: `registerGlobals()` + audio session. **Required.** |
| `@livekit/react-native-webrtc` | The native WebRTC implementation. **Required.** |

> [!IMPORTANT]
> Pin these versions — they are the line compatible with the SDK's
> `livekit-client` (`2.11.x`). Install all three in **your own app's root**.
> Android autolinking picks up the native modules automatically.

---

## 2. Manifest permissions

Add to `android/app/src/main/AndroidManifest.xml` (above `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
```

---

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
import ConnleVideo from 'connle-video-sdk';

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
Render the LiveKit track from `streamAdded` / `localStreamAdded` (the `data.track`
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

## Inbound calls while backgrounded (important)

Calls ring and connect while the app is in the **foreground**. Receiving a call
while the app is **backgrounded or killed** requires a high-priority **FCM push**
+ a **foreground service** (and a native call UI) — that integration is **not**
part of this SDK; add it on top for an always-on experience.

---

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

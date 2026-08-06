# Connle Video SDK — React Native iOS Setup

**Platform:** 📱 iOS

> 📱 **This is the iOS guide.** Building for **Android** or **Web / Electron**?
> → **[Android guide](README.react-native-android.md)** · **[Web & Electron guide](README.web.md)**

Use `@telecmi/connle-video` in a **bare React Native** iOS app to make and receive
audio & video calls.

---

## Requirements

- **Node 20+**.
- A **physical iOS device** is strongly recommended — the **iOS Simulator cannot**
  capture the camera/microphone for WebRTC. Always verify on real hardware.
- macOS with **Xcode 16+** and **CocoaPods**.
- A Connle **token**, signalling URL, and media (SFU) URL.

---

## 1. Install the SDK

One package — everything call-related (LiveKit WebRTC engine, CallKit
support, VoIP push) ships **with** the SDK, same model as
`@telecmi/piopiy-native`:

```bash
npm install @telecmi/connle-video
```

Because those native modules arrive *nested* under the SDK, tell React
Native's autolinking where they live. Create (or extend)
`react-native.config.js` in your app root:

```js
module.exports = {
  dependencies: {
    // Bundled with @telecmi/connle-video — autolinking only scans your app's
    // DIRECT dependencies, so list them here or calls will not work.
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
    '@telecmi/react-native-callkeep': {},
    'react-native-voip-push-notification': {},
  },
};
```

> [!IMPORTANT]
> Do **not** also install `react-native-callkeep` (upstream) or your own copies
> of the LiveKit packages — duplicates collide at the native level. If your app
> already carries any of them as direct dependencies, remove them.

---

## 2. CocoaPods setup

```bash
cd ios
pod install
cd ..
```

> [!WARNING]
> If `pod install` can't resolve `WebRTC-SDK`, raise the deployment target in
> `ios/Podfile` to **15.1+** (`platform :ios, '15.1'`) and re-run. If you hit a
> `Unicode Normalization … ASCII-8BIT` error, prefix the command with
> `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.

---

## 3. Configure `Info.plist`

Open `ios/<YourApp>/Info.plist` and add the camera + microphone usage strings
(iOS terminates the app without them) and the local-network usage string (needed
for full WebRTC candidate gathering on iOS 14+):

```xml
<key>NSCameraUsageDescription</key>
<string>$(PRODUCT_NAME) needs the camera for video calls</string>
<key>NSMicrophoneUsageDescription</key>
<string>$(PRODUCT_NAME) needs the microphone for calls</string>
<key>NSLocalNetworkUsageDescription</key>
<string>$(PRODUCT_NAME) needs local network access to establish media connections</string>
```

For calls that should keep running in the background, also add:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
</array>
```

---

## 4. Podfile — disable the New Architecture

The WebRTC native modules build most reliably with the **New Architecture
disabled**. Near the top of `ios/Podfile` (before the `target` block):

```ruby
ENV['RCT_NEW_ARCH_ENABLED'] = '0'
```

---

## 5. Known Xcode 26 / Apple Clang 21 build error (`fmt` / `consteval`)

On bleeding-edge toolchains (**Xcode 26 / Clang 21**) the build can fail on the
`fmt` pod with:
```
call to consteval function 'fmt::…' is not a constant expression
```

Add this to your `ios/Podfile` `post_install` block (re-applied on every
`pod install`):

```ruby
post_install do |installer|
  # ... keep the existing react_native_post_install(...) call ...

  fmt_base = File.join(__dir__, 'Pods', 'fmt', 'include', 'fmt', 'base.h')
  if File.exist?(fmt_base)
    original = File.read(fmt_base)
    patched  = original.gsub(/^#\s*define FMT_USE_CONSTEVAL 1\b/, '#  define FMT_USE_CONSTEVAL 0')
    if patched != original
      File.chmod(0644, fmt_base)        # fmt headers ship read-only (0444)
      File.write(fmt_base, patched)
      File.chmod(0444, fmt_base)
    end
  end
end
```

If the error persists from a stale cache, clear DerivedData:
```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/<YourApp>-*
```

---

## 6. Signing & run

1. Open the **`.xcworkspace`** (not `.xcodeproj`) in Xcode.
2. Select the app target → **Signing & Capabilities** → pick your **Team** and a
   unique **Bundle Identifier** (both required to deploy to a device).
3. Select your iPhone and **Run** — or `npx react-native run-ios --device`.

On the first call, iOS prompts for camera/microphone (and "find devices on your
local network") — **allow** them.

---

## 7. Usage

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { VideoView } from '@livekit/react-native';
import ConnleVideo from '@telecmi/connle-video';

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
      // connle.answer();  /  connle.reject();  -> bind to your UI
    });

    // Render remote + local video. `data.track` is the LiveKit track VideoView wants.
    connle.on('streamAdded',  (d) => { if (d.type === 'video') setRemoteVideoTrack(d.track); });
    connle.on('streamRemoved',(d) => { if (d.type === 'video') setRemoteVideoTrack(null); });
    connle.on('localStreamAdded', (d) => { if (d.type === 'video') setLocalVideoTrack(d.track); });

    connle.connect();
    return () => { connle.hangup(); connle.disconnect(); connle.removeAllListeners(); };
  }, []);

  // Make a call: connleRef.current.call('bob123', { audio: true, video: true });

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
field) with **`<VideoView>`** from `@livekit/react-native`. Audio plays
automatically — no component needed.

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

## Inbound calls — VoIP push + CallKit (required)

On mobile, **incoming calls arrive via VoIP push only** (the socket is for
browsers). The push wakes your app in any state — foreground, background, or
killed — and rings the native CallKit screen. Three one-time steps:

### a. Background modes + entitlement

`Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
  <string>remote-notification</string>
</array>
```

Add a `.entitlements` file with `aps-environment` (Xcode → Signing &
Capabilities → **+ Capability → Push Notifications** does this for you), and
make sure it is set for **both Debug and Release** configurations.

### b. AppDelegate wiring

iOS 13+ requires reporting a CallKit call synchronously inside the PushKit
callback. Copy the complete `AppDelegate.mm` from the example app
([example-rn/ios/ConnleVideoExample/AppDelegate.mm](example-rn/ios/ConnleVideoExample/AppDelegate.mm))
— it handles: PushKit registration, token forwarding (the SDK registers it
with TeleCMI automatically), CallKit report with the caller's name
(`from_name`), `video_cancel` dismissing the ringing call, and a native
ring-timeout backstop.

### c. Answer/End from the CallKit screen

The CallKit uuid **is** the server `call_id` — match them in your
`answerCall`/`endCall` listeners and call `connle.answer()` / `reject()`.
See the example's App.tsx for the complete pattern, including answering a
call that launched the app from killed state.

The device token registers automatically on every successful `connect()` and
is removed by `connle.unregisterPush(cb)` — **call that before sign-out**, or
the device keeps ringing for the signed-out user.

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **Black remote video / no media** | Running on the Simulator (no camera/mic). Use a real iPhone. |
| **No audio/video after answering** | Camera/mic permission denied — check Settings → your app. |
| **Media never connects (ICE timeout)** | Allow the "find devices on local network" prompt; ensure `NSLocalNetworkUsageDescription` is set. |
| **`pod install` fails on WebRTC-SDK / deployment target** | Set `platform :ios, '15.1'` and re-run `pod install --repo-update`. |
| **`fmt` / `consteval` compiler error (Xcode 26)** | Apply the `post_install` patch (step 5), clear DerivedData, rebuild. |
| **`Unicode Normalization` during `pod install`** | Prefix with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`. |
| **Duplicate WebRTC symbols at link time** | Use only `@livekit/react-native-webrtc`, not also the standalone `react-native-webrtc`. |

---

## License

MIT © [TeleCMI](https://telecmi.com)

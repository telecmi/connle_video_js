# Connle Video — React Native test app

**Platform:** 📱 iOS (iPhone) · 🤖 Android

A minimal bare React Native app for testing the local `connle-video-sdk` on a
real device — connect to signalling, place / receive **audio or video** calls,
and see remote + local video render with mute / camera / hang-up controls.

This app lives **inside** the SDK repo and consumes the SDK source directly from
`../src` via [`metro.config.js`](./metro.config.js) — there is no
`npm install connle-video-sdk`, and SDK source changes do not need a rebuild.

> Integrating into your **own** app instead? Follow the
> [iOS guide](../README.react-native-ios.md) or
> [Android guide](../README.react-native-android.md) — same steps, minus the
> metro wiring.

---

## Requirements

- **macOS with Xcode 16+** and a physical **iPhone** (the iOS Simulator cannot
  capture camera/mic for WebRTC — you must use a real device).
- **Node 20+**, Yarn, and **CocoaPods** (via Bundler, below).
- A Connle **token** (identifies the calling user) and your signalling + media
  (SFU) URLs. To test a real call you need **two** tokens / two devices.

## What's already set up

This is a **complete, generated** project — no `react-native init` needed.
Already in place:

- `ios/` + `android/` native projects (RN 0.76.9), root component `ConnleVideoExample`
- iOS camera/mic usage strings in `Info.plist`; Android permissions in the manifest
- The **Xcode 26 / Clang 21 `fmt` patch** + New-Architecture-off config in
  [`ios/Podfile`](./ios/Podfile), so the WebRTC native modules build cleanly

On the machine where this was set up, **`node_modules` and `ios/Pods` are already
installed** — skip straight to [Run on your iPhone](#2-run-on-your-iphone).

## 1. Setup (only needed on a fresh clone)

`node_modules/` and `ios/Pods/` are git-ignored, so after a fresh clone:

```bash
# a) install the SDK runtime deps (from the repo root)
cd .. && npm install && cd example-rn

# b) install the app's JS deps (RN + @livekit/react-native[-webrtc])
yarn install

# c) install iOS pods (applies the fmt patch; UTF-8 avoids a CocoaPods crash)
cd ios
bundle install
RCT_NEW_ARCH_ENABLED=0 LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install
cd ..
```

> Changed SDK source in `../src`? Reload Metro with
> `yarn start --reset-cache`. Run `npm run build-node` only when you need to
> refresh the published/built `lib/` output.

## 2. Run on your iPhone

1. Plug in the iPhone and tap **Trust** when prompted.
2. Open the workspace in Xcode:
   ```bash
   xed ios/ConnleVideoExample.xcworkspace
   ```
   In **Signing & Capabilities**, pick your Team (required to run on a real
   device). The Bundle Identifier is already set to `com.telecmi.connlyrnexample`
   — change it only if it clashes with another app on your account.
3. Select your iPhone as the run target and press **Run** — or from the CLI:
   ```bash
   yarn start                        # Metro, in one terminal
   npx react-native run-ios --device # in another terminal
   ```

## 3. Make a call

1. Enter your **signalling URL**, **token**, and **media URL**, then tap
   **Connect** → status shows *"Connected — ready for calls"*.
2. **Outbound:** type the target user id, toggle **Video call**, tap **Call**.
3. **Inbound:** when someone calls your token, the green **Incoming call**
   banner appears → tap **Answer**.
4. Once media connects you'll see remote video (and your local preview, top
   right). Use **Mute** / **Camera** / **Hang up**. Every SDK event shows in the
   **Event log**.

> iOS shows the camera/mic permission prompt on the **first** call. Allow it, or
> media will fail.

---

## Run on Android

The generated Android project works too. Add these to
`android/app/src/main/AndroidManifest.xml` (above `<application>`):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

```bash
yarn start        # Metro, in one terminal
yarn android      # build & run on a device/emulator (another terminal)
```

The app requests CAMERA / RECORD_AUDIO at runtime — grant them when prompted.

---

## Notes & limitations

- **Two participants:** a call needs two users — connect a second device with a
  different token, or call an existing Connle user.
- **Foreground only:** receiving calls while the app is backgrounded/killed needs
  CallKit + VoIP push (iOS) or a high-priority FCM push + foreground service
  (Android) — not included here.
- **Screen share** (`shareScreen()`) needs extra native setup on mobile (iOS
  Broadcast Extension, Android foreground service) and is not wired into this
  test UI.

## Troubleshooting

- **`Unable to resolve module connle-video-sdk`** — make sure the app is using
  [`metro.config.js`](./metro.config.js), install deps from the repo root
  (`cd .. && npm install`), and restart Metro with a clean cache:
  `yarn start --reset-cache`.
- **Black remote video / no media** — confirm camera+mic permission was granted
  (iOS Settings → the app), and that you're on a **real iPhone** (the Simulator
  can't capture media).
- **Pod install fails / `Unicode Normalization … ASCII-8BIT`** — use the Bundler
  flow above and keep the `LANG`/`LC_ALL` prefix.
- **Duplicate WebRTC symbols at link time** — make sure the app pulls in only
  `@livekit/react-native-webrtc`, not also the standalone `react-native-webrtc`.

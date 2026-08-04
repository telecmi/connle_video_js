# Connle Video SDK — Web & Electron

**Platforms:** 🌐 Web / Browser · 💻 Electron (Desktop)

> 🌐 **This is the Web & Electron guide.** Building a **React Native** app instead?
> → **[iOS guide](README.react-native-ios.md)** · **[Android guide](README.react-native-android.md)**

Use `@telecmi/connle-video` in a browser or Electron app to make and receive audio &
video calls.

> The **call API** (methods & events) is the same on every platform — see the
> **[API reference](README.md#api-reference)**. This guide covers the browser /
> Electron setup: install, secure context, and rendering video.

---

## Requirements

- A modern browser (Chrome, Edge, Firefox, or Safari) or an **Electron** desktop app.
- **HTTPS.** Browsers only grant camera/microphone access (`getUserMedia`) on a
  **secure origin**: `https://…` in production, or `http://localhost` during
  development. (Electron apps using `file://` or custom schemes are exempt.)
- A Connle **token**, signalling URL, and media (SFU) URL.

---

## 1. Install

```bash
npm install @telecmi/connle-video
```

> [!NOTE]
> On Web and Electron you install **only** `@telecmi/connle-video`. The
> `@livekit/react-native*` packages are for React Native — do not install them here.

`import ConnleVideo from '@telecmi/connle-video'` automatically resolves the **browser
build** (the package's `main` entry); the browser's built-in WebRTC is used.

> [!TIP]
> **Electron apps:** handle camera/microphone permission requests in your main
> process with `session.defaultSession.setPermissionRequestHandler()` so the
> renderer can access the devices.

---

## 2. Initialize and connect

```js
import ConnleVideo from '@telecmi/connle-video';

const connle = new ConnleVideo(
  'wss://signal.connle.com',  // signalling URL
  '<YOUR_TOKEN>',             // auth token
  'wss://sfu.connle.com'      // media / SFU URL
);

connle.onConnect(()  => console.log('signalling connected — ready for calls'));
connle.onError((err) => console.error('error:', err));

connle.connect();
```

---

## 3. Media in the browser

- **Permission prompt.** The browser asks for camera/mic permission on the
  **first** call. If denied, media fails with an `error` event.
- **Autoplay policy.** Browsers block media that didn't start from a user action —
  always start calls from a **click/tap handler** (a "Call" button), not
  automatically on page load.

**Audio** plays automatically. **Video** you render yourself from the track events:

```js
const remoteVideo = document.getElementById('remoteVideo'); // <video autoplay playsinline>
const localVideo  = document.getElementById('localVideo');  // <video autoplay playsinline muted>

// Remote video track
connle.on('streamAdded', (data) => {
  if (data.type === 'video') {
    remoteVideo.srcObject = new MediaStream([data.stream]); // data.stream = MediaStreamTrack
  }
});

// Your own camera preview
connle.on('localStreamAdded', (data) => {
  if (data.type === 'video') {
    localVideo.srcObject = new MediaStream([data.stream]);
  }
});
```

---

## 4. Make and receive calls

```js
// Outbound
connle.call('bob123', { audio: true, video: true }, (ack) => {
  if (ack?.code === 100) console.log('ringing…');
});

// Inbound
connle.onIncomingCall((data) => {
  console.log('incoming from', data.from);  // show an Answer / Reject UI
});
connle.answer();   // on Answer
connle.reject();   // on Reject
```

For the complete list of methods (`mute`, `pause`/`play`, `shareScreen`,
`hangup`, …) and events, see the **[API reference](README.md#api-reference)**.

---

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| **No camera/mic prompt / `getUserMedia` fails** | You're not on a secure origin. Serve over **HTTPS** (or use `http://localhost`). |
| **First call has no media** | Browser autoplay policy — start the call from a user **click**, not automatically. |
| **Permission denied** | Camera/microphone blocked. Check the browser's site permissions. |
| **Remote video is black** | Make sure you set `video.srcObject = new MediaStream([data.stream])` from the `streamAdded` event. |

---

## License

MIT © [TeleCMI](https://telecmi.com)

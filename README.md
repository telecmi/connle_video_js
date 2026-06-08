# Connle Video SDK

**Platforms:** 🌐 Web · 💻 Electron · 📱 iOS · 🤖 Android

Make and receive **1‑to‑1 audio and video calls** from JavaScript — the same API
on the **Web**, **Electron**, and **React Native** (iOS & Android). Supports mute,
camera on/off, loudspeaker/earpiece, flip camera, and screen share.

## Pick your platform

Installation and native setup differ per platform — follow the guide for yours.
The **call API is identical** everywhere; it's in the [API reference](#api-reference) below.

| Platform | Setup guide |
| :--- | :--- |
| 🌐 **Web & Electron** | **→ [Web & Electron guide](README.web.md)** |
| 📱 **React Native iOS** | **→ [iOS guide](README.react-native-ios.md)** |
| 🤖 **React Native Android** | **→ [Android guide](README.react-native-android.md)** |

```bash
npm install connle-video-sdk
```

> [!NOTE]
> **React Native** additionally needs the native peers `@livekit/react-native`
> and `@livekit/react-native-webrtc` — see the
> [iOS guide](README.react-native-ios.md) and [Android guide](README.react-native-android.md).
> **Web & Electron** users install only `connle-video-sdk`.

> [!TIP]
> A complete, runnable React Native example app (inbound + outbound audio/video
> calls, with mute / camera / speaker / flip-camera controls) lives in
> [`example-rn/`](example-rn).

---

## Quick Start Example

A complete example — create the client, connect, place/answer calls, and handle
media. This works on both Web and React Native.

```javascript
import ConnleVideo from 'connle-video-sdk';

// 1. Create the client
const connle = new ConnleVideo(
  'wss://signal.connle.com', // signalling URL
  '<YOUR_TOKEN>',            // auth token (identifies this user)
  'wss://sfu.connle.com'     // media / SFU URL (optional)
);

// 2. Signalling callbacks
connle.onConnect(()  => console.log('signalling connected — ready for calls'));
connle.onError((err) => console.error('error:', err));

// 3. Inbound calls
connle.onIncomingCall((data) => {
  console.log('incoming call from', data.from, '— media:', data.media);
  connle.answer();   // or connle.reject()
});

// 4. Media (LiveKit) events
connle.on('connected',    (d) => console.log('media connected', d.user_id));
connle.on('streamAdded',  (d) => {
  // d.track  = LiveKit track  → render with <VideoView> on React Native
  // d.stream = MediaStreamTrack → attach to a <video> element on the web
  if (d.type === 'video') renderRemoteVideo(d);
});

// 5. Open the signalling connection
connle.connect();

// 6. Make an outbound call (after onConnect fires)
connle.call('bob123', { audio: true, video: true }, (ack) => {
  console.log('call ack:', ack);   // ack.code === 100 means ringing
});
```

---

## Initialization

Create a `ConnleVideo` instance. This is the same on every platform.

```javascript
import ConnleVideo from 'connle-video-sdk';

const connle = new ConnleVideo(serverUrl, token, mediaUrl);
connle.connect();
```

#### Constructor arguments
| Argument | Description | Type | Required |
| :--- | :--- | :--- | :--- |
| `serverUrl` | Signalling WebSocket URL (e.g. `wss://signal.connle.com`). | string | ✅ |
| `token` | Auth token that identifies the connecting user. | string | ✅ |
| `mediaUrl` | Media / SFU WebSocket URL (e.g. `wss://sfu.connle.com`). Uses the default if omitted. | string | optional |

---

## API Reference

> ✅ The methods and events below are **identical on Web and React Native** — both
> platform guides link back here, so the API lives in one place.

### Methods

#### Connection

##### `connect()`
Opens the signalling connection. Call once after creating the instance.

##### `disconnect()`
Closes the signalling connection.

#### Call control

##### `call(userId, media, callback)`
Places an outbound call.
- **`userId`**: the target user's id (string).
- **`media`**: `{ audio: boolean, video: boolean }` — what to publish.
- **`callback`**: receives the server ack. `ack.code === 100` means the call is ringing.
  ```javascript
  connle.call('bob123', { audio: true, video: true }, (ack) => { /* … */ });
  ```

##### `answer(callback)`
Answers the current incoming call and connects media.

##### `reject(callback)`
Rejects the current incoming call.

##### `hangup(callback)`
Ends the active call.

##### `cancelOutgoingCall(callback)`
Cancels a still-ringing outbound call (before it's answered).

##### `onCall()`
Returns whether a media session is currently connected.
- **Returns**: `boolean`

#### Microphone

##### `mute()` / `unmute()` / `toggleAudio()`
Mute, unmute, or toggle the local microphone.

#### Camera

##### `pause()` / `play()` / `toggleVideo()`
Turn the local camera **off** (`pause`), **on** (`play`), or toggle it.

#### Mobile audio & camera · _React Native only_

##### `setSpeaker(on)` / `toggleSpeaker()`
Route call audio to the **loudspeaker** (`true`) or **earpiece** (`false`).
On the **Web** this is a safe no-op (the browser handles routing).

##### `switchCamera()`
Flip between the **front** and **back** camera. No-op on most web devices (one camera).

#### Screen share

##### `shareScreen()` / `stopScreenShare()` / `toggleScreenShare()`
Start / stop / toggle screen sharing.
> On React Native this needs extra native setup (iOS Broadcast Extension,
> Android foreground service) and is not enabled by the JS SDK alone.

#### Messaging

##### `sendMessage(content, callback)`
Sends a custom message to the peer over the signalling channel.

#### Signalling callbacks

Register a single handler for each signalling event:

| Method | Fires when |
| :--- | :--- |
| `onConnect(cb)` | The **signalling** socket connects. |
| `onDisconnect(cb)` | The signalling socket disconnects. |
| `onIncomingCall(cb)` | Another user calls you. Payload includes `from`, `media`, `call_id`. |
| `onAnswered(cb)` | Your outbound call is answered by the remote side. |
| `onEnded(cb)` | The call ends. |
| `onStatus(cb)` | General call / status updates. |
| `onError(cb)` | An error occurs. Payload: `{ code, message }`. |
| `onMessage(cb)` | A custom message is received. |

### Event Handlers (media & in-call)

The media layer is event-driven. Listen with `.on(eventName, callback)`.

#### Connection (media room)
* **`connected`** — the LiveKit media room is joined. Payload: `{ connected: true, user_id }`.
* **`disconnected`** — the media room is left. Payload: `{ connected: false, user_id }`.
* **`reconnecting`** / **`reconnected`** — media reconnection in progress / restored.

#### Participants
* **`userConnected`** — a remote user joined. Payload: `{ connected: true, user_id }`.
* **`userDisconnected`** — a remote user left. Payload: `{ connected: false, user_id }`.

#### Media tracks
* **`streamAdded`** — a remote track was subscribed.
  * **Payload**: `{ type, track, stream, user_id, source }`
    * `type` — `'audio'` | `'video'`
    * `track` — the LiveKit track → pass to `<VideoView>` on React Native
    * `stream` — the raw `MediaStreamTrack` → attach to a `<video>` element on the web
    * `source` — `'audio'` | `'video'` | `'screen'`
* **`streamRemoved`** — a remote track was unsubscribed. Payload: `{ type, track, user_id, source }`.
* **`localStreamAdded`** / **`localStreamRemoved`** — your own track was published / unpublished (same payload shape).
* **`mediaStarted`** / **`mediaStopped`** — a track was published / unpublished by a participant.

#### In-call state
* **`muted`** / **`unmuted`** — microphone muted / unmuted. Payload: `{ user_id, … }`.
* **`paused`** / **`play`** — a video track was paused / resumed.
* **`speaking`** — a participant is speaking. Payload: `{ user_id, level }`.
* **`screenShared`** / **`screenUnshared`** — screen share started / stopped.
* **`speakerChanged`** — audio output switched (loudspeaker ⇄ earpiece). _React Native._
* **`cameraSwitched`** — front/back camera flipped. _React Native._
* **`dataReceived`** — data received over the data channel.
* **`error`** — a media error occurred. Payload: `{ code, message }`.

---

## License

MIT © [TeleCMI](https://telecmi.com)

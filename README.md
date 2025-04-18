# ConnleVideo SDK Developer Guide

## Installation

Install **ConnleVideo** via NPM:

```bash
npm install connlevideo
```

*Or use your preferred package manager, such as:*  
```bash
yarn add connlevideo
```

---

## Import and Initialization

In your JavaScript/TypeScript file:

```js
import ConnleVideo from 'connlevideo';

const serverUrl = 'https://your-server.com';
const token = 'YOUR_JWT_TOKEN';
const mediaUrl = 'https://your-media-url'; // Optional. Uses default if not provided.

// Create an instance of ConnleVideo
const connleai = new ConnleVideo(serverUrl, token, mediaUrl);

// Establish the connection
connleai.connect();
```

---

## Event-Based Callbacks

### 1. `connleai.onConnect(callback)`
Fires after a successful connection.
```js
connleai.onConnect((data) => {
  console.log('Connected:', data);
});
```

### 2. `connleai.onDisconnect(callback)`
Triggered on disconnection.
```js
connleai.onDisconnect((data) => {
  console.log('Disconnected:', data);
});
```

### 3. `connleai.onIncomingCall(callback)`
Fires when another user initiates a call.
```js
connleai.onIncomingCall((data) => {
  console.log('Incoming call:', data);
});
```

### 4. `connleai.onAnswered(callback)`
Triggered when the call is answered.
```js
connleai.onAnswered((data) => {
  console.log('Call answered:', data);
});
```

### 5. `connleai.onEnded(callback)`
Fires when the call ends.
```js
connleai.onEnded((data) => {
  console.log('Call ended:', data);
});
```

### 6. `connleai.onMessage(callback)`
Fires when a chat or custom message is received.
```js
connleai.onMessage((data) => {
  console.log('Received message:', data);
});
```

### 7. `connleai.onStatus(callback)`
Handles general status updates.
```js
connleai.onStatus((data) => {
  console.log('Status update:', data);
});
```

### 8. `connleai.onError(callback)`
Triggered on error events.
```js
connleai.onError((error) => {
  console.error('ConnleVideo error:', error);
});
```

---

## Making and Receiving Calls

### Make a Call
```js
connleai.call('bob123', { audio: true, video: true }, (ack) => {
  console.log('Call initiated:', ack);
});
```

### Handle Incoming Calls
```js
connleai.onIncomingCall((callData) => {
  connleai.answer((ack) => {
    console.log('Call answered:', ack);
  });
});
```

### Reject or Hangup
```js
connleai.reject(callData.call_id, (ack) => {
  console.log('Call rejected:', ack);
});

connleai.hangup();
```

---

## Managing Audio and Video

```js
// Microphone control
connleai.mute();
connleai.unmute();
connleai.toggleAudio();

// Camera control
connleai.pause();
connleai.play();
connleai.toggleVideo();
```

### Screen Sharing
```js
connleai.shareScreen();
connleai.stopScreenShare();
connleai.toggleScreenShare();
```

---

## Messaging (Optional)

### Send a Message
```js
connleai.sendMessage({ text: 'Hello world' }, (ack) => {
  console.log('Message sent:', ack);
});
```

### Receive a Message
```js
connleai.onMessage((data) => {
  console.log('Received message:', data);
});
```

---

## Core Events

```js
connleai.on('eventName', (data) => {
  console.log('Received event:', data);
});
```

| Event Name                | Description                                  |
|---------------------------|----------------------------------------------|
| `connected`               | Session successfully connected.              |
| `disconnected`            | Session disconnected.                        |
| `userConnected`           | Remote user joined the call.                |
| `userDisconnected`        | Remote user left the call.                  |
| `muted` / `unmuted`       | Microphone muted or unmuted.                |
| `paused` / `play`         | Video paused or resumed.                    |
| `mediaStarted` / `mediaStopped` | Media stream started or stopped.          |
| `streamAdded` / `streamRemoved` | Remote media track added/removed.         |
| `localStreamAdded` / `localStreamRemoved` | Local track added or removed.        |
| `error`                   | Error encountered (permissions, etc.).      |

---

## Minimal Example

```js
import ConnleVideo from 'connlevideo';

function initCall() {
  const connleai = new ConnleVideo(
    'https://your-server.com',
    'YOUR_JWT_TOKEN',
    'https://your-media-url'
  );

  connleai.connect();

  connleai.onIncomingCall((callData) => {
    connleai.answer();
  });

  document.getElementById('callBtn').onclick = () => {
    connleai.call('anotherUser', { audio: true, video: true }, (ack) => {
      console.log('Call started:', ack);
    });
  };

  document.getElementById('hangupBtn').onclick = () => {
    connleai.hangup();
  };

  connleai.on('error', (err) => {
    console.error('ConnleAI Error:', err);
  });
}

initCall();
```

---

## Final Notes

- **Permissions**: Ensure camera/mic access is granted.
- **Screen Sharing**: Users must approve screen capture requests.
- **Autoplay**: Some browsers require user interaction before audio/video playback begins.
- **Token Expiry**: Always use fresh tokens if you experience reconnection issues.

---


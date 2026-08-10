/**
 * Connle Video — React Native test app.
 *
 * Flow:
 *   1. Enter the signalling URL, your token, and the media (SFU) URL, then tap
 *      "Connect" → the SDK opens the signalling socket.
 *   2. Outbound: type the target user id, toggle Video call, tap "Call".
 *   3. Inbound: when someone calls your token the green banner appears → "Answer".
 *   4. Once media connects, remote + local video render via <RTCView> and
 *      audio plays automatically through the device speaker/earpiece.
 *
 * Video rendering uses @livekit/react-native-webrtc's RTCView with the
 * MediaStream provided by the full livekit-client Track object.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {MediaStream as RNMediaStream, RTCView} from '@livekit/react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules} from 'react-native';

// CallKeep: only usable when its NATIVE module is compiled into this binary —
// a stale build without it must degrade to in-app ringing, not crash.
// (The fork's index.d.ts is not a proper module, hence the untyped require.)
const RNCallKeep: any = NativeModules.RNCallKeep
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@telecmi/react-native-callkeep').default
  : null;
import ConnleVideo from 'connle-video-sdk';

type CallState = 'idle' | 'incoming' | 'outgoing' | 'active';

// Production endpoints. For LOCAL testing point these at the dev machine
// (e.g. server 'ws://<mac-ip>:2029', REST 'http://<mac-ip>:6001') — the
// device must be on the same Wi-Fi.
const DEFAULT_SERVER = 'wss://signal.connle.com';
const DEFAULT_MEDIA  = 'wss://sfu.connle.com';
// TeleCMI REST — used for /agent/login (email+password → token). The SDK's
// push registration uses its own production default; set PUSH_REST only to
// override it (e.g. local testing).
const REST_BASE = 'https://api.connle.com';
const PUSH_REST: string | undefined = undefined;

function safeStringify(value: any): string {
  try {
    return JSON.stringify(value, (key, item) =>
      /token/i.test(key) ? '[redacted]' : item,
    );
  } catch {
    return String(value);
  }
}

function mediaHasVideo(media: any): boolean {
  if (typeof media === 'boolean') return media;
  if (typeof media === 'number') return media !== 0;
  if (typeof media === 'string') {
    const normalized = media.trim().toLowerCase();
    return ['true', '1', 'yes', 'video', 'audio_video', 'audio-video'].includes(normalized);
  }
  if (media && typeof media === 'object') {
    return mediaHasVideo(media.video ?? media.type ?? media.media ?? media.kind);
  }
  return false;
}

function getTrackStreamURL(videoTrack: any): string {
  const mediaStream = videoTrack?.mediaStream;
  if (typeof mediaStream?.toURL === 'function') {
    return mediaStream.toURL();
  }

  const mediaStreamTrack = videoTrack?.mediaStreamTrack;
  if (!mediaStreamTrack) return '';

  try {
    return new RNMediaStream([mediaStreamTrack]).toURL();
  } catch {
    return '';
  }
}

function TrackView({
  videoTrack,
  mirror = false,
  style,
}: {
  videoTrack: any;
  mirror?: boolean;
  style: any;
}): React.JSX.Element {
  const [streamURL, setStreamURL] = useState('');

  useEffect(() => {
    const updateStreamURL = () => setStreamURL(getTrackStreamURL(videoTrack));
    updateStreamURL();
    const timer = setInterval(updateStreamURL, 250);
    return () => clearInterval(timer);
  }, [videoTrack]);

  if (!streamURL) {
    return (
      <View style={[style, styles.placeholder]}>
        <Text style={styles.placeholderText}>Preparing video…</Text>
      </View>
    );
  }

  return (
    <RTCView
      streamURL={streamURL}
      objectFit="cover"
      mirror={mirror}
      style={style}
    />
  );
}

async function requestMediaPermissions(video: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (video) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    const res = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(res).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

export default function App(): React.JSX.Element {
  const connleRef = useRef<ConnleVideo | null>(null);

  // Form fields
  const [serverUrl,  setServerUrl]  = useState(DEFAULT_SERVER);
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [mediaUrl,   setMediaUrl]   = useState(DEFAULT_MEDIA);

  // CallKit bookkeeping: uuid of the call currently shown by CallKit (equals
  // the server call_id), and an Answer tap that arrived before the SDK had the
  // incoming call (push-launched app still logging in).
  const callkitUuidRef = useRef<string | null>(null);
  const pendingAnswerRef = useRef<string | null>(null);
  const autoLoginTriedRef = useRef(false);
  const connectWithStoredRef = useRef<((t: string, e: string, p: string) => void) | null>(null);

  // Remember the last-used login so it survives app restarts (test app only —
  // a real app should keep credentials in the platform keychain, not storage).
  // When both values exist, log in automatically — a VoIP push that launches
  // the killed app must reach 'connected' without anyone typing.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('example.email'),
      AsyncStorage.getItem('example.password'),
      AsyncStorage.getItem('example.token'),
    ])
      .then(([e, pw, tok]: Array<string | null>) => {
        if (e) setEmail(e);
        if (pw) setPassword(pw);
        if (autoLoginTriedRef.current) return;
        autoLoginTriedRef.current = true;
        if (tok) connectWithStoredRef.current?.(tok, e ?? '', pw ?? '');
        else if (e && pw) connectWithRef.current?.(e, pw);
      })
      .catch(() => {});
  }, []);
  const [targetUser, setTargetUser] = useState('');
  const [wantVideo,  setWantVideo]  = useState(true);

  // Connection / call state
  const [connected,  setConnected]  = useState(false);
  const [status,     setStatus]     = useState('Not connected');
  const [callState,  setCallState]  = useState<CallState>('idle');
  const [incoming,   setIncoming]   = useState<any>(null);
  const [peerId,     setPeerId]     = useState<string | null>(null);
  const [muted,      setMuted]      = useState(false);
  const [cameraOff,  setCameraOff]  = useState(false);
  const [speakerOn,  setSpeakerOn]  = useState(false);
  const [callHasVideo, setCallHasVideo] = useState(false);

  const incomingRef = useRef<any>(null);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);

  // Track objects for RTCView rendering (livekit-client Track, not raw MediaStreamTrack)
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<any>(null);
  const [localVideoTrack,  setLocalVideoTrack]  = useState<any>(null);

  const [logs, setLogs] = useState<string[]>([]);

  const log = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`[ConnleRN] ${line}`);
    setLogs(prev => [`${ts}  ${line}`, ...prev].slice(0, 200));
  }, []);

  // Route the SDK's internal diagnostics ([push] token/register lines) into
  // the on-screen event log too — debuggable straight on the device.
  useEffect(() => {
    (globalThis as any).__connleLog = (line: string) => {
      console.log('[connle-video]', line);
      const ts = new Date().toLocaleTimeString();
      setLogs(prev => [`${ts}  ${line}`, ...prev].slice(0, 200));
    };
  }, []);

  const resetCall = useCallback(() => {
    setCallState('idle');
    setIncoming(null);
    setPeerId(null);
    setMuted(false);
    setCameraOff(false);
    setSpeakerOn(false);
    setCallHasVideo(false);
    setRemoteVideoTrack(null);
    setLocalVideoTrack(null);
  }, []);

  const wireEvents = useCallback((connleai: ConnleVideo) => {
    // ---- Signalling ----
    connleai.onConnect(() => {
      setConnected(true);
      setStatus('Connected — ready for calls');
      log('onConnect: signalling up');
    });
    connleai.onDisconnect(() => {
      setConnected(false);
      setStatus('Disconnected');
      resetCall();
      log('onDisconnect');
    });
    connleai.onError((e: any) => log(`error: ${safeStringify(e)}`));
    connleai.onStatus((d: any) => log(`status: ${safeStringify(d)}`));

    // ---- Inbound ----
    connleai.onIncomingCall((d: any) => {
      const from = d?.from_name ?? d?.from ?? d?.userid ?? d?.user_id ?? d?.caller ?? 'Unknown';
      const hasVideo = mediaHasVideo(d?.media);
      // WhatsApp model: the native notification rings outside the app;
      // INSIDE the app this banner is the incoming-call UI — both point at
      // the same call, and tapping the notification body lands here with
      // Answer/Reject visible.
      setCallState('incoming');
      setIncoming(d);
      setPeerId(String(from));
      setCallHasVideo(hasVideo);
      setStatus(`Incoming ${hasVideo ? 'video' : 'audio'} call from ${from}`);
      log(`onIncomingCall: ${safeStringify(d)}`);
      // Push-delivered calls ring natively via CallKit (call_id == uuid).
      const cid = String(d?.call_id ?? '').toLowerCase();
      if (cid) callkitUuidRef.current = cid;
      // The user already tapped Answer on the CallKit screen while we were
      // still logging in / connecting — complete the answer now.
      if (cid && pendingAnswerRef.current === cid) {
        pendingAnswerRef.current = null;
        log('completing CallKit answer that arrived before the SDK was ready');
        connleai.answer((ack: any) => log(`answer ack: ${safeStringify(ack)}`));
      }
    });

    connleai.onAnswered((d: any) => {
      setStatus('Answered — connecting media…');
      // Leave the ringing banner NOW — the call screen shows 'connecting'
      // until media lands (otherwise the UI looks like it is still ringing).
      setCallState(prev => (prev === 'incoming' ? 'active' : prev));
      log(`onAnswered: ${safeStringify(d)}`);
    });

    // Ring dismissed remotely: caller cancelled, or this user answered /
    // rejected on another device. Clear the banner and the native call UI.
    connleai.on('callCancelled', (d: any) => {
      log(`callCancelled: ${safeStringify(d)}`);
      resetCall();
    });

    connleai.onEnded((d: any) => {
      resetCall();
      setStatus('Connected — ready for calls');
      log(`onEnded: ${safeStringify(d)}`);
    });

    // ---- Media room (LiveKit) ----
    connleai.on('connected', (d: any) => {
      setCallState('active');
      setStatus('In call');
      log(`media connected: ${d?.user_id ?? ''}`);
      // Native call state (active/unmute/dismiss) is handled inside the SDK.
    });
    connleai.on('disconnected', (d: any) => {
      resetCall();
      log(`media disconnected: ${safeStringify(d)}`);
    });
    connleai.on('userConnected', (d: any) => {
      setPeerId(prev => prev ?? d?.user_id ?? null);
      log(`userConnected: ${d?.user_id ?? ''}`);
    });
    connleai.on('userDisconnected', (d: any) => {
      setRemoteVideoTrack(null);
      log(`userDisconnected: ${d?.user_id ?? ''}`);
    });

    // ---- Remote tracks ----
    // `d.track` = full livekit-client Track object → render via RTCView
    // `d.stream` = raw MediaStreamTrack → kept for web compat, not used here
    connleai.on('streamAdded', (d: any) => {
      if (d?.type === 'video') {
        setRemoteVideoTrack(d.track ?? null);
        setCallHasVideo(true);
        if (d?.user_id) setPeerId(String(d.user_id));
      }
      // Audio plays automatically via @livekit/react-native + AudioSession
      log(`streamAdded: ${d?.type} source=${d?.source} from ${d?.user_id ?? ''} track=${d?.track_sid ?? d?.track?.sid ?? ''} stream=${!!d?.track?.mediaStream}`);
    });
    connleai.on('streamRemoved', (d: any) => {
      if (d?.type === 'video') setRemoteVideoTrack(null);
      log(`streamRemoved: ${d?.type} from ${d?.user_id ?? ''}`);
    });

    // ---- Local tracks ----
    // `d.track` = full livekit-client Track object → render via RTCView
    connleai.on('localStreamAdded', (d: any) => {
      if (d?.type === 'video') {
        setLocalVideoTrack(d.track ?? null);
        setCameraOff(false);
      }
      log(`localStreamAdded: ${d?.type}`);
    });
    connleai.on('cameraSwitched', (d: any) => {
      log(`cameraSwitched: ${safeStringify(d)}`);
    });

    connleai.on('localStreamRemoved', (d: any) => {
      if (d?.type === 'video') setLocalVideoTrack(null);
      log(`localStreamRemoved: ${d?.type}`);
    });
  }, [log, resetCall]);

  // CallKit events — Answer/End tapped on the native (lock-screen) call UI.
  // The CallKit uuid IS the server call_id (set in the AppDelegate), so we can
  // match it against the SDK's incoming call.
  useEffect(() => {
    if (!RNCallKeep) {
      log('RNCallKeep native module missing — REBUILD the app from Xcode (old binary); CallKit disabled, in-app ringing only');
      return;
    }
    // CallKeep setup is owned by the SDK (self-managed account) — a second
    // setup here with different options corrupts the persisted phone account.

    // Answer/End taps on the native screen are handled INSIDE the SDK (it
    // answers/rejects and brings the app forward on Android). The app only
    // tracks the uuid for its own state-sync reports.
    RNCallKeep.addEventListener('answerCall', ({callUUID}: {callUUID: string}) => {
      const uuid = String(callUUID).toLowerCase();
      log(`native answer observed: ${uuid}`);
      callkitUuidRef.current = uuid;
    });

    RNCallKeep.addEventListener('endCall', ({callUUID}: {callUUID: string}) => {
      const uuid = String(callUUID).toLowerCase();
      log(`native end observed: ${uuid}`);
      if (callkitUuidRef.current === uuid) callkitUuidRef.current = null;
      resetCallRef.current?.();
    });

    return () => {
      RNCallKeep.removeEventListener('answerCall');
      RNCallKeep.removeEventListener('endCall');
      try {
        connleRef.current?.hangup();
        connleRef.current?.disconnect();
        connleRef.current?.removeAllListeners();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Handlers ----
  // Login via connly_rest (email+password → token), then connect the SDK with
  // that token — the same token also authorizes the push registration.
  const connectWith = useCallback(async (emailV: string, passwordV: string) => {
    if (!serverUrl.trim() || !emailV.trim() || !passwordV.trim()) {
      Alert.alert('Missing info', 'Enter the signalling URL, email and password.');
      return;
    }

    let sdkToken: string;
    try {
      setStatus('Logging in…');
      log(`POST ${REST_BASE}/agent/login (${emailV.trim()})`);
      const resp = await fetch(`${REST_BASE}/agent/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email_id: emailV.trim(), password: passwordV}),
      });
      const data = await resp.json();
      if (data?.code !== 200 || !data?.token) {
        setStatus(`Login failed: ${data?.msg ?? 'unknown'} (code ${data?.code})`);
        log(`login failed: ${safeStringify(data)}`);
        return;
      }
      sdkToken = data.token;
      log('login OK — token received');
      AsyncStorage.setItem('example.token', sdkToken).catch(() => {});
      AsyncStorage.setItem('example.email', emailV.trim()).catch(() => {});
      AsyncStorage.setItem('example.password', passwordV).catch(() => {});
    } catch (e: any) {
      setStatus(`Login error: ${e?.message ?? e}`);
      log(`login error: ${e?.message ?? e}`);
      return;
    }

    connectSdk(sdkToken);
  }, [serverUrl, mediaUrl, wireEvents, log]);

  // Sessions are capped server-side (last 5 per user) — logging in on every
  // app open evicts other devices' sessions and their unregister then 401s.
  // Reuse the stored session token like a real app; fall back to a fresh
  // login when it stops working.
  const connectSdk = useCallback((sdkToken: string) => {
    try {
      connleRef.current?.disconnect();
      connleRef.current?.removeAllListeners();
    } catch {}
    const connleai = new ConnleVideo(
      serverUrl.trim(),
      sdkToken,
      mediaUrl.trim() || undefined,
      PUSH_REST ? {push: {apiBase: PUSH_REST}} : undefined,
    );
    connleRef.current = connleai;
    wireEvents(connleai);
    setStatus('Connecting…');
    connleai.connect();
  }, [serverUrl, mediaUrl, wireEvents]);

  const connectWithStored = useCallback((storedToken: string, emailV: string, passwordV: string) => {
    log('connecting with stored session (no fresh login)');
    connectSdk(storedToken);
    // Stored session dead (expired / evicted)? → fresh login after 6s.
    setTimeout(() => {
      if (!connectedRef.current && emailV && passwordV) {
        log('stored session did not connect — logging in fresh');
        AsyncStorage.removeItem('example.token').catch(() => {});
        connectWithRef.current?.(emailV, passwordV);
      }
    }, 6000);
  }, [connectSdk, log]);

  const connectWithRef = useRef<typeof connectWith | null>(null);
  useEffect(() => { connectWithRef.current = connectWith; }, [connectWith]);
  const connectedRef = useRef(false);
  useEffect(() => { connectedRef.current = connected; }, [connected]);
  const resetCallRef = useRef<(() => void) | null>(null);
  useEffect(() => { resetCallRef.current = resetCall; }, [resetCall]);
  useEffect(() => { connectWithStoredRef.current = connectWithStored; }, [connectWithStored]);

  const onConnect = useCallback(() => connectWith(email, password), [connectWith, email, password]);

  // Sign-out order matters: unregister the push token FIRST (needs the live
  // session), then drop the socket. Otherwise this device keeps ringing for
  // calls after logout.
  const onDisconnect = useCallback(() => {
    const c = connleRef.current;
    const finish = () => {
      c?.disconnect();
      setConnected(false);
      resetCall();
      setStatus('Disconnected');
    };
    if (c?.unregisterPush) {
      log('unregistering push token…');
      let done = false;
      const once = (r: any) => {
        if (done) return; done = true;
        log(`unregister result: ${safeStringify(r)}`);
        AsyncStorage.removeItem('example.token').catch(() => {});
        finish();
      };
      c.unregisterPush(once);
      setTimeout(() => once({code: 408, note: 'timeout'}), 4000);
    } else {
      finish();
    }
  }, [resetCall, log]);

  const onCall = useCallback(async () => {
    if (!targetUser.trim()) {
      Alert.alert('Enter a user', 'Type the user id to call.');
      return;
    }
    const ok = await requestMediaPermissions(wantVideo);
    if (!ok) {
      Alert.alert('Permission needed', 'Camera / microphone permission required.');
      return;
    }
    setCallState('outgoing');
    setPeerId(targetUser.trim());
    setStatus(`Calling ${targetUser.trim()}…`);
    log(`call(${targetUser.trim()}, video:${wantVideo})`);
    setCallHasVideo(wantVideo);
    connleRef.current?.call(targetUser.trim(), {audio: true, video: wantVideo}, (ack: any) => {
      log(`call ack: ${safeStringify(ack)}`);
      if (ack?.code !== 100) {
        resetCall();
        setStatus(`Call failed: ${ack?.message ?? ack?.error ?? 'unknown'}`);
      }
    });
  }, [targetUser, wantVideo, log, resetCall]);

  const onAnswer = useCallback(async () => {
    const ok = await requestMediaPermissions(!!incoming?.media?.video);
    if (!ok) {
      Alert.alert('Permission needed', 'Camera / microphone permission required.');
      return;
    }
    // Answer the SDK directly. The native call screen transitions to active
    // via setCurrentCallActive when media connects (the voice SDK's pattern —
    // answerIncomingCall re-triggers native answer handling and on Samsung
    // the extra activity launches got the process killed).
    log('answer()');
    connleRef.current?.answer((ack: any) => log(`answer ack: ${safeStringify(ack)}`));
  }, [incoming, log]);

  const onReject = useCallback(() => {
    connleRef.current?.reject((ack: any) => log(`reject ack: ${safeStringify(ack)}`));
    resetCall();
  }, [log, resetCall]);

  const onHangup = useCallback(() => {
    if (callState === 'outgoing') {
      connleRef.current?.cancelOutgoingCall((ack: any) => log(`cancel ack: ${safeStringify(ack)}`));
    } else {
      connleRef.current?.hangup((ack: any) => log(`hangup ack: ${safeStringify(ack)}`));
    }
    resetCall();
  }, [callState, log, resetCall]);

  const onToggleMute = useCallback(() => {
    connleRef.current?.toggleAudio();
    setMuted(m => !m);
  }, []);

  const onToggleCamera = useCallback(() => {
    connleRef.current?.toggleVideo();
    setCameraOff(c => !c);
  }, []);

  const onToggleSpeaker = useCallback(() => {
    setSpeakerOn(s => {
      const next = !s;
      connleRef.current?.setSpeaker(next);
      return next;
    });
  }, []);

  const onSwitchCamera = useCallback(() => {
    connleRef.current?.switchCamera();
  }, []);

  // When a call becomes active, default the speaker toggle to match the call
  // type — video → loudspeaker, audio → earpiece — mirroring the SDK's routing.
  useEffect(() => {
    if (callState === 'active') setSpeakerOn(callHasVideo);
  }, [callState, callHasVideo]);

  // ---- UI ----
  const inCall = callState === 'active' || callState === 'outgoing';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0b1f3a" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connle Video · React Native</Text>
        <Text style={styles.headerStatus}>{status}</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">

        {/* Connection card */}
        {!connected ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connect</Text>
            <TextInput style={styles.input} placeholder="Signalling URL (wss://…)"
              autoCapitalize="none" autoCorrect={false}
              value={serverUrl} onChangeText={setServerUrl} />
            <TextInput style={styles.input} placeholder="Email"
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
              value={email} onChangeText={setEmail} />
            <TextInput style={styles.input} placeholder="Password"
              autoCapitalize="none" autoCorrect={false} secureTextEntry
              value={password} onChangeText={setPassword} />
            <TextInput style={styles.input} placeholder="Media / SFU URL (wss://…)"
              autoCapitalize="none" autoCorrect={false}
              value={mediaUrl} onChangeText={setMediaUrl} />
            <TouchableOpacity style={styles.primaryBtn} onPress={onConnect}>
              <Text style={styles.primaryBtnText}>Connect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Connected</Text>
              <TouchableOpacity onPress={onDisconnect}>
                <Text style={styles.linkText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Incoming banner */}
        {callState === 'incoming' && (
          <View style={[styles.card, styles.incomingCard]}>
            <Text style={styles.incomingLabel}>
              Incoming {callHasVideo ? 'video' : 'audio'} call
            </Text>
            <Text style={styles.incomingFrom}>{peerId ?? 'Unknown'}</Text>
            <View style={styles.rowBetween}>
              <TouchableOpacity style={[styles.callBtn, styles.rejectBtn]} onPress={onReject}>
                <Text style={styles.callBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.callBtn, styles.answerBtn]} onPress={onAnswer}>
                <Text style={styles.callBtnText}>Answer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Video stage + controls */}
        {inCall && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {callState === 'outgoing' ? `Calling ${peerId ?? ''}…` : `On call · ${peerId ?? ''}`}
            </Text>

            <View style={styles.stage}>
              {/* Remote video — RTCView renders the MediaStream from livekit-client Track */}
              {remoteVideoTrack ? (
                <TrackView
                  key={remoteVideoTrack?.sid ?? remoteVideoTrack?.mediaStreamTrack?.id ?? 'remote'}
                  videoTrack={remoteVideoTrack}
                  style={styles.remoteVideo}
                />
              ) : (
                <View style={[styles.remoteVideo, styles.placeholder]}>
                  <Text style={styles.placeholderText}>
                    {callState === 'outgoing'
                      ? 'Ringing…'
                      : callHasVideo
                        ? 'Waiting for remote video…'
                        : 'Audio call — no remote video'}
                  </Text>
                </View>
              )}

              {/* Local preview */}
              {localVideoTrack && !cameraOff && (
                <TrackView
                  key={localVideoTrack?.sid ?? localVideoTrack?.mediaStreamTrack?.id ?? 'local'}
                  videoTrack={localVideoTrack}
                  mirror
                  style={styles.localVideo}
                />
              )}
            </View>

            <View style={styles.controlRow}>
              <TouchableOpacity
                style={[styles.ctrlBtn, muted && styles.ctrlBtnActive]}
                onPress={onToggleMute}
                disabled={callState !== 'active'}>
                <Text style={styles.ctrlBtnText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctrlBtn, cameraOff && styles.ctrlBtnActive]}
                onPress={onToggleCamera}
                disabled={callState !== 'active'}>
                <Text style={styles.ctrlBtnText}>{cameraOff ? 'Camera on' : 'Camera off'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.controlRow}>
              <TouchableOpacity
                style={[styles.ctrlBtn, speakerOn && styles.ctrlBtnActive]}
                onPress={onToggleSpeaker}
                disabled={callState !== 'active'}>
                <Text style={styles.ctrlBtnText}>{speakerOn ? 'Speaker on' : 'Speaker'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctrlBtn}
                onPress={onSwitchCamera}
                disabled={callState !== 'active' || cameraOff}>
                <Text style={styles.ctrlBtnText}>Flip camera</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.ctrlBtn, styles.hangupWide]}
              onPress={onHangup}>
              <Text style={styles.hangupText}>
                {callState === 'outgoing' ? 'Cancel' : 'Hang up'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dialer */}
        {connected && callState === 'idle' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Make a call</Text>
            <TextInput style={styles.input} placeholder="User id to call"
              autoCapitalize="none" autoCorrect={false}
              value={targetUser} onChangeText={setTargetUser} />
            <View style={[styles.rowBetween, styles.switchRow]}>
              <Text style={styles.switchLabel}>Video call</Text>
              <Switch value={wantVideo} onValueChange={setWantVideo} />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={onCall}>
              <Text style={styles.primaryBtnText}>Call</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Event log */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Event log</Text>
            <TouchableOpacity onPress={() => setLogs([])}>
              <Text style={styles.linkText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {logs.length === 0 ? (
            <Text style={styles.muted}>No events yet.</Text>
          ) : (
            logs.map((line, i) => (
              <Text key={`${i}-${line}`} style={styles.logLine}>{line}</Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b1f3a'},
  header: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16},
  headerTitle: {color: '#ffffff', fontSize: 22, fontWeight: '700'},
  headerStatus: {color: '#9fc1ff', fontSize: 14, marginTop: 4},
  body: {flex: 1, backgroundColor: '#f3f5f9'},
  bodyContent: {padding: 16, paddingBottom: 48},
  card: {
    backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: {width: 0, height: 2}, elevation: 2,
  },
  cardTitle: {fontSize: 16, fontWeight: '700', color: '#1b2a4a'},
  rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  muted: {color: '#6b7280', marginTop: 6},
  linkText: {color: '#2563eb', fontWeight: '600'},
  input: {
    borderWidth: 1, borderColor: '#d6dbe5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginTop: 10, color: '#111827',
  },
  switchRow: {marginTop: 14},
  switchLabel: {fontSize: 16, color: '#1b2a4a', fontWeight: '600'},
  primaryBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 14,
  },
  primaryBtnText: {color: '#ffffff', fontSize: 16, fontWeight: '700'},
  incomingCard: {backgroundColor: '#e8f7ee', borderWidth: 1, borderColor: '#34c759'},
  incomingLabel: {color: '#157a3a', fontWeight: '700', fontSize: 13},
  incomingFrom: {fontSize: 24, fontWeight: '800', color: '#0f5132', marginVertical: 10},
  callBtn: {flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6},
  answerBtn: {backgroundColor: '#34c759', marginLeft: 8},
  rejectBtn: {backgroundColor: '#ef4444', marginRight: 8},
  callBtnText: {color: '#ffffff', fontSize: 16, fontWeight: '700'},
  stage: {marginTop: 14, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0b1f3a'},
  remoteVideo: {width: '100%', height: 320, backgroundColor: '#0b1f3a'},
  placeholder: {alignItems: 'center', justifyContent: 'center'},
  placeholderText: {color: '#9fc1ff', fontSize: 15},
  localVideo: {
    position: 'absolute', top: 12, right: 12,
    width: 96, height: 128, borderRadius: 10,
    borderWidth: 2, borderColor: '#ffffff', backgroundColor: '#10243f',
  },
  controlRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 14},
  ctrlBtn: {
    flex: 1, backgroundColor: '#e5e9f2', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginHorizontal: 4,
  },
  ctrlBtnActive: {backgroundColor: '#c7d2fe'},
  hangupWide: {backgroundColor: '#ef4444', marginTop: 10, marginHorizontal: 4},
  hangupText: {color: '#ffffff', fontWeight: '700'},
  ctrlBtnText: {color: '#1b2a4a', fontWeight: '700'},
  logLine: {
    fontSize: 12, color: '#374151', marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

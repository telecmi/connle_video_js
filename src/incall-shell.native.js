// Android lock-screen in-call surface.
//
// The RN app's own activity cannot show over the keyguard, but React itself
// can: the callkeep fork's IncomingCallActivity (showWhenLocked) hosts THIS
// component on a second React surface after a locked answer. Full video +
// call controls with zero app wiring — the component finds the live session
// through the SDK's active-session registry and drives the same public API
// the app would (toggleAudio / toggleSpeaker / switchCamera / hangup).
//
// Registered at SDK module load so the surface can start even on a cold
// push-woken process.
import React, { useEffect, useRef, useState } from 'react';
import {
    AppRegistry,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getActiveSession } from './active-session';

let RTCView = null;
let RNMediaStream = null;
try {
    const webrtc = require('@livekit/react-native-webrtc');
    RTCView = webrtc.RTCView;
    RNMediaStream = webrtc.MediaStream;
} catch { /* rendering degrades to audio-only UI */ }

function trackStreamURL(videoTrack) {
    try {
        if (!videoTrack) return '';
        if (videoTrack.mediaStream && typeof videoTrack.mediaStream.toURL === 'function') {
            const url = videoTrack.mediaStream.toURL();
            if (url) return url;
        }
        if (videoTrack.mediaStreamTrack && RNMediaStream) {
            return new RNMediaStream([ videoTrack.mediaStreamTrack ] ).toURL();
        }
    } catch { /* not renderable yet */ }
    return '';
}

// Camera video track of a participant, if published and subscribed.
function cameraTrack(participant) {
    try {
        if (!participant) return null;
        for (const pub of participant.videoTrackPublications.values()) {
            if (pub.source === 'screen_share') continue;
            const t = pub.videoTrack || pub.track;
            if (t) return t;
        }
    } catch { /* room shape changed underneath us */ }
    return null;
}

function TrackSurface({ track, mirror, style, zOrder }) {
    const [ url, setUrl ] = useState(() => trackStreamURL(track));
    useEffect(() => {
        setUrl(trackStreamURL(track));
        if (!track) return undefined;
        // The native stream URL can lag track arrival by a beat — poll until
        // it materializes.
        const iv = setInterval(() => {
            const next = trackStreamURL(track);
            if (next) {
                setUrl(next);
                clearInterval(iv);
            }
        }, 250);
        return () => clearInterval(iv);
    }, [ track ]);
    if (!RTCView || !url) return null;
    return (
        <RTCView
            streamURL={url}
            objectFit="cover"
            mirror={!!mirror}
            zOrder={zOrder || 0}
            style={style}
        />
    );
}

function Control({ label, active, danger, onPress }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.control,
                active ? styles.controlActive : null,
                danger ? styles.controlDanger : null,
            ]}
        >
            <Text style={styles.controlText}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function ConnleInCallShell(props) {
    const name = ( props && props.name ) || 'In call';
    const [ session ] = useState(() => getActiveSession());
    const [ remoteTrack, setRemoteTrack ] = useState(null);
    const [ localTrack, setLocalTrack ] = useState(null);
    const [ muted, setMuted ] = useState(false);
    const [ speakerOn, setSpeakerOn ] = useState(true);
    const [ mirror, setMirror ] = useState(true);
    const [ seconds, setSeconds ] = useState(0);
    const [ live, setLive ] = useState(true);
    const startRef = useRef(Date.now());
    const wasConnectedRef = useRef(false);

    // Track discovery + liveness: poll the room — robust against every
    // ordering (cold start, reconnect, late subscription), and events keep
    // flowing to the app's own listeners untouched.
    useEffect(() => {
        const iv = setInterval(() => {
            const s = getActiveSession();
            const room = s && s.video && s.video.room;
            if (!room) return;
            try {
                setLocalTrack(cameraTrack(room.localParticipant) || null);
                let remote = null;
                for (const p of room.remoteParticipants.values()) {
                    remote = cameraTrack(p);
                    if (remote) break;
                }
                setRemoteTrack(remote || null);
                // "Ended" only on a connected -> disconnected TRANSITION —
                // during setup the room exists but is still connecting.
                const connectedNow = !!( s.video.isConnected && s.video.isConnected() );
                if (connectedNow && !wasConnectedRef.current) {
                    wasConnectedRef.current = true;
                    startRef.current = Date.now(); // talk time starts here
                }
                if (!connectedNow && wasConnectedRef.current) setLive(false);
            } catch { /* transient room state */ }
        }, 500);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        const iv = setInterval(() => {
            setSeconds(Math.floor(( Date.now() - startRef.current ) / 1000));
        }, 1000);
        return () => clearInterval(iv);
    }, []);

    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');

    const doToggleMute = () => {
        const s = getActiveSession();
        if (!s) return;
        Promise.resolve(s.toggleAudio()).catch(() => { });
        setMuted(( m ) => !m);
    };
    const doToggleSpeaker = () => {
        const s = getActiveSession();
        if (!s) return;
        try { s.toggleSpeaker(); } catch { /* ignore */ }
        setSpeakerOn(( v ) => !v);
    };
    const doFlip = () => {
        const s = getActiveSession();
        if (!s) return;
        try { s.switchCamera(); } catch { /* ignore */ }
        setMirror(( m ) => !m);
    };
    const doHangup = () => {
        setLive(false);
        const s = getActiveSession();
        if (s) {
            try { s.hangup(() => { }); } catch { /* ignore */ }
        }
        // The native activity watches the Telecom connection and closes
        // itself when the call dies — nothing else to do here.
    };

    return (
        <View style={styles.root}>
            {remoteTrack ? (
                <TrackSurface track={remoteTrack} style={StyleSheet.absoluteFill} />
            ) : (
                <View style={styles.waiting}>
                    <Text style={styles.waitingName}>{name}</Text>
                    <Text style={styles.waitingSub}>
                        {live ? 'Connecting…' : 'Call ended'}
                    </Text>
                </View>
            )}

            {localTrack ? (
                <View style={styles.pip}>
                    <TrackSurface
                        track={localTrack}
                        mirror={mirror}
                        zOrder={1}
                        style={styles.pipVideo}
                    />
                </View>
            ) : null}

            <View style={styles.topBar}>
                <Text style={styles.topName}>{name}</Text>
                <Text style={styles.topTimer}>{live ? `${mm}:${ss}` : 'Ended'}</Text>
            </View>

            <View style={styles.controls}>
                <Control label={muted ? 'Unmute' : 'Mute'} active={muted} onPress={doToggleMute} />
                <Control label="Speaker" active={speakerOn} onPress={doToggleSpeaker} />
                <Control label="Flip" onPress={doFlip} />
                <Control label="End" danger onPress={doHangup} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#0B1F3A',
    },
    waiting: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    waitingName: {
        color: '#FFFFFF',
        fontSize: 30,
        fontWeight: '700',
        marginBottom: 8,
    },
    waitingSub: {
        color: '#9FC1FF',
        fontSize: 16,
    },
    pip: {
        position: 'absolute',
        top: 64,
        right: 16,
        width: 110,
        height: 160,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#10294A',
    },
    pipVideo: {
        width: '100%',
        height: '100%',
    },
    topBar: {
        position: 'absolute',
        top: 56,
        left: 20,
    },
    topName: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '700',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowRadius: 6,
    },
    topTimer: {
        color: '#D7E5FF',
        fontSize: 15,
        marginTop: 2,
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowRadius: 6,
    },
    controls: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 48,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 14,
    },
    control: {
        minWidth: 76,
        paddingHorizontal: 14,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlActive: {
        backgroundColor: 'rgba(255,255,255,0.45)',
    },
    controlDanger: {
        backgroundColor: '#EF4444',
    },
    controlText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
});

if (Platform.OS === 'android') {
    try {
        AppRegistry.registerComponent('ConnleInCallShell', () => ConnleInCallShell);
    } catch { /* double registration on fast refresh */ }
}

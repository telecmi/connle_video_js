// Android lock-screen in-call surface.
//
// The RN app's own activity cannot show over the keyguard, but React itself
// can: the callkeep fork's IncomingCallActivity (showWhenLocked) hosts THIS
// component on a second React surface after a locked answer. Full video +
// call controls with zero app wiring — the component finds the live session
// through the SDK's active-session registry and drives the same public API
// the app would (toggleAudio / toggleVideo / toggleSpeaker / switchCamera /
// hangup).
//
// Audio calls (or video not yet flowing) show an avatar instead of video —
// customizable by the app via the constructor option { avatar: <image url> }
// (falls back to an initial-letter circle from the caller name).
//
// Registered at SDK module load so the surface can start even on a cold
// push-woken process.
import React, { useEffect, useRef, useState } from 'react';
import {
    AppRegistry,
    Image,
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
} catch { /* rendering degrades to the avatar UI */ }

// Material icons, bundled with the SDK as PNG assets (white on transparent,
// recolored at runtime via tintColor). Static requires — Metro needs
// literal paths to pack assets.
const ICONS = {
    mic: require('./icons/mic.png'),
    mic_off: require('./icons/mic_off.png'),
    videocam: require('./icons/videocam.png'),
    videocam_off: require('./icons/videocam_off.png'),
    volume_up: require('./icons/volume_up.png'),
    volume_off: require('./icons/volume_off.png'),
    flip: require('./icons/flip.png'),
    call_end: require('./icons/call_end.png'),
};

function trackStreamURL(videoTrack) {
    try {
        if (!videoTrack) return '';
        if (videoTrack.mediaStream && typeof videoTrack.mediaStream.toURL === 'function') {
            const url = videoTrack.mediaStream.toURL();
            if (url) return url;
        }
        if (videoTrack.mediaStreamTrack && RNMediaStream) {
            return new RNMediaStream([ videoTrack.mediaStreamTrack ]).toURL();
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

function titleCase(name) {
    return String(name || '')
        .split(' ')
        .map(( w ) => ( w ? w.charAt(0).toUpperCase() + w.slice(1) : w ))
        .join(' ');
}

// Round control button, WhatsApp style: translucent circle with a native
// Material icon (vector drawables shipped in the SDK's Android library),
// small label; toggled state inverts to a solid white circle.
function Control({ icon, active, danger, onPress }) {
    // Icon-only round buttons (WhatsApp style) — the icon itself is the
    // language; toggled state inverts to a solid white circle.
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            style={[
                styles.control,
                active ? styles.controlActive : null,
                danger ? styles.controlDanger : null,
            ]}
        >
            <Image
                source={ICONS[icon]}
                style={[ styles.controlIcon, active ? styles.controlIconActive : null ]}
            />
        </TouchableOpacity>
    );
}

function Avatar({ name, uri }) {
    if (uri) {
        return <Image source={{ uri }} style={styles.avatarImage} />;
    }
    const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
    return (
        <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{letter}</Text>
        </View>
    );
}

export default function ConnleInCallShell(props) {
    const name = titleCase(( props && props.name ) || 'In call');
    const [ session ] = useState(() => getActiveSession());
    const [ remoteTrack, setRemoteTrack ] = useState(null);
    const [ localTrack, setLocalTrack ] = useState(null);
    const [ muted, setMuted ] = useState(false);
    const [ videoOff, setVideoOff ] = useState(false);
    const [ speakerOn, setSpeakerOn ] = useState(true);
    const [ mirror, setMirror ] = useState(true);
    const [ seconds, setSeconds ] = useState(0);
    const [ live, setLive ] = useState(true);
    const startRef = useRef(Date.now());
    const wasConnectedRef = useRef(false);

    // App-customizable avatar for the audio-call face of the screen:
    // new ConnleVideo(url, token, mediaURL, { avatar: 'https://…/logo.png' })
    const avatarUri =
        ( session && session.options &&
          ( session.options.avatar ||
            ( session.options.ui && session.options.ui.avatar ) ) ) || null;

    // Track discovery + real control state + liveness: poll the room — robust
    // against every ordering (cold start, reconnect, late subscription), and
    // the app's own event listeners stay untouched.
    useEffect(() => {
        const iv = setInterval(() => {
            const s = getActiveSession();
            const room = s && s.video && s.video.room;
            if (!room) return;
            try {
                const local = room.localParticipant;
                setLocalTrack(cameraTrack(local) || null);
                let remote = null;
                for (const p of room.remoteParticipants.values()) {
                    remote = cameraTrack(p);
                    if (remote) break;
                }
                setRemoteTrack(remote || null);
                // Truthful toggle states straight from the room / audio route.
                if (local) {
                    if (typeof local.isMicrophoneEnabled === 'boolean') setMuted(!local.isMicrophoneEnabled);
                    if (typeof local.isCameraEnabled === 'boolean') setVideoOff(!local.isCameraEnabled);
                }
                if (typeof s.video.speakerOn === 'boolean') setSpeakerOn(s.video.speakerOn);
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
    const doToggleVideo = () => {
        const s = getActiveSession();
        if (!s) return;
        Promise.resolve(s.toggleVideo()).catch(() => { });
        setVideoOff(( v ) => !v);
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

    const showVideo = !!remoteTrack;

    return (
        <View style={styles.root}>
            {showVideo ? (
                <View style={styles.remoteWrap} pointerEvents="none">
                    <TrackSurface track={remoteTrack} style={styles.remoteVideo} />
                </View>
            ) : (
                <View style={styles.audioFace}>
                    <Avatar name={name} uri={avatarUri} />
                    <Text style={styles.audioName}>{name}</Text>
                    <Text style={styles.audioState}>
                        {live ? ( wasConnectedRef.current ? `${mm}:${ss}` : 'Connecting…' ) : 'Call ended'}
                    </Text>
                </View>
            )}

            {localTrack && !videoOff ? (
                <View style={styles.pip}>
                    <TrackSurface
                        track={localTrack}
                        mirror={mirror}
                        zOrder={1}
                        style={styles.pipVideo}
                    />
                </View>
            ) : null}

            {showVideo ? (
                <View style={styles.topBar}>
                    <Text style={styles.topName}>{name}</Text>
                    <Text style={styles.topTimer}>{live ? `${mm}:${ss}` : 'Ended'}</Text>
                </View>
            ) : null}

            <View style={styles.controls}>
                <Control icon="flip" onPress={doFlip} />
                <Control
                    icon={videoOff ? 'videocam_off' : 'videocam'}
                    active={videoOff}
                    onPress={doToggleVideo}
                />
                <Control
                    icon={muted ? 'mic_off' : 'mic'}
                    active={muted}
                    onPress={doToggleMute}
                />
                <Control
                    icon={speakerOn ? 'volume_up' : 'volume_off'}
                    active={speakerOn}
                    onPress={doToggleSpeaker}
                />
                <Control icon="call_end" danger onPress={doHangup} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#0B1F3A',
    },
    // Remote video must cover the WHOLE screen: explicit wrapper + 100%
    // dimensions — absoluteFill alone can leave the native video view
    // measured short and anchored at the top.
    remoteWrap: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    remoteVideo: {
        width: '100%',
        height: '100%',
    },
    audioFace: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 120,
    },
    avatarCircle: {
        width: 128,
        height: 128,
        borderRadius: 64,
        backgroundColor: '#2E5C9E',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarImage: {
        width: 128,
        height: 128,
        borderRadius: 64,
        backgroundColor: '#10294A',
    },
    avatarLetter: {
        color: '#FFFFFF',
        fontSize: 56,
        fontWeight: '700',
    },
    audioName: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '700',
        marginTop: 24,
    },
    audioState: {
        color: '#9FC1FF',
        fontSize: 16,
        marginTop: 8,
        fontVariant: [ 'tabular-nums' ],
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
        left: 0,
        right: 0,
        alignItems: 'center',
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
        fontVariant: [ 'tabular-nums' ],
    },
    controls: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 44,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    control: {
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlActive: {
        backgroundColor: '#FFFFFF',
    },
    controlDanger: {
        backgroundColor: '#EF4444',
    },
    controlIcon: {
        width: 28,
        height: 28,
        tintColor: '#FFFFFF',
    },
    controlIconActive: {
        tintColor: '#0B1F3A', // dark icon on the inverted white circle
    },
});

if (Platform.OS === 'android') {
    try {
        AppRegistry.registerComponent('ConnleInCallShell', () => ConnleInCallShell);
    } catch { /* double registration on fast refresh */ }
}

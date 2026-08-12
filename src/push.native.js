// Push wake-up support for @telecmi/connle-video — React Native build.
//
// Registers this device's push token with the connle REST API
// (api.connle.com — the same service that issued the login token) so the connle_livekit_push server can wake the
// app for incoming VIDEO calls, and receives those pushes.
//
// Coexistence with @telecmi/piopiy-native (voice) in the SAME app is handled
// by the shared TeleCMI push router (a well-known global — no dependency
// between the packages). Android allows exactly one FCM background handler:
// whichever TeleCMI SDK loads first claims the OS APIs and dispatches every
// payload by its `type`; this SDK registers for 'video_call'/'video_cancel'
// and receives its calls whether or not it is the claimer. When this SDK is
// ALONE in the app, it claims the OS APIs itself.

import { Platform, PermissionsAndroid } from 'react-native';
// Lock-screen in-call surface: importing registers the 'ConnleInCallShell'
// AppRegistry component the native activity mounts after a locked answer.
import './incall-shell';

const dbg = ( ...args ) => {
    try {
        const g = ( typeof globalThis !== 'undefined' ) ? globalThis : null;
        if ( g && typeof g.__connleLog === 'function' ) {
            g.__connleLog( '[push] ' + args.map( ( a ) => ( typeof a === 'string' ? a : JSON.stringify( a ) ) ).join( ' ' ) );
        }
        else if ( g && g.__connleDebug ) console.log( '[connle-video]', ...args );
    } catch { /* ignore */ }
};

// ---------------------------------------------------------------------------
// The shared TeleCMI push router. IDENTICAL contract to the copy shipped in
// @telecmi/piopiy-native — first SDK to load installs it; do not diverge.
// ---------------------------------------------------------------------------
const ROUTER_KEY = '__telecmiPushRouter';

function createRouter() {
    const routes = new Map();
    let defaultHandler = null;
    let unrouted = null;
    const tokenSubs = [];
    let lastToken = null;
    return {
        version: 1,
        register( types, handler, opts ) {
            ( types || [] ).forEach( ( t ) => routes.set( t, handler ) );
            if ( opts && opts.isDefault ) defaultHandler = handler;
        },
        onUnrouted( cb ) { unrouted = cb; },
        dispatch( data ) {
            if ( !data || typeof data !== 'object' ) return false;
            const handler = ( data.type && routes.get( data.type ) )
                || ( !data.type && defaultHandler )
                || null;
            if ( handler ) { try { handler( data ); } catch { /* ignore */ } return true; }
            if ( unrouted ) { try { unrouted( data ); } catch { /* ignore */ } return true; }
            return false;
        },
        publishToken( info ) {
            lastToken = info;
            tokenSubs.forEach( ( cb ) => { try { cb( info ); } catch { /* ignore */ } } );
        },
        onToken( cb ) {
            tokenSubs.push( cb );
            if ( lastToken ) { try { cb( lastToken ); } catch { /* ignore */ } }
        },
    };
}

function getPushRouter() {
    const g = ( typeof globalThis !== 'undefined' ) ? globalThis : {};
    if ( !g[ ROUTER_KEY ] ) g[ ROUTER_KEY ] = createRouter();
    return g[ ROUTER_KEY ];
}

// ---------------------------------------------------------------------------
// OS token sources — used only when this SDK is ALONE (nobody published a
// token on the router). Same version-agnostic Firebase adapter as the voice
// SDK: namespaced (≤ v25) and modular (v26+) APIs both work.
// ---------------------------------------------------------------------------
function loadMessaging() {
    if ( Platform.OS !== 'android' ) return null;
    let mod;
    try {
        mod = require( '@react-native-firebase/messaging' );
    } catch {
        dbg( 'Android push needs Firebase: npm install @react-native-firebase/app @react-native-firebase/messaging' );
        return null;
    }
    try {
        const ns = mod && ( mod.default || mod );
        if ( typeof ns === 'function' ) {
            const m = ns();
            const nguard = ( name, fn ) => ( ...args ) => {
                try { return fn( ...args ); }
                catch ( e ) { dbg( name + ' failed (is Firebase configured? google-services.json?) —', e && e.message ); return Promise.reject( e ); }
            };
            return {
                getToken: nguard( 'getToken', () => m.getToken() ),
                onTokenRefresh: nguard( 'onTokenRefresh', ( cb ) => m.onTokenRefresh( cb ) ),
                onMessage: nguard( 'onMessage', ( cb ) => m.onMessage( cb ) ),
                setBackgroundMessageHandler: nguard( 'setBackgroundMessageHandler', ( cb ) => m.setBackgroundMessageHandler( cb ) ),
            };
        }
        const { getMessaging, getToken, onTokenRefresh, onMessage, setBackgroundMessageHandler } = mod;
        if ( typeof getMessaging !== 'function' ) return null;
        const m = getMessaging();
        // Each call guarded: with Firebase half-configured (no
        // google-services.json, native module version mismatch) the modular
        // fns throw synchronously from INSIDE — that must never crash the app.
        const guard = ( name, fn ) => ( ...args ) => {
            try { return fn( ...args ); }
            catch ( e ) { dbg( name + ' failed (is Firebase configured? google-services.json?) —', e && e.message ); return Promise.reject( e ); }
        };
        return {
            getToken: guard( 'getToken', () => getToken( m ) ),
            onTokenRefresh: guard( 'onTokenRefresh', ( cb ) => onTokenRefresh( m, cb ) ),
            onMessage: guard( 'onMessage', ( cb ) => onMessage( m, cb ) ),
            setBackgroundMessageHandler: guard( 'setBackgroundMessageHandler', ( cb ) => setBackgroundMessageHandler( m, cb ) ),
        };
    } catch ( e ) {
        dbg( 'firebase messaging init failed —', e && e.message );
        return null;
    }
}

// iOS VoIP push (optional peer — ships with the voice SDK; a video-only app
// installs react-native-voip-push-notification itself for killed-state calls).
function loadVoipPush() {
    if ( Platform.OS !== 'ios' ) return null;
    try {
        const mod = require( 'react-native-voip-push-notification' );
        return mod && ( mod.default || mod );
    } catch {
        return null;
    }
}

// LOCAL TEST — revert to https://api.connle.com before publishing.
// Android native incoming-call UI (ConnectionService via the bundled
// @telecmi/react-native-callkeep). iOS never uses this path — the app's
// AppDelegate reports to CallKit inside the PushKit callback, as Apple
// requires. Lazy + idempotent so it also works from the FCM background
// handler where the app UI never mounted.
let _callKeep = null;
let _callKeepSetup = false;
function loadCallKeep() {
    if ( _callKeep ) return _callKeep;
    try {
        const mod = require( '@telecmi/react-native-callkeep' );
        _callKeep = mod && ( mod.default || mod );
    } catch {
        dbg( 'callkeep not available — no native ring on Android' );
        return null;
    }
    if ( _callKeep && !_callKeepSetup ) {
        _callKeepSetup = true;
        try {
            const setupPromise = _callKeep.setup( {
                ios: { appName: 'Connle', supportsVideo: true },
                android: {
                    alertTitle: 'Permissions required',
                    alertDescription: 'This application needs phone-account access to show incoming calls',
                    cancelButton: 'Cancel',
                    okButton: 'OK',
                    additionalPermissions: [],
                    // Self-managed (the WhatsApp model, team's choice): no
                    // system call UI — the SDK's CallStyle notification rings,
                    // the app is the entire in-call experience. Requires the
                    // bundled callkeep >= 4.3.19. Set false for the classic
                    // system call screen instead.
                    selfManaged: true,
                    // Native OS-side ring timeout (fork >= 4.3.18): survives the
                    // headless JS context AND total network loss — the ring can
                    // never outlive the server's 35s no-answer window by much.
                    ringTimeout: 40000,
                    foregroundService: {
                        channelId: 'com.telecmi.connle.video',
                        channelName: 'Incoming video calls',
                        notificationTitle: 'Connle call in progress',
                    },
                },
            } );
            // Same post-setup sequence as the voice SDK — on Android these
            // finish wiring the phone account and the JS event bridge; without
            // them answer events and foregrounding are unreliable.
            Promise.resolve( setupPromise ).then( () => {
                try { _callKeep.setAvailable( true ); } catch { /* ignore */ }
                if ( Platform.OS === 'android' ) {
                    try { _callKeep.registerPhoneAccount(); } catch { /* ignore */ }
                    try { _callKeep.registerAndroidEvents(); } catch { /* ignore */ }
                }
            } ).catch( () => { } );
        } catch ( e ) {
            dbg( 'callkeep setup failed —', e && e.message );
        }
    }
    return _callKeep;
}

// ---------------------------------------------------------------------------
// Android background pushes — registered at MODULE LOAD, not at instance
// start. RNFirebase spawns its headless task the moment a background push
// arrives; if nothing registered the task during bundle evaluation, the push
// is DROPPED ("No task registered for key ReactNativeFirebaseMessagingHeadlessTask")
// — including the very push meant to wake a killed app. Importing the SDK is
// enough; no instance needs to exist yet.
// ---------------------------------------------------------------------------
let _coldPending = null;      // video_call that arrived before any SDK instance
let _coldAnswer = null;       // Answer tapped on that cold ring, before any instance
let _coldAnswerAt = 0;        // when that tap happened (stale taps must die)
let _coldEventsWired = false;

// Cold-boot factory: a killed app's process is revived by the call push, but
// only the APP knows how to create its session (stored credentials). The app
// registers a factory at module scope (ConnleVideo.registerColdBoot); the SDK
// invokes it the moment a cold ring arrives, so the session is forming while
// the phone is still ringing and a lock-screen answer completes with no app
// UI involved.
let _coldBootFactory = null;
let _coldBootRan = false;
function _invokeColdBoot() {
    if ( _coldBootRan || !_coldBootFactory ) return;
    _coldBootRan = true;
    dbg( 'cold boot: invoking the app session factory' );
    try {
        Promise.resolve( _coldBootFactory() )
            .catch( ( e ) => dbg( 'cold-boot factory failed —', e && e.message ) );
    } catch ( e ) {
        dbg( 'cold-boot factory threw —', e && e.message );
    }
}

// FCM redelivers undelivered data messages for DAYS (device offline, process
// dead, push channel wedged). A call invite older than the server's ~35 s
// no-answer window can never be answered — ringing it creates a ghost call
// whose stale UI hijacks the next real answer.
const MAX_RING_PUSH_AGE_MS = 45000;
// A parked Answer tap older than this belongs to a call the server has long
// since timed out; completing it can only produce call_mismatch errors.
const MAX_PARKED_ANSWER_AGE_MS = 60000;

// Calls answered on THIS DEVICE — module-level, shared by every SDK instance
// in the process: apps can construct more than one Connle (auto-login flows
// do), and the multi-device dismissal cancel is delivered to ALL of them. An
// instance that never answered must not kill the call its sibling did.
const _answeredIds = [];
function _markAnsweredId( call_id ) {
    _answeredIds.push( String( call_id ) );
    if ( _answeredIds.length > 20 ) _answeredIds.shift();
}
function _wasAnsweredHere( call_id ) {
    return _answeredIds.includes( String( call_id ) );
}

function _isStaleRing( msg, data ) {
    if ( !data || data.type !== 'video_call' ) return false; // cancels are idempotent
    const sent = Number( msg && msg.sentTime );
    if ( !sent ) return false; // no timestamp — can't judge, let it ring
    const age = Date.now() - sent;
    if ( age <= MAX_RING_PUSH_AGE_MS ) return false;
    dbg( 'stale video_call push dropped (age ' + Math.round( age / 1000 ) + 's):', data && data.call_id );
    return true;
}

// Cold-context native events: with NO SDK instance (killed-app headless), an
// Answer tap must still launch the app and be remembered — the instance picks
// it up the moment the app starts.
function _wireColdNativeEvents( ck ) {
    if ( _coldEventsWired || !ck ) return;
    _coldEventsWired = true;
    try {
        ck.addEventListener( 'answerCall', ( ev ) => {
            const uuid = String( ( ev && ev.callUUID ) || '' ).toLowerCase();
            if ( !uuid || !_coldPending ) return; // only relevant in the cold phase
            if ( String( _coldPending.call_id ).toLowerCase() !== uuid ) return;
            dbg( 'cold answer parked:', uuid );
            _coldAnswer = uuid;
            _coldAnswerAt = Date.now();
            _invokeColdBoot(); // in case the ring path didn't (belt+braces)
        } );
        ck.addEventListener( 'endCall', ( ev ) => {
            const uuid = String( ( ev && ev.callUUID ) || '' ).toLowerCase();
            if ( !uuid || !_coldPending ) return;
            if ( String( _coldPending.call_id ).toLowerCase() !== uuid ) return;
            dbg( 'cold decline:', uuid );
            _coldPending = null;
            _coldAnswer = null;
        } );
    } catch ( e ) {
        dbg( 'cold event wiring failed —', e && e.message );
    }
}

function _normalizePayload( raw ) {
    const data = { ...( raw || {} ) };
    if ( !data.from && data.caller ) data.from = data.caller;
    if ( typeof data.media === 'string' ) {
        try { data.media = JSON.parse( data.media ); } catch { /* keep */ }
    }
    return data;
}

// Ring/dismiss natively with NO SDK instance (headless cold start): the app
// process was just spawned for this push — show the native call UI now; the
// call itself is completed once the app runs and the instance picks it up.
function _handleColdPush( raw ) {
    const data = _normalizePayload( raw );
    if ( !data || !data.call_id ) return;
    const ck = loadCallKeep();
    if ( data.type === 'video_cancel' ) {
        if ( _coldPending && String( _coldPending.call_id ) === String( data.call_id ) ) { _coldPending = null; _coldAnswer = null; }
        if ( ck ) { try { ck.reportEndCallWithUUID( String( data.call_id ), 2 ); } catch { /* ignore */ } }
        return;
    }
    if ( data.type !== 'video_call' ) return;
    _coldPending = data;
    _invokeColdBoot(); // start forming the session while the phone rings
    if ( ck ) {
        _wireColdNativeEvents( ck );
        const hasVideo = !!( data.media && data.media.video );
        const caller = data.from_name || data.from || 'Incoming call';
        try {
            ck.displayIncomingCall( String( data.call_id ), caller, caller, 'generic', hasVideo );
            dbg( 'cold-start native ring for', data.call_id );
        } catch ( e ) {
            dbg( 'cold displayIncomingCall failed —', e && e.message );
        }
    }
}

( function registerBackgroundHandlerEarly() {
    if ( Platform.OS !== 'android' ) return;
    const messaging = loadMessaging();
    if ( !messaging ) return;
    try {
        messaging.setBackgroundMessageHandler( async ( msg ) => {
            const data = ( msg && msg.data ) || null;
            if ( _isStaleRing( msg, data ) ) return; // FCM retry of a dead call
            const router = getPushRouter();
            if ( router.dispatch( data ) ) return; // an SDK instance is alive
            _handleColdPush( data );               // headless: ring natively now
        } );
        dbg( 'background push handler registered (module load)' );
    } catch ( e ) {
        dbg( 'early background handler failed —', e && e.message );
    }
} )();

const DEFAULT_API_BASE = 'https://api.connle.com';
const DEFAULT_REGISTER_PATH = '/video/push/register';
const DEFAULT_UNREGISTER_PATH = '/video/push/unregister';

export default class ConnlePush {

    /**
     * @param {object} connle  the Connle instance (uses .token as the bearer)
     * @param {object} [opts]  { apiBase }
     */
    constructor( connle, opts ) {
        this.connle = connle;
        this.opts = opts || {};
        this.started = false;
        this.deviceToken = null;   // { token, provider, platform }
        this.registered = null;    // last token successfully registered
        this._pendingNativeAnswer = null; // Answer tapped before the invite reached JS
        this._pendingNativeAnswerAt = 0;  // park time — stale parks must expire
        this._nativeEventsWired = false;
    }

    // ------------------------------------------------------------------
    // Native call-UI events (CallKit / ConnectionService) — owned by the
    // SDK, like the voice SDK: apps write no CallKit answer/end code.
    // ------------------------------------------------------------------
    _wireNativeCallEvents( ck ) {
        if ( this._nativeEventsWired || !ck ) return;
        this._nativeEventsWired = true;
        try {
            ck.addEventListener( 'answerCall', ( ev ) => {
                const uuid = String( ( ev && ev.callUUID ) || '' ).toLowerCase();
                if ( !uuid ) return;
                dbg( 'native answer:', uuid );
                this._handleNativeAnswer( uuid );
            } );
            // iOS: CallKit activates the audio session on answer — WebRTC must
            // be told, or answered CallKit calls can be silent (the classic
            // failure). Official LiveKit RN guidance: forward both events.
            if ( Platform.OS === 'ios' ) {
                let rtcAudioSession = null;
                try {
                    const webrtc = require( '@livekit/react-native-webrtc' );
                    rtcAudioSession = ( webrtc && webrtc.RTCAudioSession ) || null;
                } catch { /* ignore */ }
                if ( rtcAudioSession ) {
                    ck.addEventListener( 'didActivateAudioSession', () => {
                        try { rtcAudioSession.audioSessionDidActivate(); } catch { /* ignore */ }
                    } );
                    ck.addEventListener( 'didDeactivateAudioSession', () => {
                        try { rtcAudioSession.audioSessionDidDeactivate(); } catch { /* ignore */ }
                    } );
                }
            }

            ck.addEventListener( 'endCall', ( ev ) => {
                const uuid = String( ( ev && ev.callUUID ) || '' ).toLowerCase();
                if ( !uuid ) return;
                dbg( 'native end:', uuid );
                this._handleNativeEnd( uuid );
            } );
        } catch ( e ) {
            dbg( 'native call event wiring failed —', e && e.message );
        }
    }

    _handleNativeAnswer( uuid ) {
        // Already answered (app UI answered first and flipped the native
        // screen — this event is the echo): do nothing.
        if ( _wasAnsweredHere( uuid ) ) return;
        const current = String( this.connle.callId || '' ).toLowerCase();
        if ( current === uuid && this.connle.isConnected ) {
            this._answerWithPermissions();
        } else {
            // Not actionable yet — either the invite hasn't reached JS (push
            // launched a killed app) or the socket is down (lock-screen answer
            // while backgrounded drops it). Parked; completed by _onPush when
            // the invite arrives OR by onConnected() when the socket is back.
            dbg( 'native answer parked (invite/socket not ready):', uuid );
            this._pendingNativeAnswer = uuid;
            this._pendingNativeAnswerAt = Date.now();
            // The RN host is paused while a native activity (the in-call
            // shell) is frontmost, so JS timers — including socket.io's
            // reconnect timer — are FROZEN and a dropped socket would stay
            // down until the server times the call out. Kick a fresh connect
            // NOW (the initial attempt is not timer-driven); onConnected()
            // completes this park.
            if ( !this.connle.isConnected && this.connle.token ) {
                dbg( 'socket down at answer — forcing reconnect' );
                try { this.connle.connect(); } catch { /* ignore */ }
            }
        }
    }

    _handleNativeEnd( uuid ) {
        if ( this._pendingNativeAnswer === uuid ) this._pendingNativeAnswer = null;
        const current = String( this.connle.callId || '' ).toLowerCase();
        if ( current !== uuid ) return;
        if ( this.connle.pendingIncomingCall ) {
            this.connle.reject( ( ack ) => dbg( 'native reject ack:', ack && ack.code ) );
        } else {
            this.connle.hangup( ( ack ) => dbg( 'native hangup ack:', ack && ack.code ) );
        }
    }

    // Answer after securing runtime permissions (shared helper) — a denied
    // camera degrades to audio-only, never a crash.
    async _answerWithPermissions() {
        if ( this.connle.callType ) {
            this.connle.callType = await this.ensureMediaPermissions( this.connle.callType );
        }
        // Surface the app after EVERY answer (Android): in a video-calling
        // product the app IS the call UI, audio calls included — immediately,
        // and once more after the Telecom transition settles. (iOS: CallKit
        // itself opens the app when a call reported hasVideo is answered;
        // audio answers stay on the CallKit screen — OS behavior, no API.)
        const ck = Platform.OS === 'android' ? loadCallKeep() : null;
        if ( ck ) {
            try { ck.backToForeground(); } catch { /* ignore */ }
        }
        this.connle.answer( ( ack ) => {
            dbg( 'native answer ack:', ack && ack.code );
            if ( ck && ack && ack.code === 200 ) {
                setTimeout( () => { try { ck.backToForeground(); } catch { /* ignore */ } }, 800 );
            }
        } );
    }

    /** Media connected: native call goes ACTIVE and the Telecom-level mute
     *  is asserted OFF (Telecom can bring the call up muted, silencing the
     *  mic system-wide even though the track publishes). For answered
     *  INCOMING calls the SDK's in-call screen comes up — the ONE call UI no
     *  matter how or where the call was answered (opt out with
     *  options.ui.callScreen = 'app'). */
    onMediaConnected( call_id ) {
        const ck = loadCallKeep();
        if ( !ck || !call_id ) return;
        const uuid = String( call_id );
        try { ck.setCurrentCallActive( uuid ); } catch { /* ignore */ }
        if ( Platform.OS === 'android' ) {
            try { ck.setMutedCall( uuid, false ); } catch { /* ignore */ }
            const wantsAppUi = !!( this.connle && this.connle.options &&
                this.connle.options.ui && this.connle.options.ui.callScreen === 'app' );
            if ( !wantsAppUi && _wasAnsweredHere( uuid ) &&
                 typeof ck.showInCallScreen === 'function' ) {
                const name = ( this._callerNames && this._callerNames[ uuid.toLowerCase() ] ) || 'In call';
                try { ck.showInCallScreen( uuid, name ); } catch { /* ignore */ }
            }
        }
    }

    /** Call over (remote end, local hangup/reject, media drop): dismiss the
     *  native call UI. Report, not request — no endCall event loop. */
    onCallEnded( call_id ) {
        const ck = loadCallKeep();
        if ( !ck || !call_id ) return;
        try { ck.reportEndCallWithUUID( String( call_id ), 2 ); } catch { /* ignore */ }
        if ( Platform.OS === 'android' ) {
            try { if ( typeof ck.setActivityShowWhenLocked === 'function' ) ck.setActivityShowWhenLocked( false ); } catch { /* ignore */ }
        }
        if ( this._ringTimers ) {
            clearTimeout( this._ringTimers[ String( call_id ) ] );
            delete this._ringTimers[ String( call_id ) ];
        }
    }

    /** Secure runtime permissions before media starts (Android). Camera denied
     *  on a video call -> returns adjusted media (audio-only) instead of
     *  letting LiveKit's capturer abort the process. */
    async ensureMediaPermissions( media ) {
        if ( Platform.OS !== 'android' ) return media;
        try {
            const wantsVideo = !!( media && media.video );
            const perms = [ PermissionsAndroid.PERMISSIONS.RECORD_AUDIO ];
            if ( wantsVideo ) perms.push( PermissionsAndroid.PERMISSIONS.CAMERA );
            const res = await PermissionsAndroid.requestMultiple( perms );
            const camOk = !wantsVideo || res[ PermissionsAndroid.PERMISSIONS.CAMERA ] === PermissionsAndroid.RESULTS.GRANTED;
            if ( !camOk ) {
                dbg( 'camera permission denied — continuing audio-only' );
                return { ...media, video: false };
            }
        } catch ( e ) {
            dbg( 'permission request failed —', e && e.message );
        }
        return media;
    }

    /** Called by connly._onPushIncoming: was Answer already tapped natively?
     *  Consumes ONLY when the session is live — on a cold start the invite is
     *  flushed before the socket connects, and answering then would throw the
     *  tap away (NOT_CONNECTED). Kept parked, onConnected() completes it. */
    consumePendingAnswer( call_id ) {
        const uuid = String( call_id || '' ).toLowerCase();
        if ( !uuid || this._pendingNativeAnswer !== uuid ) return false;
        if ( ( Date.now() - ( this._pendingNativeAnswerAt || 0 ) ) > MAX_PARKED_ANSWER_AGE_MS ) {
            dbg( 'parked answer expired:', uuid );
            this._endNativeCall( uuid );
            this._pendingNativeAnswer = null;
            return false;
        }
        if ( !this.connle.isConnected ) {
            dbg( 'answer stays parked — session not live yet:', uuid );
            return false;
        }
        this._pendingNativeAnswer = null;
        return true;
    }

    /** Start receiving video-call pushes and register the device token. */
    start() {
        if ( this.started ) return true;
        this.started = true;

        const router = getPushRouter();

        // Receive our payload types regardless of which SDK owns the OS APIs.
        router.register( [ 'video_call', 'video_cancel' ], ( data ) => this._onPush( data ) );

        // Own the native call-UI events from the start (answer/end taps on
        // the CallKit / ConnectionService screen drive the SDK directly).
        this._wireNativeCallEvents( loadCallKeep() );

        // A push rang the device before this instance existed (cold start):
        // run it through the normal pipeline now — prepares the call so a
        // parked native Answer completes, without re-ringing (already shown).
        if ( _coldPending ) {
            const cold = _coldPending;
            _coldPending = null;
            if ( _coldAnswer && ( Date.now() - _coldAnswerAt ) > MAX_PARKED_ANSWER_AGE_MS ) {
                // An Answer tapped on a ring the server timed out long ago —
                // completing it can only yield call_mismatch. Drop the tap and
                // the equally-dead invite, and END the native call it created
                // (its Telecom connection went ACTIVE at the tap and would
                // linger as a zombie with a stuck in-call shell otherwise).
                dbg( 'stale cold answer dropped:', _coldAnswer );
                this._endNativeCall( _coldAnswer );
                _coldAnswer = null;
            } else {
                if ( _coldAnswer ) {
                    dbg( 'carrying cold answer into instance:', _coldAnswer );
                    this._pendingNativeAnswer = _coldAnswer;
                    this._pendingNativeAnswerAt = _coldAnswerAt;
                    _coldAnswer = null;
                }
                setTimeout( () => this._onPush( { ...cold, _alreadyRang: true } ), 0 );
            }
        }

        // Token: prefer the one another TeleCMI SDK already fetched (same
        // device = same token); fetch ourselves only if nobody publishes one.
        let sawSharedToken = false;
        router.onToken( ( info ) => {
            sawSharedToken = true;
            this._onDeviceToken( info );
        } );
        setTimeout( () => {
            if ( !sawSharedToken ) this._claimAlone( router );
        }, 1500 );

        return true;
    }

    // Android 13+: the self-managed ring is a notification — without this
    // runtime grant the phone stays silent on incoming calls.
    async _ensureNotificationPermission() {
        if ( Platform.OS !== 'android' ) return;
        try {
            const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
            if ( perm ) await PermissionsAndroid.request( perm );
        } catch { /* ignore */ }
    }

    // Nobody else fetched a token — this SDK is alone: own the OS APIs.
    _claimAlone( router ) {
        try {
            this._claimAloneInner( router );
        } catch ( e ) {
            dbg( 'push claim failed — push disabled for this run:', e && e.message );
        }
    }

    _claimAloneInner( router ) {
        if ( Platform.OS === 'android' ) {
            this._ensureNotificationPermission();
            const messaging = loadMessaging();
            if ( !messaging ) return;
            messaging.getToken()
                .then( ( token ) => {
                    const info = { token, provider: 'fcm', platform: 'android' };
                    router.publishToken( info );
                    this._onDeviceToken( info );
                } )
                .catch( ( e ) => dbg( 'FCM getToken failed —', e && e.message ) );
            messaging.onTokenRefresh( ( token ) => {
                const info = { token, provider: 'fcm', platform: 'android' };
                router.publishToken( info );
                this._onDeviceToken( info );
            } );
            messaging.onMessage( ( msg ) => {
                const data = ( msg && msg.data ) || null;
                if ( _isStaleRing( msg, data ) ) return; // FCM retry of a dead call
                router.dispatch( data );
            } );
            // Background handler is registered at module load (headless-safe).
        } else if ( Platform.OS === 'ios' ) {
            const VoipPush = loadVoipPush();
            if ( !VoipPush ) {
                dbg( 'iOS killed-state video calls need react-native-voip-push-notification (ships with @telecmi/piopiy-native; install it directly in video-only apps)' );
                return;
            }
            VoipPush.addEventListener( 'register', ( token ) => {
                const info = { token, provider: 'apns', platform: 'ios' };
                router.publishToken( info );
                this._onDeviceToken( info );
            } );
            VoipPush.addEventListener( 'notification', ( payload ) => router.dispatch( ( payload && ( payload.data ?? payload ) ) || null ) );
            VoipPush.addEventListener( 'didLoadWithEvents', ( events ) => {
                ( events || [] ).forEach( ( evt ) => {
                    if ( evt && evt.name === 'RNVoipPushRemoteNotificationsRegisteredEvent' ) {
                        const info = { token: evt.data, provider: 'apns', platform: 'ios' };
                        router.publishToken( info );
                        this._onDeviceToken( info );
                    }
                    if ( evt && evt.name === 'RNVoipPushRemoteNotificationReceivedEvent' ) {
                        router.dispatch( ( evt.data && ( evt.data.data ?? evt.data ) ) || null );
                    }
                } );
            } );
            VoipPush.registerVoipToken();
        }
    }

    _onDeviceToken( info ) {
        if ( !info || !info.token ) return;
        // Loud, greppable proof the OS issued a push token (the #1 thing to
        // verify on a new device/provisioning setup).
        dbg( 'device push token (' + info.provider + '/' + info.platform + '): ' + info.token );
        try { console.log( '[connle-video] device push token (' + info.provider + '):', info.token ); } catch { /* ignore */ }
        this.deviceToken = info;
        if ( this.registered === info.token ) return;
        // Send only while CONNECTED — connect succeeding proves the session
        // token is valid. A token that arrives earlier is held; onConnected()
        // sends it the moment the session is live.
        if ( this.connle && this.connle.isConnected ) {
            this._register( info );
        } else {
            dbg( 'device token held — registering when connected' );
        }
    }

    /** End the native (Telecom/CallKit) call for a uuid the SDK gave up on —
     *  its connection would otherwise linger ACTIVE with a stuck call UI.
     *  3 = unanswered/missed. */
    _endNativeCall( uuid ) {
        const ck = loadCallKeep();
        if ( !ck || !uuid ) return;
        try { ck.reportEndCallWithUUID( String( uuid ), 3 ); } catch { /* ignore */ }
    }

    /** The app answered this call — the ring backstop must not kill it, and
     *  the multi-device dismissal cancel (sent to ALL the user's devices,
     *  including this one) must be ignored here. */
    markAnswered( call_id ) {
        if ( !call_id ) return;
        _markAnsweredId( call_id );
        if ( this._ringTimers ) {
            clearTimeout( this._ringTimers[ String( call_id ) ] );
            delete this._ringTimers[ String( call_id ) ];
        }
    }

    /** On mobile the push IS the incoming-call transport (native CallKit /
     *  ConnectionService ring); the socket incoming event is for browsers.
     *  Once this device holds a push token, socket-delivered invites are
     *  suppressed so the app rings exactly once, natively. Without a token
     *  (Firebase not set up, iOS simulator) the socket fallback still rings. */
    suppressSocketIncoming() {
        return !!( this.deviceToken && this.deviceToken.token );
    }

    /** Called by the SDK on every successful connect: register (or re-register)
     *  the held device token. Idempotent — an already-sent token is skipped. */
    onConnected() {
        this.signedOut = false; // a fresh session accepts calls again
        // A native Answer tap that arrived while the socket was down (typical
        // lock-screen wake) completes now that the session is live.
        const pending = this._pendingNativeAnswer;
        if ( pending && ( Date.now() - ( this._pendingNativeAnswerAt || 0 ) ) > MAX_PARKED_ANSWER_AGE_MS ) {
            dbg( 'parked answer expired, not completing:', pending );
            this._endNativeCall( pending );
            this._pendingNativeAnswer = null;
        } else if ( pending && String( this.connle.callId || '' ).toLowerCase() === pending ) {
            this._pendingNativeAnswer = null;
            dbg( 'completing parked native answer on reconnect:', pending );
            this._answerWithPermissions();
        }
        if ( this.deviceToken && this.registered !== this.deviceToken.token ) {
            this._register( this.deviceToken );
        }
    }

    // POST the token to TeleCMI REST (same REST as voice, video endpoint).
    _register( info, attempt ) {
        const base = ( this.opts.apiBase || DEFAULT_API_BASE ).replace( /\/+$/, '' );
        const path = DEFAULT_REGISTER_PATH;
        const url = base + path;
        const body = JSON.stringify( { token: info.token, provider: info.provider, platform: info.platform } );
        dbg( 'registering', info.provider, String( info.token ).slice( 0, 10 ) + '… → ' + url );

        const xhr = new XMLHttpRequest();
        xhr.open( 'POST', url, true );
        xhr.setRequestHeader( 'Content-Type', 'application/json;charset=UTF-8' );
        if ( this.connle && this.connle.token ) {
            xhr.setRequestHeader( 'Authorization', 'Bearer ' + this.connle.token );
        }
        xhr.timeout = 5000;
        xhr.onreadystatechange = () => {
            if ( xhr.readyState !== 4 ) return;
            dbg( 'register HTTP ' + xhr.status + ' ← ' + path + ' ' + String( xhr.responseText || '' ).slice( 0, 120 ) );
            if ( xhr.status === 200 ) {
                this.registered = info.token;
            } else if ( !attempt ) {
                setTimeout( () => this._register( info, 1 ), 2000 );
            }
        };
        xhr.onerror = () => { if ( !attempt ) setTimeout( () => this._register( info, 1 ), 2000 ); };
        xhr.ontimeout = () => { if ( !attempt ) setTimeout( () => this._register( info, 1 ), 2000 ); };
        xhr.send( body );
    }

    /** Remove this device's video push registration (e.g. on sign-out). */
    unregister( callback ) {
        // Signed out: refuse incoming video_call pushes from now until the
        // next successful connect — even if the server-side token removal
        // fails (network, expired session) or a late push arrives.
        this.signedOut = true;
        const done = ( r ) => { if ( typeof callback === 'function' ) callback( r ); };
        if ( !this.registered ) return done( { code: 200, status: 'no token registered' } );
        const base = ( this.opts.apiBase || DEFAULT_API_BASE ).replace( /\/+$/, '' );
        const url = base + DEFAULT_UNREGISTER_PATH;
        const xhr = new XMLHttpRequest();
        xhr.open( 'POST', url, true );
        xhr.setRequestHeader( 'Content-Type', 'application/json;charset=UTF-8' );
        if ( this.connle && this.connle.token ) {
            xhr.setRequestHeader( 'Authorization', 'Bearer ' + this.connle.token );
        }
        xhr.timeout = 5000;
        xhr.onreadystatechange = () => {
            if ( xhr.readyState !== 4 ) return;
            dbg( 'unregister HTTP ' + xhr.status + ' ' + String( xhr.responseText || '' ).slice( 0, 120 ) );
            if ( xhr.status === 200 ) this.registered = null;
            done( { code: xhr.status } );
        };
        xhr.onerror = () => done( { code: 500 } );
        xhr.ontimeout = () => done( { code: 408 } );
        xhr.send( JSON.stringify( { token: this.registered } ) );
    }

    // A video push arrived (routed to us by type, any app state).
    _onPush( raw ) {
        // Normalize transport differences so the app sees ONE shape:
        // FCM remaps the reserved 'from' key to 'caller' and stringifies all
        // values (media arrives as a JSON string); APNs delivers as-is.
        const data = { ...raw };
        if ( !data.from && data.caller ) data.from = data.caller;
        if ( typeof data.media === 'string' ) {
            try { data.media = JSON.parse( data.media ); } catch { /* keep as-is */ }
        }
        if ( this.signedOut && data.type === 'video_call' ) {
            dbg( 'signed out — incoming video_call push refused' );
            return;
        }
        try {
            if ( data.type === 'video_cancel' ) {
                if ( data.call_id && this._pendingNativeAnswer === String( data.call_id ).toLowerCase() ) {
                    this._pendingNativeAnswer = null;
                }
                // Answered HERE: this cancel is the multi-device dismissal for
                // the sibling devices — not for us. Never end a live call.
                if ( data.call_id && _wasAnsweredHere( data.call_id ) ) {
                    dbg( 'cancel ignored — call answered on this device:', data.call_id );
                    return;
                }
                if ( this._ringTimers && data.call_id ) {
                    clearTimeout( this._ringTimers[ String( data.call_id ) ] );
                    delete this._ringTimers[ String( data.call_id ) ];
                }
                // Dismiss the native Android ring for this exact call.
                const ck = loadCallKeep();
                if ( ck && data.call_id ) {
                    try { ck.reportEndCallWithUUID( String( data.call_id ), 2 ); } catch { /* ignore */ }
                }
                if ( typeof this.connle._onPushCancel === 'function' ) this.connle._onPushCancel( data );
                return;
            }
            // Remembered for the in-call screen title at media connect (also
            // for cold replays, which skip the ring block below).
            if ( data.call_id ) {
                this._callerNames = this._callerNames || {};
                this._callerNames[ String( data.call_id ).toLowerCase() ] =
                    data.from_name || data.from || 'In call';
            }
            // Android: ring the native ConnectionService UI — works in every
            // app state, including the background handler. (iOS rings from the
            // AppDelegate's CallKit report; JS only mirrors state there.)
            if ( Platform.OS === 'android' && data.call_id && !data._alreadyRang ) {
                const ck = loadCallKeep();
                if ( ck ) {
                    this._wireNativeCallEvents( ck );
                    const hasVideo = !!( data.media && typeof data.media === 'object' && data.media.video );
                    const caller = data.from_name || data.from || 'Incoming call';
                    try {
                        // handle = display name too: Android's system call UI
                        // features the HANDLE as the big line — passing the raw
                        // user id there showed a UUID instead of the caller.
                        ck.displayIncomingCall( String( data.call_id ), caller, caller, 'generic', hasVideo );
                        dbg( 'native Android ring for', data.call_id );
                        // Ring-timeout backstop (a few seconds above the
                        // server's 45s ringing TTL): if the cancel push gets
                        // lost, the ring must still die. Cleared on answer.
                        this._ringTimers = this._ringTimers || {};
                        const uuid = String( data.call_id );
                        clearTimeout( this._ringTimers[ uuid ] );
                        this._ringTimers[ uuid ] = setTimeout( () => {
                            delete this._ringTimers[ uuid ];
                            try { ck.reportEndCallWithUUID( uuid, 3 ); dbg( 'ring timeout backstop ended', uuid ); } catch { /* ignore */ }
                        }, 40000 );
                    } catch ( e ) {
                        dbg( 'displayIncomingCall failed —', e && e.message );
                    }
                }
            }
            // video_call: surface through the SDK's normal incoming-call path
            // with transport marked, so app UIs work unchanged.
            if ( typeof this.connle._onPushIncoming === 'function' ) {
                this.connle._onPushIncoming( { ...data, transport: 'push' } );
            }
        } catch ( e ) {
            dbg( 'push handling failed —', e && e.message );
        }
    }
}

/** App-registered factory that creates the SDK session on a cold (killed-app)
 *  call wake-up — see the cold-boot notes above. Register at MODULE scope so
 *  it exists before any push handling runs. */
ConnlePush.registerColdBoot = function ( factory ) {
    if ( typeof factory === 'function' ) _coldBootFactory = factory;
};

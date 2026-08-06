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

import { Platform } from 'react-native';

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
    if ( Platform.OS !== 'android' ) return null;
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
            _callKeep.setup( {
                ios: { appName: 'Connle' },
                android: {
                    alertTitle: 'Permissions required',
                    alertDescription: 'This application needs phone-account access to show incoming calls',
                    cancelButton: 'Cancel',
                    okButton: 'OK',
                    additionalPermissions: [],
                    foregroundService: {
                        channelId: 'com.telecmi.connle.video',
                        channelName: 'Incoming video calls',
                        notificationTitle: 'Connle call in progress',
                    },
                },
            } );
        } catch ( e ) {
            dbg( 'callkeep setup failed —', e && e.message );
        }
    }
    return _callKeep;
}

const DEFAULT_API_BASE = 'http://192.168.0.211:6001';
const DEFAULT_REGISTER_PATH = '/video/push/register';
const DEFAULT_UNREGISTER_PATH = '/video/push/unregister';

export default class ConnlePush {

    /**
     * @param {object} connle  the Connle instance (uses .token as the bearer)
     * @param {object} [opts]  { apiBase, registerPath, unregisterPath }
     */
    constructor( connle, opts ) {
        this.connle = connle;
        this.opts = opts || {};
        this.started = false;
        this.deviceToken = null;   // { token, provider, platform }
        this.registered = null;    // last token successfully registered
    }

    /** Start receiving video-call pushes and register the device token. */
    start() {
        if ( this.started ) return true;
        this.started = true;

        const router = getPushRouter();

        // Receive our payload types regardless of which SDK owns the OS APIs.
        router.register( [ 'video_call', 'video_cancel' ], ( data ) => this._onPush( data ) );

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
            messaging.onMessage( ( msg ) => router.dispatch( ( msg && msg.data ) || null ) );
            try {
                messaging.setBackgroundMessageHandler( async ( msg ) => router.dispatch( ( msg && msg.data ) || null ) );
            } catch ( e ) {
                dbg( 'background handler setup failed —', e && e.message );
            }
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

    /** The app answered this call — the ring backstop must not kill it. */
    markAnswered( call_id ) {
        if ( this._ringTimers && call_id ) {
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
        if ( this.deviceToken && this.registered !== this.deviceToken.token ) {
            this._register( this.deviceToken );
        }
    }

    // POST the token to TeleCMI REST (same REST as voice, video endpoint).
    _register( info, attempt ) {
        const base = ( this.opts.apiBase || DEFAULT_API_BASE ).replace( /\/+$/, '' );
        const path = this.opts.registerPath || DEFAULT_REGISTER_PATH;
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
        const url = base + ( this.opts.unregisterPath || DEFAULT_UNREGISTER_PATH );
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
            // Android: ring the native ConnectionService UI — works in every
            // app state, including the background handler. (iOS rings from the
            // AppDelegate's CallKit report; JS only mirrors state there.)
            if ( Platform.OS === 'android' && data.call_id ) {
                const ck = loadCallKeep();
                if ( ck ) {
                    const hasVideo = !!( data.media && typeof data.media === 'object' && data.media.video );
                    const caller = data.from_name || data.from || 'Incoming call';
                    try {
                        ck.displayIncomingCall( String( data.call_id ), String( data.from || 'unknown' ), caller, 'generic', hasVideo );
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
                        }, 50000 );
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

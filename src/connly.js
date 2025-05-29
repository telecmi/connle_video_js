import io from 'socket.io-client';
import { EventEmitter } from 'events';
import Video from './video';

export default class ConnlySignalling extends EventEmitter {
    constructor( serverUrl, token, mediaURL ) {
        super();
        this.serverUrl = serverUrl;
        this.token = token;
        this.mediaURL = mediaURL;
        this.isConnected = false;
        this.eventHandlers = {};
        this.eventHandlers = {};
        this.video = new Video( this.mediaURL );
        this.pingInterval = null;
    }

    // Initialize a new connection
    connect () {
        // Check if socket is already connected, if so, disconnect it first
        if ( this.socket && this.isConnected ) {
            this.socket.removeAllListeners();
            this.disconnect();
        }

        // Initialize a new socket connection
        this.socket = io( this.serverUrl, {
            query: {
                token: this.token,
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 500,
                timeout: 10000
            },
        } );

        // Handle connection events
        this.socket.on( 'connect', () => {
            this.isConnected = true;
            if ( this.onConnectCallback ) this.onConnectCallback( { isConnected: this.isConnected } );

            if ( this.pingInterval ) clearInterval( this.pingInterval );
            this.pingInterval = setInterval( () => {
                if ( this.isConnected ) {
                    this.socket.emit( 'connle_ping', { status: 'ping' } ); // Send ping to the server
                }
            }, 300000 );
        } );

        this.socket.on( 'disconnect', () => {
            this.isConnected = false;
            if ( this.onDisconnectCallback ) this.onDisconnectCallback( { isConnected: this.isConnected } );
            // Stop pinging when disconnected
            if ( this.pingInterval ) {
                clearInterval( this.pingInterval );
                this.pingInterval = null; // Ensure pingInterval is reset
            }
        } );

        this.socket.io.on( 'reconnect_attempt', () => {

        } );

        // Error handling
        this.socket.on( 'connect_error', ( error ) => {
            if ( this.onErrorCallback ) this.onErrorCallback( error );
        } );

        this.socket.on( 'error', ( error ) => {
            if ( this.onErrorCallback ) this.onErrorCallback( error );
        } );


        this.socket.on( 'connle_on_incoming_call', ( data, callback ) => {


            if ( data?.call_id ) {
                this.callId = data?.call_id;
                this.callType = data?.media;
                this.room_token = data?.token;
            }

            this.answer_callback = callback;

            if ( this.onIncomingCallCallback ) this.onIncomingCallCallback( data );
        } );

        this.socket.on( 'connle_on_ended', ( data, callback ) => {

            this.callId = null;
            this.callType = null;
            this.room_token = null;
            if ( typeof callback === 'function' ) {
                callback( 'delivered' );
            }
            if ( this.onEndedCallback ) this.onEndedCallback( data );
        } );

        this.socket.on( 'connle_on_status', ( data ) => {

            if ( this.onStatusCallback ) this.onStatusCallback( data );
        } );

        this.socket.on( 'connle_on_answered', ( data ) => {
            this.callId = null;

            if ( this.onAnsweredCallback ) this.onAnsweredCallback( data );
        } );
    }

    // Connection Event Handlers
    onConnect ( callback ) {
        this.onConnectCallback = callback;
    }

    onDisconnect ( callback ) {
        this.onDisconnectCallback = callback;
    }


    // Message Handling Methods
    sendMessage ( messageContent, callback ) {
        if ( !this.isConnected ) return;
        this.socket.emit( 'connle_message', messageContent, ( ack ) => {
            if ( callback ) callback( ack );
        } );
    }

    onMessage ( callback ) {
        this.socket.on( 'connle_on_message', ( data ) => {
            if ( callback ) callback( data );
        } );
    }


    onAnswered ( callback ) {
        this.onAnsweredCallback = callback;
    }


    onStatus ( callback ) {
        this.onStatusCallback = callback;
    }

    onEnded ( callback ) {

        this.onEndedCallback = callback;
    }

    // Incoming Call Handling Methods
    onIncomingCall ( callback ) {

        this.onIncomingCallCallback = callback;
    }
    answer ( callback ) {
        if ( !this.isConnected ) {
            this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }
        if ( !this.callId ) {
            this.emit( 'error', { code: 'NO_CALL_INVITE', message: 'No call invite' } );
            return;
        }

        this.socket.emit( 'connle_answer_call', { call_id: this.callId }, ( ack ) => {
            this.video.connect( this.callType.audio, this.callType.video, this.room_token, this );
            if ( callback ) callback( ack );
        } );
    }

    reject ( callback ) {
        if ( !this.isConnected ) return;
        if ( !this.callId ) return;
        this.socket.emit( 'connle_reject_call', { call_id: this.callId }, ( ack ) => {
            if ( callback ) callback( ack );
        } );
    }


    call ( userId, callType, callback ) {

        if ( !this.isConnected ) return;

        // Validate userId
        if ( typeof userId !== 'string' || userId.trim() === '' ) {
            if ( callback ) callback( { error: 'Invalid userId' } );
            return;
        }

        // Validate callType
        if ( typeof callType !== 'object' ) {
            if ( callback ) callback( { error: 'Invalid callType' } );
            return;
        }

        // Validate callType.audio and callType.video
        if ( typeof callType.audio !== 'boolean' || typeof callType.video !== 'boolean' ) {
            if ( callback ) callback( { error: 'Invalid callType' } );
            return;
        }

        const callData = { userid: userId, media: callType };
        const _this = this;

        this.socket.emit( 'connle_call_user', callData, ( ack ) => {


            if ( ack?.code === 100 ) {
                this.callId = ack?.call_id;
                this.video.connect( callType.audio, callType.video, ack.token, _this );
            }
            if ( callback ) callback( ack );
        } );
    }




    // Error Handling
    onError ( callback ) {
        this.onErrorCallback = callback;
    }

    // Disconnect Method
    disconnect () {
        if ( this.socket ) {
            this.socket.disconnect();
            this.isConnected = false;
        }
    }



    // Media Handling Methods
    onCall () {
        return this.video.isConnected( this );
    }

    mute () {
        this.video.mute( this );
    }

    unmute () {
        this.video.unmute( this );
    }

    toggleAudio () {
        this.video.toggleAudio( this );
    }

    toggleVideo () {
        this.video.toggleVideo( this );
    }

    play () {
        this.video.play( this );
    }

    pause () {
        this.video.pause( this );
    }

    shareScreen () {
        this.video.shareScreen( this );
    }

    stopScreenShare () {
        this.video.stopScreenShare( this );
    }

    toggleScreenShare () {
        this.video.toggleScreenShare( this );
    }

    hangup ( callback_function ) {

        if ( this.video.isConnected() ) {
            this.socket.emit( 'connle_hangup_call', {
                call_id: this.callId
            }, ( data ) => {
                if ( callback_function ) callback_function( data );
            } );
            this.video.disconnect( this );
        } else {
            this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
        }
    }


}

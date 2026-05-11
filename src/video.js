import {
    Room,
    VideoPresets,
    setLogLevel,
    LogLevel
} from 'livekit-client';

setLogLevel( LogLevel.warn );
export default class Video {



    constructor( serverUrl ) {
        this.serverUrl = serverUrl;
        this.localParticipant = null;
        this.remoteParticipant = null;
        this.room = new Room( {
            // automatically manage subscribed video quality
            adaptiveStream: true,

            // optimize publishing bandwidth and CPU for published tracks
            dynacast: true,

            // default capture settings
            videoCaptureDefaults: {
                resolution: VideoPresets.h720.resolution,
            },
        } );
        this.connectAttempt = 0;

    }


    cleanupListeners () {
        if ( !this.room ) return;

        // Remove all event listeners
        this.room.removeAllListeners( 'connected' );
        this.room.removeAllListeners( 'disconnected' );
        this.room.removeAllListeners( 'reconnecting' );
        this.room.removeAllListeners( 'reconnected' );
        this.room.removeAllListeners( 'participantConnected' );
        this.room.removeAllListeners( 'participantDisconnected' );
        this.room.removeAllListeners( 'trackPublished' );
        this.room.removeAllListeners( 'trackUnpublished' );
        this.room.removeAllListeners( 'trackSubscribed' );
        this.room.removeAllListeners( 'trackUnsubscribed' );
        this.room.removeAllListeners( 'activeSpeakersChanged' );
        this.room.removeAllListeners( 'dataReceived' );
        this.room.removeAllListeners( 'mediaDeviceError' );
        this.room.removeAllListeners( 'mediaConnectionError' );
        this.room.removeAllListeners( 'trackPublicationFailed' );
        this.room.removeAllListeners( 'trackSubscriptionFailed' );
        this.room.removeAllListeners( 'localTrackPublished' );
        this.room.removeAllListeners( 'localTrackUnpublished' );
        this.room.removeAllListeners( 'localTrackSubscribed' );
        this.room.removeAllListeners( 'localTrackUnsubscribed' );
        this.room.removeAllListeners( 'trackMuted' );
        this.room.removeAllListeners( 'trackUnmuted' );

        if ( this.localParticipant ) {
            this.localParticipant.removeAllListeners( 'trackMuted' );
            this.localParticipant.removeAllListeners( 'trackUnmuted' );
        }



    }

    async connect ( audio = true, video = false, token, _this ) {
        const attemptId = ++this.connectAttempt;
        this.cleanupListeners();


        // Connection state changes
        this.room.on( 'connected', () => {
            _this.emit( 'connected', { connected: true, user_id: this.room.localParticipant.identity } );
        } );

        this.room.on( 'disconnected', () => {
            _this.emit( 'disconnected', { connected: false, user_id: this.room.localParticipant.identity } );
        } );

        this.room.on( 'reconnecting', () => {
            _this.emit( 'reconnecting', { reconnecting: true, user_id: this.room.localParticipant.identity } );
        } );

        this.room.on( 'reconnected', () => {
            _this.emit( 'reconnected', { reconnecting: false, user_id: this.room.localParticipant.identity } );
        } );

        // Participant events
        this.room.on( 'participantConnected', ( participant ) => {

            _this.emit( 'userConnected', { connected: true, user_id: participant.identity } );

        } );


        this.room.on( 'trackMuted', ( publication, participant ) => {

            // Handle mute (e.g., show a mute icon)

            if ( participant.isLocal ) {
                return;
            }


            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }


            if ( publication.kind === 'video' ) {
                _this.emit( 'paused', { user_id: participant.identity, media: mediaType } );
            } else if ( publication.kind === 'audio' ) {
                _this.emit( 'muted', { user_id: participant.identity, media: 'audio' } );
            }

        } );

        this.room.on( 'trackUnmuted', ( publication, participant ) => {

            if ( participant.isLocal ) {
                return;
            }
            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }

            if ( publication.kind === 'video' ) {
                _this.emit( 'play', { user_id: participant.identity, media: mediaType } );
            } else if ( publication.kind === 'audio' ) {
                _this.emit( 'unmuted', { user_id: participant.identity, media: 'audio' } );
            }

        } );

        this.room.on( 'participantDisconnected', ( participant ) => {
            _this.emit( 'userDisconnected', { connected: false, user_id: participant.identity } );
        } );

        // Track events
        this.room.on( 'trackPublished', ( publication, participant ) => {

            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }
            _this.emit( 'mediaStarted', { media: publication.kind, user_id: participant.identity, source: mediaType } );
        } );

        this.room.on( 'trackUnpublished', ( publication, participant ) => {

            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }
            _this.emit( 'mediaStopped', { media: publication.kind, user_id: participant.identity, source: mediaType } );
        } );


        this.room.on( 'trackSubscribed', ( track, publication, participant ) => {

            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }
            _this.emit( 'streamAdded', { type: publication.kind, stream: track.mediaStreamTrack, user_id: participant.identity, source: mediaType } );
        } );

        this.room.on( 'trackUnsubscribed', ( publication, participant ) => {

            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }
            _this.emit( 'streamRemoved', { type: publication.kind, track: publication.track, user_id: participant.identity, source: mediaType } );
        } );



        this.room.on( 'localTrackPublished', ( publication ) => {

            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }
            _this.emit( 'localStreamAdded', { type: publication.kind, track: publication.track, stream: publication.track.mediaStreamTrack, user_id: this.room.localParticipant.identity, source: mediaType } );
        } );

        this.room.on( 'localTrackUnpublished', ( publication ) => {

            let mediaType;

            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }

            _this.emit( 'localStreamRemoved', { type: publication.kind, track: publication.track, user_id: this.room.localParticipant.identity, source: mediaType } );
        } );




        // Audio level changes (for active speakers)
        this.room.on( 'activeSpeakersChanged', ( speakers ) => {
            speakers.forEach( ( speaker ) => {
                _this.emit( 'speaking', { user_id: speaker.identity, level: speaker.audioLevel } );

            } );

        } );



        // Data received over data channel
        this.room.on( 'dataReceived', ( payload, participant, kind ) => {
            _this.emit( 'dataReceived', { data: payload, user_id: participant?.identity, type: kind } );
        } );

        //Media device error
        this.room.on( 'MediaDeviceFailure', ( error ) => {
            _this.emit( 'error', { code: 'MEDIA_DEVICE_ERROR', message: error.message } );
        } );

        //Media connection error
        this.room.on( 'mediaConnectionError', ( error ) => {
            _this.emit( 'error', { code: 'MEDIA_CONNECTION_ERROR', message: error.message } );
        } );

        //Track subscription error
        this.room.on( 'trackSubscriptionFailed', ( error ) => {
            _this.emit( 'error', { code: 'TRACK_SUBSCRIPTION_ERROR', message: error.message } );
        } );

        //Track publication error
        this.room.on( 'trackPublicationFailed', ( error ) => {
            _this.emit( 'error', { code: 'TRACK_PUBLICATION_ERROR', message: error.message } );
        } );

        try {
            await this.room.connect( this.serverUrl, token );
        } catch ( error ) {
            // If another disconnect/cancel already superseded this attempt, ignore.
            if ( attemptId !== this.connectAttempt ) return;
            _this.emit( 'error', { code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'connection_failed' } );
            return;
        }

        if ( attemptId !== this.connectAttempt || !this.isConnected() ) {
            try {
                if ( this.room?.state === 'connected' || this.room?.state === 'connecting' ) {
                    this.room.disconnect();
                }
            } catch ( _error ) { }
            return;
        }

        const localParticipant = this.room.localParticipant;




        localParticipant.on( 'trackUnmuted', ( publication ) => {
            let mediaType;
            if ( publication.source === 'microphone' ) {
                mediaType = 'audio';
            } else if ( publication.source === 'camera' ) {
                mediaType = 'video';
            } else if ( publication.source === 'screen' || publication.source === 'screen_share' ) {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }
            _this.emit( 'localStreamAdded', { type: publication.kind, track: publication.track, stream: publication.track.mediaStreamTrack, user_id: this.room.localParticipant.identity, source: mediaType } );
        } );





        this.localParticipant = this.room.localParticipant;


        if ( audio ) {
            try {
                if ( attemptId !== this.connectAttempt || !this.isConnected() ) return;
                await this.localParticipant.setMicrophoneEnabled( true );
            } catch ( error ) {
                if ( attemptId !== this.connectAttempt || !this.isConnected() ) return;
                _this.emit( 'error', { code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'microphone_publish_failed' } );
                return;
            }
        }

        if ( video ) {
            try {
                if ( attemptId !== this.connectAttempt || !this.isConnected() ) return;
                await this.localParticipant.setCameraEnabled( true );
            } catch ( error ) {
                if ( attemptId !== this.connectAttempt || !this.isConnected() ) return;
                _this.emit( 'error', { code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'camera_publish_failed' } );
                return;
            }
        }
    }


    isConnected () {


        if ( !this.room ) {
            return false;
        }



        if ( this.room.state == 'connected' ) {
            return true;
        }

        return false;
    }


    async mute ( _this ) {

        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_CALL_ENABLED', message: 'No call enabled' } );
            return;
        }


        if ( this.localParticipant.isMicrophoneEnabled ) {
            try {
                await this.localParticipant.setMicrophoneEnabled( false );
                _this.emit( 'muted', { audio: true, user_id: this.room.localParticipant.identity } );
            } catch ( error ) {
                _this.emit( 'error', { code: 'MUTE_ERROR', message: error?.message || 'mute_failed' } );
            }
        } else {
            _this.emit( 'error', { code: 'ALREADY_MUTED', message: 'Audio already muted' } );
        }

    }

    async unmute ( _this ) {

        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_CALL_ENABLED', message: 'No call enabled' } );
            return;
        }

        if ( !this.localParticipant.isMicrophoneEnabled ) {
            try {
                await this.localParticipant.setMicrophoneEnabled( true );
                _this.emit( 'unmuted', { audio: true, user_id: this.room.localParticipant.identity } );
            } catch ( error ) {
                _this.emit( 'error', { code: 'UNMUTE_ERROR', message: error.message } );
            }
        } else {
            _this.emit( 'error', { code: 'ALREADY_UNMUTED', message: 'Audio already unmuted' } );
        }
    }

    toggleAudio ( _this ) {
        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_CALL_ENABLED', message: 'No call enabled' } );
            return;
        }

        const currentlyMuted = !this.localParticipant.isMicrophoneEnabled;

        if ( currentlyMuted ) {
            this.unmute( _this );
        } else {
            this.mute( _this );
        }
    }


    async pause ( _this ) {
        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }
        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_CALL_ENABLED', message: 'No call enabled' } );
            return;
        }

        if ( this.localParticipant.isCameraEnabled ) {
            try {
                await this.localParticipant.setCameraEnabled( false );
                _this.emit( 'paused', { video: true, user_id: this.room.localParticipant.identity } );
            } catch ( error ) {
                _this.emit( 'error', { code: 'VIDEO_PAUSE_ERROR', message: error?.message || 'pause_failed' } );
            }
        } else {
            _this.emit( 'error', { code: 'ALREADY_PAUSED', message: 'Video already paused' } );
        }
    }

    async play ( _this ) {
        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_CALL_ENABLED', message: 'No call enabled' } );
            return;
        }

        if ( !this.localParticipant.isCameraEnabled ) {
            try {
                await this.localParticipant.setCameraEnabled( true );
                _this.emit( 'play', { video: true, user_id: this.room.localParticipant.identity } );
            } catch ( error ) {
                _this.emit( 'error', { code: 'VIDEO_PLAY_ERROR', message: error.message } );
            }
        } else {
            _this.emit( 'error', { code: 'ALREADY_PLAYING', message: 'Video already playing' } );
        }
    }


    toggleVideo ( _this ) {
        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_CALL_ENABLED', message: 'No call enabled' } );
            return;
        }

        const currentlyPaused = !this.localParticipant.isCameraEnabled;

        if ( currentlyPaused ) {
            this.play( _this );
        } else {
            this.pause( _this );
        }
    }


    async shareScreen ( _this ) {
        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_CALL_ENABLED', message: 'No call enabled' } );
            return;
        }

        if ( !this.localParticipant.isScreenShareEnabled ) {
            try {
                await this.localParticipant.setScreenShareEnabled( true );
                _this.emit( 'screenShared', { screen: true, user_id: this.room.localParticipant.identity } );
            } catch ( error ) {
                _this.emit( 'error', { code: 'SCREEN_SHARE_ERROR', message: error.message } );
            }
        } else {
            _this.emit( 'error', { code: 'ALREADY_SHARED', message: 'Screen already shared' } );
        }
    }

    async stopScreenShare ( _this ) {
        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to room' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_SESSION_ENABLED', message: 'No session enabled' } );
            return;
        }

        if ( this.localParticipant.isScreenShareEnabled ) {
            try {
                await this.localParticipant.setScreenShareEnabled( false );
                _this.emit( 'screenUnshared', { screen: true, user_id: this.room.localParticipant.identity } );
            } catch ( error ) {
                _this.emit( 'error', { code: 'SCREEN_UNSHARE_ERROR', message: error?.message || 'screen_unshare_failed' } );
            }
        } else {
            _this.emit( 'error', { code: 'ALREADY_UNSHARED', message: 'Screen already unshared' } );
        }

    }


    toggleScreenShare ( _this ) {
        if ( !this.isConnected() ) {
            _this.emit( 'error', { code: 'NOT_CONNECTED', message: 'Not connected to call' } );
            return;
        }

        if ( !this.localParticipant ) {
            _this.emit( 'error', { code: 'NO_SESSION_ENABLED', message: 'No session enabled' } );
            return;
        }

        const currentlyShared = this.localParticipant.isScreenShareEnabled;

        if ( currentlyShared ) {
            this.stopScreenShare( _this );
        } else {
            this.shareScreen( _this );
        }

    }



    isDisconnected () {

        if ( !this.room ) {
            return false;
        }

        return this.room.disconnected;
    }

    disconnect ( _this ) {
        this.connectAttempt += 1;

        if ( !this.room ) return;

        if ( this.room.state === 'connected' || this.room.state === 'connecting' ) {
            this.room.disconnect();
            return;
        }

        // No active room connection; this is a harmless no-op during cancel/cleanup.
        return;
    }





}

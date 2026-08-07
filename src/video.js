import {
    Room,
    VideoPresets,
    setLogLevel,
    LogLevel,
    AudioSession,
    AndroidAudioTypePresets,
    getDefaultAppleAudioConfigurationForMode
} from './livekit';

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stunind.telecmi.com:3478' },
    ],
    tcpCandidatePolicy: 'enabled',
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
};

setLogLevel(LogLevel.warn);
export default class Video {



    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.localParticipant = null;
        this.remoteParticipant = null;
        this.room = new Room({
            // automatically manage subscribed video quality
            adaptiveStream: true,

            // optimize publishing bandwidth and CPU for published tracks
            dynacast: true,

            // default capture settings
            videoCaptureDefaults: {
                resolution: VideoPresets.h720.resolution,
            },

            // ICE configuration for parity with the browser/Electron build.
            //
            // Chromium has TCP candidate gathering and STUN built in by default;
            // @livekit/react-native-webrtc on iOS does NOT, so we must enable
            // both explicitly — otherwise the iPhone only offers UDP host
            // candidates, never tries the server's TCP passive candidate at
            // :7881, and ICE silently times out at ~32s (the exact failure we
            // saw against sfu.connle.com, which works fine in Electron).
            //
            // - iceServers:        STUN for srflx (public IP) discovery
            // - tcpCandidatePolicy:'enabled' — gather TCP candidates on iOS
            // - iceTransportPolicy:'all' — try host, srflx, and (if any) relay
            // - bundlePolicy:      'max-bundle' — same as livekit-client default
            //
            // No media is relayed through STUN; it is only used for candidate
            // discovery. For symmetric NAT / CGNAT (some cellular networks) a
            // TURN relay is also needed — configure that on the LiveKit server
            // once it becomes necessary.
        });
        this.rtcConfig = RTC_CONFIG;
        this.connectAttempt = 0;

        // React Native call-control state (no-op on web).
        this.speakerOn = false;        // loudspeaker vs earpiece
        this.facingMode = 'user';      // 'user' = front camera, 'environment' = back

    }

    emitError(_this, error) {
        if (_this && typeof _this.emitError === 'function') {
            _this.emitError(error);
            return;
        }

        if (_this) {
            _this.emit('error', error);
        }
    }

    getAudioTrackState() {
        const localTracks = this.room?.localParticipant?.audioTrackPublications?.size || 0;
        let remoteTracks = 0;

        if (this.room?.remoteParticipants) {
            this.room.remoteParticipants.forEach((participant) => {
                remoteTracks += participant.audioTrackPublications?.size || 0;
            });
        }

        if (localTracks > 0 && remoteTracks > 0) return 'localAndRemote';
        if (localTracks > 0) return 'localOnly';
        if (remoteTracks > 0) return 'remoteOnly';
        return 'none';
    }

    syncAudioSessionTrackState() {
        // Re-assert the currently selected output after a track change so it
        // isn't reset (no-op on web). Routes ONLY through LiveKit's AudioManager
        // (selectAudioOutput) — never the raw setAppleAudioConfiguration, which
        // fights configureAudio() and splits audio across the earpiece AND the
        // loudspeaker at the same time.
        try {
            if (typeof AudioSession.selectAudioOutput === 'function') {
                this.setSpeaker(this.speakerOn);
            }
        } catch (_error) { }
    }

    async configureAudioSession(audio, video, _this) {
        if (!audio) return;

        // Video call -> loudspeaker (hands-free). Audio call -> earpiece (held to
        // the ear, like a phone call). Everything goes through LiveKit's
        // AudioManager — configureAudio() for the base session + selectAudioOutput
        // (via setSpeaker) for the route. A single source of truth, so the audio
        // can't end up playing on both outputs at once, and audio calls don't
        // force the loudspeaker (which also caused the echo).
        const preferSpeaker = !!video;

        try {
            if (typeof AudioSession.configureAudio === 'function') {
                const audioConfig = {
                    ios: { defaultOutput: preferSpeaker ? 'speaker' : 'earpiece' },
                };

                if (AndroidAudioTypePresets?.communication) {
                    audioConfig.android = {
                        audioTypeOptions: AndroidAudioTypePresets.communication,
                    };
                }

                await AudioSession.configureAudio(audioConfig);
            }

            if (typeof AudioSession.startAudioSession === 'function') {
                await AudioSession.startAudioSession();
            }

            if (typeof AudioSession.setDefaultRemoteAudioTrackVolume === 'function') {
                await AudioSession.setDefaultRemoteAudioTrackVolume(1);
            }

            // Explicitly route to the right output (sets this.speakerOn).
            await this.setSpeaker(preferSpeaker, _this);
        } catch (_error) {
            // Native audio routing setup should not block the media connection.
        }
    }

    getPublicationMediaType(publication) {
        if (publication?.source === 'microphone') {
            return 'audio';
        }
        if (publication?.source === 'camera') {
            return 'video';
        }
        if (publication?.source === 'screen' || publication?.source === 'screen_share') {
            return 'screen';
        }
        if (publication?.source === 'screen_share_audio') {
            return 'screen_audio';
        }
        return publication?.kind;
    }

    emitRemoteTrack(_this, track, publication, participant) {
        if (!track || !publication || !participant) return false;

        const mediaType = this.getPublicationMediaType(publication);
        _this.emit('streamAdded', {
            type: publication.kind || track.kind,
            track,
            stream: track.mediaStreamTrack,
            mediaStream: track.mediaStream,
            user_id: participant.identity,
            source: mediaType,
            track_sid: publication.trackSid || track.sid,
        });

        return true;
    }

    emitLocalTrack(_this, publication) {
        const track = publication?.track;
        if (!track) return false;

        const mediaType = this.getPublicationMediaType(publication);
        _this.emit('localStreamAdded', {
            type: publication.kind || track.kind,
            track,
            stream: track.mediaStreamTrack,
            mediaStream: track.mediaStream,
            user_id: this.room.localParticipant.identity,
            source: mediaType,
            track_sid: publication.trackSid || track.sid,
        });

        return true;
    }

    ensureRemotePublicationSubscribed(publication) {
        if (!publication) return;

        try {
            if (typeof publication.setEnabled === 'function' && publication.kind === 'video') {
                publication.setEnabled(true);
            }
            if (!publication.track && typeof publication.setSubscribed === 'function') {
                publication.setSubscribed(true);
            }
        } catch (_error) { }
    }

    syncRemoteParticipantTracks(_this, participant) {
        if (!participant?.trackPublications) return;

        participant.trackPublications.forEach((publication) => {
            this.ensureRemotePublicationSubscribed(publication);
            if (publication.track) {
                this.emitRemoteTrack(_this, publication.track, publication, participant);
            }
        });
    }

    syncRemoteTracks(_this) {
        if (!this.room?.remoteParticipants) return;

        this.room.remoteParticipants.forEach((participant) => {
            _this.emit('userConnected', { connected: true, user_id: participant.identity });
            this.syncRemoteParticipantTracks(_this, participant);
        });
    }


    cleanupListeners() {
        if (!this.room) return;

        // Remove all event listeners
        this.room.removeAllListeners('connected');
        this.room.removeAllListeners('disconnected');
        this.room.removeAllListeners('reconnecting');
        this.room.removeAllListeners('reconnected');
        this.room.removeAllListeners('participantConnected');
        this.room.removeAllListeners('participantDisconnected');
        this.room.removeAllListeners('trackPublished');
        this.room.removeAllListeners('trackUnpublished');
        this.room.removeAllListeners('trackSubscribed');
        this.room.removeAllListeners('trackUnsubscribed');
        this.room.removeAllListeners('activeSpeakersChanged');
        this.room.removeAllListeners('dataReceived');
        this.room.removeAllListeners('mediaDevicesError');
        this.room.removeAllListeners('mediaConnectionError');
        this.room.removeAllListeners('trackPublicationFailed');
        this.room.removeAllListeners('trackSubscriptionFailed');
        this.room.removeAllListeners('localTrackPublished');
        this.room.removeAllListeners('localTrackUnpublished');
        this.room.removeAllListeners('localTrackSubscribed');
        this.room.removeAllListeners('localTrackUnsubscribed');
        this.room.removeAllListeners('trackMuted');
        this.room.removeAllListeners('trackUnmuted');

        if (this.localParticipant) {
            this.localParticipant.removeAllListeners('trackMuted');
            this.localParticipant.removeAllListeners('trackUnmuted');
        }



    }

    async connect(audio = true, video = false, token, _this) {
        const attemptId = ++this.connectAttempt;
        this.cleanupListeners();

        // Connection state changes
        this.room.on('connected', () => {
            _this.emit('connected', { connected: true, user_id: this.room.localParticipant.identity });
            // Native call UI (RN): mark ACTIVE + assert Telecom unmute.
            if (_this._push && typeof _this._push.onMediaConnected === 'function') {
                _this._push.onMediaConnected(_this.callId);
            }
        });

        this.room.on('disconnected', (reason) => {
            _this.emit('disconnected', { connected: false, user_id: this.room.localParticipant.identity, reason });
            if (_this._push && typeof _this._push.onCallEnded === 'function') {
                _this._push.onCallEnded(_this.callId);
            }
        });

        this.room.on('reconnecting', () => {
            _this.emit('reconnecting', { reconnecting: true, user_id: this.room.localParticipant.identity });
        });

        this.room.on('reconnected', () => {
            _this.emit('reconnected', { reconnecting: false, user_id: this.room.localParticipant.identity });
        });

        // Participant events
        this.room.on('participantConnected', (participant) => {

            _this.emit('userConnected', { connected: true, user_id: participant.identity });
            this.syncRemoteParticipantTracks(_this, participant);

        });


        this.room.on('trackMuted', (publication, participant) => {

            // Handle mute (e.g., show a mute icon)

            if (participant.isLocal) {
                return;
            }


            let mediaType;
            if (publication.source === 'microphone') {
                mediaType = 'audio';
            } else if (publication.source === 'camera') {
                mediaType = 'video';
            } else if (publication.source === 'screen' || publication.source === 'screen_share') {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }


            if (publication.kind === 'video') {
                _this.emit('paused', { user_id: participant.identity, media: mediaType });
            } else if (publication.kind === 'audio') {
                _this.emit('muted', { user_id: participant.identity, media: 'audio' });
            }

        });

        this.room.on('trackUnmuted', (publication, participant) => {

            if (participant.isLocal) {
                return;
            }
            let mediaType;
            if (publication.source === 'microphone') {
                mediaType = 'audio';
            } else if (publication.source === 'camera') {
                mediaType = 'video';
            } else if (publication.source === 'screen' || publication.source === 'screen_share') {
                mediaType = 'screen';
            } else {
                mediaType = publication.kind; // Default to the kind if source is not recognized
            }

            if (publication.kind === 'video') {
                _this.emit('play', { user_id: participant.identity, media: mediaType });
            } else if (publication.kind === 'audio') {
                _this.emit('unmuted', { user_id: participant.identity, media: 'audio' });
            }

        });

        this.room.on('participantDisconnected', (participant) => {
            _this.emit('userDisconnected', { connected: false, user_id: participant.identity });
        });

        // Track events
        this.room.on('trackPublished', (publication, participant) => {

            const mediaType = this.getPublicationMediaType(publication);
            if (publication.kind === 'audio') this.syncAudioSessionTrackState();
            this.ensureRemotePublicationSubscribed(publication);
            _this.emit('mediaStarted', { media: publication.kind, user_id: participant.identity, source: mediaType });
        });

        this.room.on('trackUnpublished', (publication, participant) => {

            const mediaType = this.getPublicationMediaType(publication);
            if (publication.kind === 'audio') this.syncAudioSessionTrackState();
            _this.emit('mediaStopped', { media: publication.kind, user_id: participant.identity, source: mediaType });
        });


        this.room.on('trackSubscribed', (track, publication, participant) => {

            this.emitRemoteTrack(_this, track, publication, participant);
        });

        this.room.on('trackUnsubscribed', (track, publication, participant) => {

            const mediaType = this.getPublicationMediaType(publication);
            _this.emit('streamRemoved', { type: publication.kind, track: track || publication.track, user_id: participant.identity, source: mediaType });
        });



        this.room.on('localTrackPublished', (publication) => {

            if (publication.kind === 'audio') this.syncAudioSessionTrackState();
            this.emitLocalTrack(_this, publication);
        });

        this.room.on('localTrackUnpublished', (publication) => {

            const mediaType = this.getPublicationMediaType(publication);

            if (publication.kind === 'audio') this.syncAudioSessionTrackState();
            _this.emit('localStreamRemoved', { type: publication.kind, track: publication.track, user_id: this.room.localParticipant.identity, source: mediaType });
        });




        // Audio level changes (for active speakers)
        this.room.on('activeSpeakersChanged', (speakers) => {
            speakers.forEach((speaker) => {
                _this.emit('speaking', { user_id: speaker.identity, level: speaker.audioLevel });

            });

        });



        // Data received over data channel
        this.room.on('dataReceived', (payload, participant, kind) => {
            _this.emit('dataReceived', { data: payload, user_id: participant?.identity, type: kind });
        });

        //Media device error
        this.room.on('mediaDevicesError', (error) => {
            this.emitError(_this, { code: 'MEDIA_DEVICE_ERROR', message: error?.message || 'media_device_error' });
        });

        //Media connection error
        this.room.on('mediaConnectionError', (error) => {
            this.emitError(_this, { code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'media_connection_error' });
        });

        //Track subscription error
        this.room.on('trackSubscriptionFailed', (trackSid, participant, error) => {
            this.emitError(_this, {
                code: 'TRACK_SUBSCRIPTION_ERROR',
                message: error?.message || 'track_subscription_failed',
                track_sid: trackSid,
                user_id: participant?.identity,
            });
        });

        //Track publication error
        this.room.on('trackPublicationFailed', (error) => {
            this.emitError(_this, { code: 'TRACK_PUBLICATION_ERROR', message: error?.message || 'track_publication_failed' });
        });

        await this.configureAudioSession(audio, video, _this);

        try {
            await this.room.connect(this.serverUrl, token, {
                autoSubscribe: true,
                rtcConfig: this.rtcConfig,
                peerConnectionTimeout: 30000,
            });
        } catch (error) {
            // If another disconnect/cancel already superseded this attempt, ignore.
            if (attemptId !== this.connectAttempt) return;
            AudioSession.stopAudioSession().catch(() => { });
            this.emitError(_this, { code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'connection_failed' });
            return;
        }

        if (attemptId !== this.connectAttempt || !this.isConnected()) {
            try {
                if (this.room?.state === 'connected' || this.room?.state === 'connecting') {
                    this.room.disconnect();
                }
            } catch (_error) { }
            return;
        }

        const localParticipant = this.room.localParticipant;

        this.syncRemoteTracks(_this);




        localParticipant.on('trackUnmuted', (publication) => {
            this.emitLocalTrack(_this, publication);
        });





        this.localParticipant = this.room.localParticipant;


        if (audio) {
            try {
                if (attemptId !== this.connectAttempt || !this.isConnected()) return;
                await this.localParticipant.setMicrophoneEnabled(true);
            } catch (error) {
                if (attemptId !== this.connectAttempt || !this.isConnected()) return;
                this.emitError(_this, { code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'microphone_publish_failed' });
                return;
            }
        }

        if (video) {
            try {
                if (attemptId !== this.connectAttempt || !this.isConnected()) return;
                await this.localParticipant.setCameraEnabled(true);
            } catch (error) {
                if (attemptId !== this.connectAttempt || !this.isConnected()) return;
                this.emitError(_this, { code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'camera_publish_failed' });
                return;
            }
        }
    }


    isConnected() {


        if (!this.room) {
            return false;
        }



        if (this.room.state == 'connected') {
            return true;
        }

        return false;
    }


    async mute(_this) {

        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }


        if (this.localParticipant.isMicrophoneEnabled) {
            try {
                await this.localParticipant.setMicrophoneEnabled(false);
                _this.emit('muted', { audio: true, user_id: this.room.localParticipant.identity });
            } catch (error) {
                this.emitError(_this, { code: 'MUTE_ERROR', message: error?.message || 'mute_failed' });
            }
        } else {
            this.emitError(_this, { code: 'ALREADY_MUTED', message: 'Audio already muted' });
        }

    }

    async unmute(_this) {

        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }

        if (!this.localParticipant.isMicrophoneEnabled) {
            try {
                await this.localParticipant.setMicrophoneEnabled(true);
                _this.emit('unmuted', { audio: true, user_id: this.room.localParticipant.identity });
            } catch (error) {
                this.emitError(_this, { code: 'UNMUTE_ERROR', message: error?.message || 'unmute_failed' });
            }
        } else {
            this.emitError(_this, { code: 'ALREADY_UNMUTED', message: 'Audio already unmuted' });
        }
    }

    async toggleAudio(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }

        const currentlyMuted = !this.localParticipant.isMicrophoneEnabled;

        if (currentlyMuted) {
            await this.unmute(_this);
        } else {
            await this.mute(_this);
        }
    }


    async pause(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }
        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }

        if (this.localParticipant.isCameraEnabled) {
            try {
                await this.localParticipant.setCameraEnabled(false);
                _this.emit('paused', { video: true, user_id: this.room.localParticipant.identity });
            } catch (error) {
                this.emitError(_this, { code: 'VIDEO_PAUSE_ERROR', message: error?.message || 'pause_failed' });
            }
        } else {
            this.emitError(_this, { code: 'ALREADY_PAUSED', message: 'Video already paused' });
        }
    }

    async play(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }

        if (!this.localParticipant.isCameraEnabled) {
            try {
                await this.localParticipant.setCameraEnabled(true);
                _this.emit('play', { video: true, user_id: this.room.localParticipant.identity });
            } catch (error) {
                this.emitError(_this, { code: 'VIDEO_PLAY_ERROR', message: error?.message || 'play_failed' });
            }
        } else {
            this.emitError(_this, { code: 'ALREADY_PLAYING', message: 'Video already playing' });
        }
    }


    async toggleVideo(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }

        const currentlyPaused = !this.localParticipant.isCameraEnabled;

        if (currentlyPaused) {
            await this.play(_this);
        } else {
            await this.pause(_this);
        }
    }


    async shareScreen(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }

        if (!this.localParticipant.isScreenShareEnabled) {
            try {
                await this.localParticipant.setScreenShareEnabled(true);
                _this.emit('screenShared', { screen: true, user_id: this.room.localParticipant.identity });
            } catch (error) {
                this.emitError(_this, { code: 'SCREEN_SHARE_ERROR', message: error?.message || 'screen_share_failed' });
            }
        } else {
            this.emitError(_this, { code: 'ALREADY_SHARED', message: 'Screen already shared' });
        }
    }

    async stopScreenShare(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to room' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_SESSION_ENABLED', message: 'No session enabled' });
            return;
        }

        if (this.localParticipant.isScreenShareEnabled) {
            try {
                await this.localParticipant.setScreenShareEnabled(false);
                _this.emit('screenUnshared', { screen: true, user_id: this.room.localParticipant.identity });
            } catch (error) {
                this.emitError(_this, { code: 'SCREEN_UNSHARE_ERROR', message: error?.message || 'screen_unshare_failed' });
            }
        } else {
            this.emitError(_this, { code: 'ALREADY_UNSHARED', message: 'Screen already unshared' });
        }

    }


    async toggleScreenShare(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }

        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_SESSION_ENABLED', message: 'No session enabled' });
            return;
        }

        const currentlyShared = this.localParticipant.isScreenShareEnabled;

        if (currentlyShared) {
            await this.stopScreenShare(_this);
        } else {
            await this.shareScreen(_this);
        }

    }



    // Route call audio to the loudspeaker ( true ) or earpiece ( false ).
    // React Native only — on web the AudioSession stub makes this a no-op.
    async setSpeaker(enabled, _this) {
        this.speakerOn = !!enabled;
        try {
            if (typeof AudioSession.selectAudioOutput === 'function') {
                if (require('react-native').Platform.OS === 'ios' && typeof AudioSession.setAppleAudioConfiguration === 'function') {
                    await AudioSession.setAppleAudioConfiguration({
                        audioCategory: 'playAndRecord',
                        audioCategoryOptions: enabled
                            ? ['allowBluetooth', 'allowBluetoothA2DP', 'allowAirPlay', 'defaultToSpeaker']
                            : ['allowBluetooth'],
                        audioMode: enabled ? 'videoChat' : 'voiceChat'
                    });
                }

                let target = enabled ? 'force_speaker' : 'default';
                if (typeof AudioSession.getAudioOutputs === 'function') {
                    let outputs = [];
                    try { outputs = await AudioSession.getAudioOutputs(); } catch (_e) { outputs = []; }
                    if (Array.isArray(outputs) && outputs.length) {
                        if (outputs.includes('bluetooth')) {
                            target = 'bluetooth';
                        } else if (outputs.includes('headset')) {
                            target = 'headset';
                        } else if (enabled) {
                            target = outputs.includes('force_speaker') ? 'force_speaker'
                                : outputs.includes('speaker') ? 'speaker' : target;
                        } else {
                            target = outputs.includes('earpiece') ? 'earpiece'
                                : outputs.includes('default') ? 'default' : target;
                        }
                    }
                }
                await AudioSession.selectAudioOutput(target);
            }
            if (_this) _this.emit('speakerChanged', { speaker: this.speakerOn });
        } catch (error) {
            // console.error('setSpeaker failed:', error);
            this.emitError(_this, { code: 'SPEAKER_ERROR', message: error?.message || 'speaker_failed' });
        }
    }

    toggleSpeaker(_this) {
        this.setSpeaker(!this.speakerOn, _this);
    }

    // Flip between the front and back camera ( React Native ). On web it falls
    // back to a facingMode track restart, which most laptops ignore (one camera).
    async switchCamera(_this) {
        if (!this.isConnected()) {
            this.emitError(_this, { code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }
        if (!this.localParticipant) {
            this.emitError(_this, { code: 'NO_CALL_ENABLED', message: 'No call enabled' });
            return;
        }

        // Locate the local camera publication + track across livekit-client versions.
        let pub = null;
        let track = null;
        try {
            pub = typeof this.localParticipant.getTrackPublication === 'function'
                ? this.localParticipant.getTrackPublication('camera')
                : null;
            track = pub?.videoTrack || pub?.track || null;
        } catch (_e) { /* fall through to scan */ }

        if (!track && this.localParticipant.videoTrackPublications) {
            this.localParticipant.videoTrackPublications.forEach((p) => {
                if (!track && (p.source === 'camera' || p.track?.source === 'camera')) {
                    pub = p;
                    track = p.videoTrack || p.track || null;
                }
            });
            // last resort: any local video track
            this.localParticipant.videoTrackPublications.forEach((p) => {
                if (!track) { pub = p; track = p.videoTrack || p.track || null; }
            });
        }

        if (!track) {
            this.emitError(_this, { code: 'NO_CAMERA', message: 'No active camera to switch' });
            return;
        }

        const next = this.facingMode === 'environment' ? 'user' : 'environment';
        let lastError = null;
        const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

        const finish = () => {
            this.facingMode = next;
            // Re-emit the local track so consumers re-render the (re-acquired) preview.
            try { if (pub) this.emitLocalTrack(_this, pub); } catch (_e) { }
            if (_this) _this.emit('cameraSwitched', { facingMode: this.facingMode });
        };

        // Android: react-native-webrtc's native in-place toggle is the path
        // that actually flips — restartTrack's facingMode constraint is
        // silently ignored by the Android capturer (track restarts on the
        // same camera). iOS/web keep restartTrack first.
        if (isReactNative) {
            try {
                const nativeTrack = track.mediaStreamTrack;
                if (nativeTrack && typeof nativeTrack._switchCamera === 'function') {
                    nativeTrack._switchCamera();
                    finish();
                    return;
                }
            } catch (error) {
                lastError = error;
            }
        }

        // Primary (web/iOS): livekit-client restartTrack with the opposite
        // facing mode — stops, re-acquires and republishes.
        if (typeof track.restartTrack === 'function') {
            try {
                // facingMode only — don't pin a resolution, or a camera that can't
                // do that exact size throws OverconstrainedError and the flip fails.
                await track.restartTrack({ facingMode: next });
                finish();
                return;
            } catch (error) {
                lastError = error;
            }
        }

        // Fallback: react-native-webrtc's native camera toggle on the raw track.
        try {
            const nativeTrack = track.mediaStreamTrack;
            if (nativeTrack && typeof nativeTrack._switchCamera === 'function') {
                nativeTrack._switchCamera();
                finish();
                return;
            }
        } catch (error) {
            lastError = error;
        }

        this.emitError(_this, {
            code: 'SWITCH_CAMERA_ERROR',
            message: lastError?.message || 'switch_camera_failed'
        });
    }



    isDisconnected() {

        if (!this.room) {
            return false;
        }

        return this.room.disconnected;
    }

    disconnect(_this) {
        this.connectAttempt += 1;

        if (!this.room) return;

        if (this.room.state === 'connected' || this.room.state === 'connecting') {
            this.room.disconnect();
            // Release the native audio session (no-op on web).
            AudioSession.stopAudioSession().catch(() => { });
            return;
        }

        // No active room connection; this is a harmless no-op during cancel/cleanup.
        return;
    }





}

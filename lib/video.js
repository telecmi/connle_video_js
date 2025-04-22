import { Room, VideoPresets, setLogLevel, LogLevel } from 'livekit-client';
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
        resolution: VideoPresets.h720.resolution
      }
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
    this.room.removeAllListeners('mediaDeviceError');
    this.room.removeAllListeners('mediaConnectionError');
    this.room.removeAllListeners('trackPublicationFailed');
    this.room.removeAllListeners('trackSubscriptionFailed');
    this.room.removeAllListeners('localTrackPublished');
    this.room.removeAllListeners('localTrackUnpublished');
    this.room.removeAllListeners('localTrackSubscribed');
    this.room.removeAllListeners('localTrackUnsubscribed');
  }
  async connect(audio = true, video = false, token, _this) {
    this.cleanupListeners();

    // Connection state changes
    this.room.on('connected', () => {
      _this.emit('connected', {
        connected: true,
        user_id: this.room.localParticipant.identity
      });
    });
    this.room.on('disconnected', () => {
      _this.emit('disconnected', {
        connected: false,
        user_id: this.room.localParticipant.identity
      });
    });
    this.room.on('reconnecting', () => {
      _this.emit('reconnecting', {
        reconnecting: true,
        user_id: this.room.localParticipant.identity
      });
    });
    this.room.on('reconnected', () => {
      _this.emit('reconnected', {
        reconnecting: false,
        user_id: this.room.localParticipant.identity
      });
    });

    // Participant events
    this.room.on('participantConnected', participant => {
      _this.emit('userConnected', {
        connected: true,
        user_id: participant.identity
      });
      participant.on('trackMuted', publication => {
        // Handle mute (e.g., show a mute icon)

        if (publication.kind === 'video') {
          _this.emit('paused', {
            user_id: participant.identity,
            media: 'video'
          });
        } else if (publication.kind === 'audio') {
          _this.emit('muted', {
            user_id: participant.identity,
            media: 'audio'
          });
        }
      });
      participant.on('trackUnmuted', publication => {
        if (publication.kind === 'video') {
          _this.emit('play', {
            user_id: participant.identity,
            media: 'video'
          });
        } else if (publication.kind === 'audio') {
          _this.emit('unmuted', {
            user_id: participant.identity,
            media: 'audio'
          });
        }
      });
    });
    this.room.on('participantDisconnected', participant => {
      _this.emit('userDisconnected', {
        connected: false,
        user_id: participant.identity
      });
    });

    // Track events
    this.room.on('trackPublished', (publication, participant) => {
      console.log('trackPublished', publication);
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
      _this.emit('mediaStarted', {
        media: publication.kind,
        user_id: participant.identity,
        source: mediaType
      });
    });
    this.room.on('trackUnpublished', (publication, participant) => {
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
      _this.emit('mediaStopped', {
        media: publication.kind,
        user_id: participant.identity,
        source: mediaType
      });
    });
    this.room.on('trackSubscribed', (track, publication, participant) => {
      console.log('trackSubscribed', publication);
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
      _this.emit('streamAdded', {
        type: publication.kind,
        stream: track.mediaStreamTrack,
        user_id: participant.identity,
        source: mediaType
      });
    });
    this.room.on('trackUnsubscribed', (publication, participant) => {
      console.log('trackunsubscribed', publication);
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
      _this.emit('streamRemoved', {
        type: publication.kind,
        track: publication.track,
        user_id: participant.identity,
        source: mediaType
      });
    });
    this.room.on('localTrackPublished', publication => {
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
      _this.emit('localStreamAdded', {
        type: publication.kind,
        track: publication.track,
        media: publication.track.mediaStreamTrack,
        user_id: this.room.localParticipant.identity,
        source: mediaType
      });
    });
    this.room.on('localTrackUnpublished', publication => {
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
      _this.emit('localStreamRemoved', {
        type: publication.kind,
        track: publication.track,
        user_id: this.room.localParticipant.identity,
        source: mediaType
      });
    });

    // Audio level changes (for active speakers)
    this.room.on('activeSpeakersChanged', speakers => {
      speakers.forEach(speaker => {
        _this.emit('speaking', {
          user_id: speaker.identity,
          level: speaker.audioLevel
        });
      });
    });

    // Data received over data channel
    this.room.on('dataReceived', (payload, participant, kind) => {
      _this.emit('dataReceived', {
        data: payload,
        user_id: participant?.identity,
        type: kind
      });
    });

    //Media device error
    this.room.on('MediaDeviceFailure', error => {
      _this.emit('error', {
        code: 'MEDIA_DEVICE_ERROR',
        message: error.message
      });
    });

    //Media connection error
    this.room.on('mediaConnectionError', error => {
      _this.emit('error', {
        code: 'MEDIA_CONNECTION_ERROR',
        message: error.message
      });
    });

    //Track subscription error
    this.room.on('trackSubscriptionFailed', error => {
      _this.emit('error', {
        code: 'TRACK_SUBSCRIPTION_ERROR',
        message: error.message
      });
    });

    //Track publication error
    this.room.on('trackPublicationFailed', error => {
      _this.emit('error', {
        code: 'TRACK_PUBLICATION_ERROR',
        message: error.message
      });
    });
    await this.room.connect(this.serverUrl, token);
    this.localParticipant = this.room.localParticipant;
    console.log(this.localParticipant);
    if (audio) {
      await this.localParticipant.setMicrophoneEnabled(true);
    }
    if (video) {
      await this.localParticipant.setCameraEnabled(true);
    }
  }
  isConnected() {
    if (!this.room) {
      return false;
    }
    console.log(this.room.state);
    if (this.room.state == 'connected') {
      return true;
    }
    return false;
  }
  mute(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_CALL_ENABLED',
        message: 'No call enabled'
      });
      return;
    }
    if (this.localParticipant.isMicrophoneEnabled) {
      this.localParticipant.setMicrophoneEnabled(false);
      _this.emit('muted', {
        audio: true,
        user_id: this.room.localParticipant.identity
      });
    } else {
      _this.emit('error', {
        code: 'ALREADY_MUTED',
        message: 'Audio already muted'
      });
    }
  }
  unmute(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_CALL_ENABLED',
        message: 'No call enabled'
      });
      return;
    }
    if (!this.localParticipant.isMicrophoneEnabled) {
      try {
        this.localParticipant.setMicrophoneEnabled(true);
        _this.emit('unmuted', {
          audio: true,
          user_id: this.room.localParticipant.identity
        });
      } catch (error) {
        _this.emit('error', {
          code: 'UNMUTE_ERROR',
          message: error.message
        });
      }
    } else {
      _this.emit('error', {
        code: 'ALREADY_UNMUTED',
        message: 'Audio already unmuted'
      });
    }
  }
  toggleAudio(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_CALL_ENABLED',
        message: 'No call enabled'
      });
      return;
    }
    const currentlyMuted = !this.localParticipant.isMicrophoneEnabled;
    if (currentlyMuted) {
      this.unmute(_this);
    } else {
      this.mute(_this);
    }
  }
  pause(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_CALL_ENABLED',
        message: 'No call enabled'
      });
      return;
    }
    if (this.localParticipant.isCameraEnabled) {
      this.localParticipant.setCameraEnabled(false);
      _this.emit('paused', {
        video: true,
        user_id: this.room.localParticipant.identity
      });
    } else {
      _this.emit('error', {
        code: 'ALREADY_PAUSED',
        message: 'Video already paused'
      });
    }
  }
  play(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_CALL_ENABLED',
        message: 'No call enabled'
      });
      return;
    }
    if (!this.localParticipant.isCameraEnabled) {
      try {
        this.localParticipant.setCameraEnabled(true);
        _this.emit('play', {
          video: true,
          user_id: this.room.localParticipant.identity
        });
      } catch (error) {
        _this.emit('error', {
          code: 'VIDEO_PLAY_ERROR',
          message: error.message
        });
      }
    } else {
      _this.emit('error', {
        code: 'ALREADY_PLAYING',
        message: 'Video already playing'
      });
    }
  }
  toggleVideo(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_CALL_ENABLED',
        message: 'No call enabled'
      });
      return;
    }
    const currentlyPaused = !this.localParticipant.isCameraEnabled;
    if (currentlyPaused) {
      this.play(_this);
    } else {
      this.pause(_this);
    }
  }
  shareScreen(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_CALL_ENABLED',
        message: 'No call enabled'
      });
      return;
    }
    if (!this.localParticipant.isScreenShareEnabled) {
      try {
        this.localParticipant.setScreenShareEnabled(true);
        _this.emit('screenShared', {
          screen: true,
          user_id: this.room.localParticipant.identity
        });
      } catch (error) {
        _this.emit('error', {
          code: 'SCREEN_SHARE_ERROR',
          message: error.message
        });
      }
    } else {
      _this.emit('error', {
        code: 'ALREADY_SHARED',
        message: 'Screen already shared'
      });
    }
  }
  stopScreenShare(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to room'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_SESSION_ENABLED',
        message: 'No session enabled'
      });
      return;
    }
    if (this.localParticipant.isScreenShareEnabled) {
      this.localParticipant.setScreenShareEnabled(false);
      _this.emit('screenUnshared', {
        screen: true,
        user_id: this.room.localParticipant.identity
      });
    } else {
      _this.emit('error', {
        code: 'ALREADY_UNSHARED',
        message: 'Screen already unshared'
      });
    }
  }
  toggleScreenShare(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    if (!this.localParticipant) {
      _this.emit('error', {
        code: 'NO_SESSION_ENABLED',
        message: 'No session enabled'
      });
      return;
    }
    const currentlyShared = this.localParticipant.isScreenShareEnabled;
    if (currentlyShared) {
      this.stopScreenShare(_this);
    } else {
      this.shareScreen(_this);
    }
  }
  isDisconnected() {
    if (!this.room) {
      return false;
    }
    return this.room.disconnected;
  }
  disconnect(_this) {
    if (!this.isConnected()) {
      _this.emit('error', {
        code: 'NOT_CONNECTED',
        message: 'Not connected to call'
      });
      return;
    }
    this.room.disconnect();
  }
}
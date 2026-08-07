import io from 'socket.io-client';
import { EventEmitter } from 'events';
import Video from './video';
// Platform-resolved: push.native.js on React Native, push.js (no-op) on web.
import ConnlePush from './push';

const DEFAULT_MEDIA_URL = 'wss://sfu.connle.com';

export default class ConnlySignalling extends EventEmitter {
    constructor(serverUrl, token, mediaURL, options) {
        super();
        this.serverUrl = serverUrl;
        this.token = token;
        this.mediaURL = mediaURL || DEFAULT_MEDIA_URL;
        this.options = options || {};
        // Push wake-ups for incoming video calls (React Native only; no-op on
        // web). Registers this device's token with TeleCMI REST and receives
        // 'video_call'/'video_cancel' pushes — coexists with the voice SDK in
        // the same app via the shared TeleCMI push router. Disable with
        // { autoPush: false }.
        this._push = new ConnlePush(this, this.options.push);
        if (this.options.autoPush !== false) {
            try { this._push.start(); } catch { /* inert without push libs */ }
        }
        this.isConnected = false;
        this.eventHandlers = {};
        this.eventHandlers = {};
        this.video = new Video(this.mediaURL);
        this.pingInterval = null;
        this.answerInFlight = false;
        this.rejectInFlight = false;
        this.hangupInFlight = false;
        this.outboundCallInFlight = false;
        this.outboundCancelRequested = false;
        this.pendingIncomingCall = null;
        // The server sends every incoming call over BOTH the socket (web) and
        // push (mobile) — a foregrounded device receives it twice. Ring once.
        this._seenIncomingIds = [];
    }

    // Initialize a new connection
    connect() {
        // Check if socket is already connected, if so, disconnect it first
        if (this.socket && this.isConnected) {
            this.socket.removeAllListeners();
            this.disconnect();
        }

        // Initialize a new socket connection
        this.socket = io(this.serverUrl, {
            query: {
                token: this.token,
            },
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            timeout: 10000,
        });

        // Handle connection events
        this.socket.on('connect', () => {
            this.isConnected = true;
            // Register the device push token now — connect succeeding proves
            // this session's token is valid (same pattern as the voice SDK,
            // which registers on login success). Re-fires on every reconnect,
            // so a registration lost to a network blip converges.
            try { this._push.onConnected(); } catch { /* inert without push */ }
            if (this.onConnectCallback) this.onConnectCallback({ isConnected: this.isConnected });

            if (this.pingInterval) clearInterval(this.pingInterval);
            this.pingInterval = setInterval(() => {
                if (this.isConnected) {
                    this.socket.emit('connle_ping', { status: 'ping' }); // Send ping to the server
                }
            }, 300000);
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.answerInFlight = false;
            this.rejectInFlight = false;
            this.hangupInFlight = false;
            this.outboundCallInFlight = false;
            this.outboundCancelRequested = false;
            if (this.onDisconnectCallback) this.onDisconnectCallback({ isConnected: this.isConnected });
            // Stop pinging when disconnected
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null; // Ensure pingInterval is reset
            }
        });

        this.socket.io.on('reconnect_attempt', () => {

        });

        // Error handling
        this.socket.on('connect_error', (error) => {
            this.emitError(error);
        });

        this.socket.on('error', (error) => {
            this.emitError(error);
        });


        this.socket.on('connle_on_incoming_call', (data, callback) => {
            // Mobile with an active push token: the push is the ring (native
            // call UI) — the socket invite is ack'd but does not surface.
            // Web (and push-less native apps): socket rings as always.
            const suppressed = this._push && typeof this._push.suppressSocketIncoming === 'function'
                && this._push.suppressSocketIncoming();
            const duplicate = !suppressed && this._alreadyRinging(data?.call_id);
            let delivered = true;
            if (!suppressed && !duplicate) {
                this.prepareIncomingCall(data);
                delivered = this.deliverIncomingCall(data);
            }

            if (typeof callback === 'function') {
                callback({
                    code: 200,
                    message: delivered ? 'delivered' : 'queued',
                    call_id: data?.call_id,
                });
            }
        });

        this.socket.on('connle_on_ended', (data, callback) => {

            if (this._push && typeof this._push.onCallEnded === 'function') {
                this._push.onCallEnded(data?.call_id || this.callId);
            }
            if (this.video && typeof this.video.disconnect === 'function') {
                this.video.disconnect(this);
            }
            this.callId = null;
            this.callType = null;
            this.room_token = null;
            this.answerInFlight = false;
            this.rejectInFlight = false;
            this.hangupInFlight = false;
            this.outboundCallInFlight = false;
            this.outboundCancelRequested = false;
            if (typeof callback === 'function') {
                callback('delivered');
            }
            if (this.onEndedCallback) this.onEndedCallback(data);
        });

        this.socket.on('connle_on_status', (data) => {

            if (this.onStatusCallback) this.onStatusCallback(data);
        });

        this.socket.on('connle_on_answered', (data) => {
            this.callId = data?.call_id || this.callId;

            if (this.onAnsweredCallback) this.onAnsweredCallback(data);
        });
    }

    normalizeCallMedia(media) {
        const normalizeFlag = (value, fallback) => {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            if (typeof value === 'string') {
                const normalized = value.trim().toLowerCase();
                if (['true', '1', 'yes', 'y', 'video', 'audio_video', 'audio-video'].includes(normalized)) return true;
                if (['false', '0', 'no', 'n', 'audio'].includes(normalized)) return false;
            }
            return fallback;
        };

        if (media && typeof media === 'object') {
            const mediaType = media.type || media.media || media.kind || media.call_type;
            return {
                audio: normalizeFlag(media.audio, true),
                video: normalizeFlag(media.video, normalizeFlag(mediaType, false)),
            };
        }

        if (typeof media === 'string') {
            const normalized = media.toLowerCase();
            return {
                audio: true,
                video: normalized === 'video' || normalized === 'audio_video' || normalized === 'audio-video',
            };
        }

        return { audio: true, video: false };
    }

    prepareIncomingCall(data) {
        if (!data?.call_id) return;
        this.callId = data.call_id;
        this.callType = this.normalizeCallMedia(data?.media);
        this.room_token = data?.token;
        this.pendingIncomingCall = data;
    }

    deliverIncomingCall(data) {
        const hasCallback = typeof this.onIncomingCallCallback === 'function';
        const hasEventListeners = this.listenerCount('incomingCall') > 0;

        if (!hasCallback && !hasEventListeners) {
            this.pendingIncomingCall = data;
            return false;
        }

        try {
            if (hasCallback) this.onIncomingCallCallback(data);
            if (hasEventListeners) this.emit('incomingCall', data);
            this.pendingIncomingCall = null;
            return true;
        } catch (error) {
            this.emitError({ code: 'INCOMING_HANDLER_FAILED', message: error?.message || 'incoming_handler_failed' });
            return false;
        }
    }

    flushPendingIncomingCall() {
        if (this.pendingIncomingCall) {
            this.deliverIncomingCall(this.pendingIncomingCall);
        }
    }

    emitError(error) {
        if (this.onErrorCallback) this.onErrorCallback(error);
        if (this.listenerCount('error') > 0) {
            this.emit('error', error);
        }
    }

    // Connection Event Handlers
    onConnect(callback) {
        this.onConnectCallback = callback;
    }

    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }


    // Message Handling Methods
    sendMessage(messageContent, callback) {
        if (!this.isConnected) return;
        this.socket.emit('connle_message', messageContent, (ack) => {
            if (callback) callback(ack);
        });
    }

    onMessage(callback) {
        this.socket.on('connle_on_message', (data) => {
            if (callback) callback(data);
        });
    }


    onAnswered(callback) {
        this.onAnsweredCallback = callback;
    }


    onStatus(callback) {
        this.onStatusCallback = callback;
    }

    onEnded(callback) {

        this.onEndedCallback = callback;
    }

    // Incoming Call Handling Methods
    // --- push-delivered calls (React Native) ---
    // A video call arrived by push while the app was backgrounded/killed or
    // foreground: surface it exactly like a socket-delivered incoming call so
    // app UIs work unchanged (payload has transport:'push').
    _onPushIncoming(data) {
        try {
            if (this._alreadyRinging(data?.call_id)) return;
            // The push payload is self-sufficient (call_id, room, token) —
            // prepare so answer() works even when the app was launched cold.
            this.prepareIncomingCall(data);
            if (typeof this.onIncomingCallCallback === 'function') this.onIncomingCallCallback(data);
            this.emit('incomingCall', data);
            // Answer was already tapped on the native call screen while the
            // app was still starting — complete it now.
            if (this._push && this._push.consumePendingAnswer(data.call_id)) {
                this.answer(() => {});
            }
        } catch (error) {
            this.emitError({ code: 'PUSH_INCOMING_FAILED', message: error?.message || 'push_incoming_failed' });
        }
    }

    // True when this call_id already rang on this device (socket + push race);
    // records it otherwise. Keeps the last 20 ids.
    _alreadyRinging(call_id) {
        if (!call_id) return false;
        if (this._seenIncomingIds.includes(call_id)) return true;
        this._seenIncomingIds.push(call_id);
        if (this._seenIncomingIds.length > 20) this._seenIncomingIds.shift();
        return false;
    }

    // The call stopped ringing for this device: caller cancelled, or the user
    // answered/rejected on ANOTHER of their devices (multi-device dismissal).
    _onPushCancel(data) {
        try {
            const cid = String(data?.call_id || '');
            // Clear the pending incoming call so a stale Answer tap can't act
            // on a dead call — but never touch an ANSWERED (active) call.
            if (cid && this.pendingIncomingCall && String(this.pendingIncomingCall.call_id) === cid) {
                this.pendingIncomingCall = null;
                if (String(this.callId) === cid) {
                    this.callId = null;
                    this.room_token = null;
                }
            }
            this.emit('callCancelled', { ...data, transport: 'push' });
        } catch { /* ignore */ }
    }

    /** Remove this device's video push registration (e.g. on sign-out). */
    unregisterPush(callback) {
        this._push.unregister(callback);
    }

    onIncomingCall(callback) {

        this.onIncomingCallCallback = callback;
        this.flushPendingIncomingCall();
    }

    connectMedia(audio, video, token) {
        if (!token) {
            this.emitError({ code: 'MEDIA_TOKEN_MISSING', message: 'Media token missing' });
            return;
        }
        this.video.connect(audio, video, token, this).catch((error) => {
            this.emitError({ code: 'MEDIA_CONNECTION_ERROR', message: error?.message || 'media_connect_failed' });
        });
    }

    answer(callback) {
        if (!this.isConnected) {
            this.emitError({ code: 'NOT_CONNECTED', message: 'Not connected to call' });
            return;
        }
        if (!this.callId) {
            this.emitError({ code: 'NO_CALL_INVITE', message: 'No call invite' });
            return;
        }
        if (this.answerInFlight) return;

        this.answerInFlight = true;
        if (this._push && typeof this._push.markAnswered === 'function') this._push.markAnswered(this.callId);
        this.socket.emit('connle_answer_call', { call_id: this.callId }, async (ack) => {
            if (ack?.code === 200) {
                if (!this.video.isConnected()) {
                    let callType = this.callType || this.normalizeCallMedia();
                    // Runtime permissions before media (Android): camera denied
                    // on a video call degrades to audio-only instead of the
                    // native capturer aborting the process.
                    if (this._push && typeof this._push.ensureMediaPermissions === 'function') {
                        try { callType = await this._push.ensureMediaPermissions(callType); } catch { /* keep */ }
                    }
                    this.connectMedia(callType.audio, callType.video, this.room_token);
                }
            } else {
                this.emitError(ack || { code: 'ANSWER_FAILED', message: 'Answer failed' });
            }
            this.answerInFlight = false;
            if (callback) callback(ack);
        });
    }

    reject(callback) {
        if (!this.isConnected) return;
        if (!this.callId) return;
        if (this.rejectInFlight) return;
        this.rejectInFlight = true;
        this.socket.emit('connle_reject_call', { call_id: this.callId }, (ack) => {
            this.rejectInFlight = false;
            if (callback) callback(ack);
        });
    }


    call(userId, callType, callback) {

        if (!this.isConnected) return;

        // Validate userId
        if (typeof userId !== 'string' || userId.trim() === '') {
            if (callback) callback({ error: 'Invalid userId' });
            return;
        }

        // Validate callType
        if (typeof callType !== 'object') {
            if (callback) callback({ error: 'Invalid callType' });
            return;
        }

        // Validate callType.audio and callType.video
        if (typeof callType.audio !== 'boolean' || typeof callType.video !== 'boolean') {
            if (callback) callback({ error: 'Invalid callType' });
            return;
        }

        const callData = { userid: userId, media: callType };
        this.outboundCallInFlight = true;
        this.outboundCancelRequested = false;

        this.socket.emit('connle_call_user', callData, (ack) => {

            this.outboundCallInFlight = false;

            if (ack?.code === 100) {
                this.callId = ack?.call_id;

                if (this.outboundCancelRequested) {
                    this.outboundCancelRequested = false;
                    if (this.hangupInFlight) return;
                    this.hangupInFlight = true;
                    this.socket.emit('connle_hangup_call', { call_id: this.callId }, (cancelAck) => {
                        this.hangupInFlight = false;
                        if (callback) callback({ ...ack, cancelled: true, cancel_ack: cancelAck });
                    });
                    return;
                }

                this.connectMedia(callType.audio, callType.video, ack.token);
            }
            if (callback) callback(ack);
        });
    }




    // Error Handling
    onError(callback) {
        this.onErrorCallback = callback;
    }

    // Disconnect Method
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.isConnected = false;
        }
    }



    // Media Handling Methods
    onCall() {
        return this.video.isConnected(this);
    }

    mute() {
        this.video.mute(this);
    }

    unmute() {
        this.video.unmute(this);
    }

    async toggleAudio() {
        return await this.video.toggleAudio(this);
    }

    async toggleVideo() {
        return await this.video.toggleVideo(this);
    }

    async play() {
        return await this.video.play(this);
    }

    async pause() {
        return await this.video.pause(this);
    }

    async shareScreen() {
        return await this.video.shareScreen(this);
    }

    async stopScreenShare() {
        return await this.video.stopScreenShare(this);
    }

    async toggleScreenShare() {
        return await this.video.toggleScreenShare(this);
    }

    // Route call audio to the loudspeaker (true) or earpiece (false).
    // React Native only; no-op on web.
    setSpeaker(enabled) {
        this.video.setSpeaker(enabled, this);
    }

    toggleSpeaker() {
        this.video.toggleSpeaker(this);
    }

    // Flip between front and back camera (React Native).
    switchCamera() {
        this.video.switchCamera(this);
    }

    cancelOutgoingCall(callback_function) {
        if (!this.isConnected) {
            this.emitError({ code: 'NOT_CONNECTED', message: 'Not connected to signalling' });
            return;
        }

        if (this.callId) {
            this.hangup(callback_function);
            return;
        }

        if (this.outboundCallInFlight) {
            this.outboundCancelRequested = true;
            if (callback_function) callback_function({ code: 202, message: 'cancel_pending' });
            return;
        }

        if (callback_function) callback_function({ code: 200, message: 'no_active_call' });
    }

    hangup(callback_function) {

        if (!this.isConnected) {
            this.emitError({ code: 'NOT_CONNECTED', message: 'Not connected to signalling' });
            return;
        }

        this.outboundCancelRequested = false;

        if (this.callId) {
            if (this.hangupInFlight) return;
            this.hangupInFlight = true;
            this.socket.emit('connle_hangup_call', {
                call_id: this.callId
            }, (data) => {
                this.hangupInFlight = false;
                if (callback_function) callback_function(data);
            });

            if (this.video && typeof this.video.disconnect === 'function') {
                this.video.disconnect(this);
            }
            return;
        }

        if (this.video?.isConnected()) {
            this.video.disconnect(this);
        } else {
            this.emitError({ code: 'NOT_CONNECTED', message: 'Not connected to call' });
        }
    }


}

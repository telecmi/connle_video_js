"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _socket = _interopRequireDefault(require("socket.io-client"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var ConnlySDK = exports["default"] = /*#__PURE__*/function () {
  function ConnlySDK(serverUrl, token) {
    _classCallCheck(this, ConnlySDK);
    this.serverUrl = serverUrl;
    this.token = token;
    this.isConnected = false;
    this.eventHandlers = {};
    this.pingInterval = null;
  }

  // Initialize a new connection
  return _createClass(ConnlySDK, [{
    key: "connect",
    value: function connect() {
      var _this = this;
      // Check if socket is already connected, if so, disconnect it first
      if (this.socket && this.isConnected) {
        this.disconnect();
      }

      // Initialize a new socket connection
      this.socket = (0, _socket["default"])(this.serverUrl, {
        query: {
          token: this.token
        }
      });

      // Handle connection events
      this.socket.on('connect', function () {
        _this.isConnected = true;
        if (_this.onConnectCallback) _this.onConnectCallback({
          isConnected: _this.isConnected
        });
        if (_this.pingInterval) clearInterval(_this.pingInterval);
        _this.pingInterval = setInterval(function () {
          if (_this.isConnected) {
            console.log('ping');
            _this.socket.emit('connly_ping', {
              status: 'ping'
            }); // Send ping to the server
          }
        }, 300000);
      });
      this.socket.on('disconnect', function () {
        _this.isConnected = false;
        if (_this.onDisconnectCallback) _this.onDisconnectCallback({
          isConnected: _this.isConnected
        });
        // Stop pinging when disconnected
        if (_this.pingInterval) {
          clearInterval(_this.pingInterval);
          console.log('ping interval cleared');
          _this.pingInterval = null; // Ensure pingInterval is reset
        }
      });

      // Join team
      this.socket.on('connly_join_channel', function (data) {
        if (data !== null && data !== void 0 && data.channel_id) {
          _this.socket.emit('connly_on_join_channel', {
            channel_id: data.channel_id
          });
        }
      });

      // Join team
      this.socket.on('connly_leave_channel', function (data) {
        if (data !== null && data !== void 0 && data.channel_id) {
          _this.socket.emit('connly_on_leave_channel', {
            channel_id: data.channel_id
          });
        }
      });

      // Error handling
      this.socket.on('connect_error', function (error) {
        if (_this.onErrorCallback) _this.onErrorCallback(error);
      });
      this.socket.on('error', function (error) {
        if (_this.onErrorCallback) _this.onErrorCallback(error);
      });
    }

    // Connection Event Handlers
  }, {
    key: "onConnect",
    value: function onConnect(callback) {
      this.onConnectCallback = callback;
    }
  }, {
    key: "onDisconnect",
    value: function onDisconnect(callback) {
      this.onDisconnectCallback = callback;
    }

    // User Status Methods
  }, {
    key: "setStatus",
    value: function setStatus(status) {
      if (!this.isConnected) return;
      this.socket.emit('connly_status', {
        status: status
      });
    }
  }, {
    key: "onStatus",
    value: function onStatus(callback) {
      this.socket.on('connly_on_status', function (data) {
        callback(data);
      });
    }

    // Message Handling Methods
  }, {
    key: "sendMessage",
    value: function sendMessage(messageContent, callback) {
      if (!this.isConnected) return;
      this.socket.emit('connly_message', messageContent, function (ack) {
        if (callback) callback(ack);
      });
    }
  }, {
    key: "onMessage",
    value: function onMessage(callback) {
      this.socket.on('connly_on_message', function (data) {
        callback(data);
      });
    }

    // Message Handling Methods CX
  }, {
    key: "sendCXMessage",
    value: function sendCXMessage(messageContent, callback) {
      if (!this.isConnected) return;
      this.socket.emit('connly_cx_message', messageContent, function (ack) {
        if (callback) callback(ack);
      });
    }
  }, {
    key: "onCXMessage",
    value: function onCXMessage(callback) {
      this.socket.on('connly_on_cx_message', function (data) {
        callback(data);
      });
    }
  }, {
    key: "sendCXTemplate",
    value: function sendCXTemplate(messageContent, callback) {
      if (!this.isConnected) return;
      this.socket.emit('connly_cx_template', messageContent, function (ack) {
        if (callback) callback(ack);
      });
    }

    //Send Ractions
  }, {
    key: "sendReaction",
    value: function sendReaction(reaction, callback) {
      if (!this.isConnected) return;
      this.socket.emit('connly_reaction', reaction, function (data) {
        if (callback) callback(data);
      });
    }
  }, {
    key: "onReaction",
    value: function onReaction(callback) {
      this.socket.on('connly_on_reaction', function (data) {
        callback(data);
      });
    }

    // Send Reaction CX
  }, {
    key: "sendCXReaction",
    value: function sendCXReaction(reaction, callback) {
      if (!this.isConnected) return;
      this.socket.emit('connly_cx_reaction', reaction, function (data) {
        if (callback) callback(data);
      });
    }
  }, {
    key: "onCXReaction",
    value: function onCXReaction(callback) {
      this.socket.on('connly_on_cx_reaction', function (data) {
        callback(data);
      });
    }

    // Message Read Receipt Methods
  }, {
    key: "sendReadReceipt",
    value: function sendReadReceipt(details, callback) {
      if (!this.isConnected) return;
      this.socket.emit('connly_read_receipt', details, function (data) {
        if (callback) callback(data);
      });
    }
  }, {
    key: "onReadReceipt",
    value: function onReadReceipt(callback) {
      this.socket.on('connly_on_read_receipt', function (data) {
        callback(data);
      });
    }

    // Message Read Receipt Methods CX

    // Message Read Receipt Methods
  }, {
    key: "sendCXReadReceipt",
    value: function sendCXReadReceipt(details, callback) {
      if (!this.isConnected) return;
      this.socket.emit('connly_cx_read_receipt', details, function (data) {
        if (callback) callback(data);
      });
    }
  }, {
    key: "onCXReadReceipt",
    value: function onCXReadReceipt(callback) {
      this.socket.on('connly_on_cx_read_receipt', function (data) {
        callback(data);
      });
    }

    // Message Delivery Receipt Methods
  }, {
    key: "onDeliveryReceipt",
    value: function onDeliveryReceipt(callback) {
      this.socket.on('connly_on_delivery_receipt', function (data) {
        callback(data);
      });
    }

    // Message Delivery Receipt Methods CX
  }, {
    key: "onCXDeliveryReceipt",
    value: function onCXDeliveryReceipt(callback) {
      this.socket.on('connly_on_cx_delivery_receipt', function (data) {
        callback(data);
      });
    }

    // Typing Status Methods
  }, {
    key: "sendTypingStatus",
    value: function sendTypingStatus(details) {
      if (!this.isConnected) return;
      this.socket.emit('connly_type_status', details);
    }
  }, {
    key: "onTypingStatus",
    value: function onTypingStatus(callback) {
      this.socket.on('connly_on_type_status', function (data) {
        callback(data);
      });
    }

    // Typing Status Methods CX
  }, {
    key: "sendCXTypingStatus",
    value: function sendCXTypingStatus(details) {
      if (!this.isConnected) return;
      this.socket.emit('connly_cx_type_status', details);
    }
  }, {
    key: "onCXTypingStatus",
    value: function onCXTypingStatus(callback) {
      this.socket.on('connly_on_cx_type_status', function (data) {
        callback(data);
      });
    }

    // Call Action Methods
  }, {
    key: "onCallAction",
    value: function onCallAction(callback) {
      this.socket.on('connly_on_call_status', function (data) {
        callback(data);
      });
    }

    // Presence Methods
  }, {
    key: "onPresence",
    value: function onPresence(callback) {
      this.socket.on('connly_users_status', function (data) {
        callback(data);
      });
    }

    // Channel and user changes 
  }, {
    key: "onChange",
    value: function onChange(callback) {
      this.socket.on('connly_user_channel_changes', function (data) {
        callback(data);
      });
    }

    // Error Handling
  }, {
    key: "onError",
    value: function onError(callback) {
      this.onErrorCallback = callback;
    }

    // Disconnect Method
  }, {
    key: "disconnect",
    value: function disconnect() {
      if (this.socket) {
        this.socket.disconnect();
        this.isConnected = false;
      }
    }
  }]);
}();
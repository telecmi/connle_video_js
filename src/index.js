// Hermes lacks DOMException; livekit-client's WebRTC adapter `extends` it at
// module load, so the polyfill must run before anything below is required.
require( './polyfills' );

const ConnleVideo = require( './connly' ).default;
module.exports = ConnleVideo;
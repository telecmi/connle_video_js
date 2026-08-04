// Web build: browsers have no APNs/FCM — no-op with the same shape.
export default class ConnlePush {
    constructor() { }
    start() { return false; }
    unregister( callback ) { if ( typeof callback === 'function' ) callback( { code: 200, status: 'no push on web' } ); }
}

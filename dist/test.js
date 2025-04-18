import ConnlySDK from '../lib/index.js';

// Initialize Connly SDK
const connly = new ConnlySDK( 'http://localhost:2023', '' );

connly.connect();

connly.onConnect( ( data ) => {
    console.log( data );
} );

connly.onDisconnect( ( data ) => {
    console.log( data );
} );

connly.onMessage( ( data ) => {
    console.log( data );
} );



connly.onError( ( error ) => {
    console.log( error );
} );
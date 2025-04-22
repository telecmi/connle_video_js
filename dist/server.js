//express server provide file chat and index.html
const express = require( 'express' );
const path = require( 'path' );
const app = express();
const port = 3000;

app.use( express.static( 'dist' ) );

app.get( '/connleVideo.min.js', ( req, res ) => {
    res.sendFile( path.join( __dirname, 'connleVideo.min.js' ) );
} );
app.get( '/chat', ( req, res ) => {
    res.sendFile( path.join( __dirname, 'chat.html' ) );
} );
app.get( '/', ( req, res ) => {
    res.sendFile( path.join( __dirname, 'index.html' ) );
} );
app.listen( port, () => {
    console.log( `Server is running on port ${port}` );
} );

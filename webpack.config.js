const path = require( 'path' );
const HtmlWebpackPlugin = require( 'html-webpack-plugin' );

module.exports = {
    target: "web",
    entry: './src/index.js',
    output: {
        filename: 'connleVideo.min.js',
        path: path.resolve( __dirname, 'dist' ),
        libraryTarget: 'var',
        library: 'ConnleVideo'
    },
    devServer: {
        static: {
            directory: path.join( __dirname, 'dist' ),
        },
        compress: true,
        open: true,
        port: 9001,
        hot: true
    },
    plugins: [
        new HtmlWebpackPlugin( {
            template: './dist/index.html',
            filename: 'index.html',
            inject: 'head' // Inject script in head
        } ),

        // Chat page (uses same JS)
        new HtmlWebpackPlugin( {
            template: './dist/chat.html',
            filename: 'chat.html',
            inject: 'head' // Inject script in head
        } )
    ]
};


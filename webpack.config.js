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
        // Demo page template lives in public/ — NEVER in dist/ (dist is build
        // output; a template there gets edited with real credentials during
        // testing and then ships to npm — exactly the leak the piopiyjs
        // package had until 0.24).
        new HtmlWebpackPlugin( {
            template: './public/index.html',
            filename: 'index.html',
            inject: 'head'
        } )
    ]
};


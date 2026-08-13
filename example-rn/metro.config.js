const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Stock Metro config — the SDK is consumed from npm
 * (@telecmi/connle-video-native) exactly as in a customer app.
 */
module.exports = mergeConfig(getDefaultConfig(__dirname), {});

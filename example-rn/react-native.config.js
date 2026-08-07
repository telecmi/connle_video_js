const path = require('path');

module.exports = {
  dependencies: {
    // The SDK's bundled Android auto-init library (LiveKitReactNative.setup
    // via init provider). The example consumes the SDK from ../src, so point
    // autolinking at the repo root explicitly; apps installing the npm
    // package get this automatically.
    '@telecmi/connle-video-native': {
      root: path.resolve(__dirname, '..'),
      platforms: {ios: null},
    },
    // Firebase is Android-only here (iOS wakes via APNs VoIP push, not FCM).
    // Excluding it from iOS keeps Firebase pods out of the Xcode build and
    // avoids the RNFirebase static-library/modular-headers pod failure.
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};

module.exports = {
  dependencies: {
    // Firebase is Android-only here (iOS wakes via APNs VoIP push, not FCM).
    // Excluding it from iOS keeps Firebase pods out of the Xcode build and
    // avoids the RNFirebase static-library/modular-headers pod failure.
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};

// Per the Connle Video SDK setup guides: the call-related native modules
// ship NESTED inside @telecmi/connle-video-native — list them here so
// autolinking finds them (autolinking only scans direct dependencies).
module.exports = {
  dependencies: {
    '@livekit/react-native': {},
    '@livekit/react-native-webrtc': {},
    '@telecmi/react-native-callkeep': {},
    'react-native-voip-push-notification': {},
    // Firebase is Android-only (iOS uses VoIP push):
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};

// Surface the SDK's internal diagnostics (push token, routing) in Metro.
globalThis.__connleLog = (l) => console.log('[connle-video]', l);
/**
 * @format
 */

import {AppRegistry} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConnleVideo from '@telecmi/connle-video-native';
import App from './App';
import {name as appName} from './app.json';

// Cold boot: an incoming-call push can revive this app after it was killed,
// with the phone locked — no UI mounts, so the session must be created
// headlessly. The SDK invokes this factory the moment the cold ring arrives;
// by the time the user taps Answer on the lock screen the session is live.
ConnleVideo.registerColdBoot(async () => {
  const token = await AsyncStorage.getItem('example.token');
  if (!token) return; // never logged in — nothing to answer with
  const connle = new ConnleVideo(undefined, token); // production defaults
  globalThis.__connleColdSession = connle; // App adopts it if it mounts later
  connle.connect();
});

AppRegistry.registerComponent(appName, () => App);

// Surface the SDK's internal diagnostics (push token, routing) in Metro.
globalThis.__connleLog = (l) => console.log('[connle-video]', l);
/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);

const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// This example app lives *inside* the connle-video-sdk repo and consumes the
// SDK directly from source (no `npm install connle-video-sdk`, no rebuild).
// Metro is told:
//
//   * watchFolders -> also watch the SDK repo and its root node_modules.
//   * extraNodeModules -> resolve the bare import `connle-video-sdk` to
//     `../src`, so edits in SDK source are used immediately. Runtime SDK deps
//     (livekit-client, socket.io-client) resolve from the SDK root, while React
//     Native deps stay in THIS app's node_modules.
const projectRoot = __dirname;
const sdkRoot = path.resolve(projectRoot, '..');
const sdkSourceRoot = path.join(sdkRoot, 'src');
const appNodeModules = path.join(projectRoot, 'node_modules');
const sdkNodeModules = path.join(sdkRoot, 'node_modules');

/** @type {import('metro-config').MetroConfig} */
const config = {
  watchFolders: [sdkRoot],
  resolver: {
    extraNodeModules: new Proxy(
      {
        'connle-video-sdk': sdkSourceRoot,
        'livekit-client': path.join(sdkNodeModules, 'livekit-client'),
        'socket.io-client': path.join(sdkNodeModules, 'socket.io-client'),
      },
      {
        get: (target, name) =>
          Object.prototype.hasOwnProperty.call(target, name)
            ? target[name]
            : path.join(appNodeModules, String(name)),
      },
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);

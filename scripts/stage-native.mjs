// Stage the `@telecmi/connle-video-native` npm package from the shared build.
//
// One codebase, two published packages (same model as piopiyjs/piopiy-native):
//   • @telecmi/connle-video        — browser (root package.json)
//   • @telecmi/connle-video-native — React Native (this script generates it)
//
// Both consume the SAME src/lib; they differ only in package.json (name, deps).
// The version is synced from the root package.json so a single bump ships both.
// Run:  npm run stage:native   then:  cd native-pkg && npm publish
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'native-pkg');
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!existsSync(join(root, 'lib', 'push.native.js'))) {
  console.error('lib/ not built — run `npm run build-node` first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = [
  'lib',
  'android',
  'index.d.ts',
  'CHANGELOG.md',
  'README.react-native.md',
  'README.react-native-ios.md',
  'README.react-native-android.md',
];
for (const f of copy) {
  const src = join(root, f);
  if (existsSync(src)) {
    cpSync(src, join(out, f), {
      recursive: true,
      // gradle intermediates from in-tree example builds are dead weight
      // (1.1.0 shipped ~4MB of them — harmless, but never again).
      filter: (p) => !p.includes('android/build/') && !p.endsWith('android/build') && !p.includes('android/.gradle'),
      // ('android/build' as a bare prefix also matched android/build.gradle —
      // 1.1.2/1.1.3 shipped WITHOUT it and broke autolinking entirely)
    });
  }
}
// The RN landing page is the package's README.
cpSync(join(root, 'README.react-native.md'), join(out, 'README.md'));

const nativePkg = {
  name: '@telecmi/connle-video-native',
  title: 'Connle Video SDK for React Native (iOS & Android)',
  version: rootPkg.version, // synced — bump once, ship both
  publishConfig: { access: 'public' },
  description:
    'Official Connle video SDK for React Native — high-quality video/audio ' +
    'calls, native CallKit/ConnectionService ringing, and push wake-ups ' +
    'on iOS and Android.',
  main: 'lib/index.js',
  'react-native': 'lib/index.js',
  types: 'index.d.ts',
  files: [
    'lib',
    'android',
    'index.d.ts',
    'README.md',
    'README.react-native.md',
    'README.react-native-ios.md',
    'README.react-native-android.md',
    'CHANGELOG.md',
  ],
  scripts: {},
  repository: rootPkg.repository,
  keywords: [...(rootPkg.keywords || []), 'react-native', 'callkit', 'video-call', 'ios', 'android'],
  author: rootPkg.author,
  license: rootPkg.license,
  bugs: rootPkg.bugs,
  homepage: rootPkg.homepage,
  // Shared runtime + the bundled WebRTC/LiveKit engine. The engine pair is
  // pinned to the tested 2.8/125 line — identical to @telecmi/piopiy-native,
  // so a voice+video app dedupes to ONE engine copy.
  dependencies: {
    ...rootPkg.dependencies,
    '@livekit/react-native': '~2.8.0',
    '@livekit/react-native-webrtc': '~125.0.12',
    // Our CallKeep fork: upstream 4.3.16 + duplicate-@ReactMethod fix +
    // library-manifest ConnectionService merge. Bundled — apps install nothing.
    '@telecmi/react-native-callkeep': '^4.5.0',
    // iOS VoIP push. Apps list it in react-native.config.js (transitive deps
    // are not autolinked) and install nothing.
    'react-native-voip-push-notification': '^3.3.3',
  },
  // The app provides only React Native itself. (@react-native-firebase stays
  // an app install: Android-only, needs the app's google-services.json +
  // gradle plugin regardless.)
  peerDependencies: {
    'react-native': '>=0.60.0',
  },
};

writeFileSync(join(out, 'package.json'), JSON.stringify(nativePkg, null, 2) + '\n');

console.log(`Staged @telecmi/connle-video-native@${nativePkg.version} in ./native-pkg`);
console.log('Publish with:  cd native-pkg && npm publish');

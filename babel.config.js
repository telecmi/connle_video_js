// Build config for `npm run build-node` (src -> lib). preset-env keeps the
// output CommonJS-friendly for Node/Metro consumers; preset-react compiles
// the JSX in the Android lock-screen in-call shell (classic runtime — the
// component imports React explicitly).
module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { node: '14' } }],
        ['@babel/preset-react', { runtime: 'classic' }],
    ],
};

// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Exclude .env*.local files from Metro bundling.
// Without this, Metro picks up .env.dev.local / .env.prod.local as JS modules
// and Babel crashes trying to parse them (they contain # comments).
config.resolver.blockList = [
  ...(config.resolver.blockList ? [config.resolver.blockList].flat() : []),
  /\.env(\.\w+)?\.local$/,
];

module.exports = config;

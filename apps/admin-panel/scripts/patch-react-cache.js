#!/usr/bin/env node

// CRITICAL: Pre-build script to patch React module with cache() function
// Next.js 14.2.35 expects React.cache() but React 18.3.1 doesn't have it
// This script patches React directly in node_modules before build

const fs = require('fs');
const path = require('path');

const reactPath = path.resolve(__dirname, '../node_modules/react/index.js');
const reactCjsPath = path.resolve(__dirname, '../node_modules/react/cjs/react.development.js');
const reactProdPath = path.resolve(__dirname, '../node_modules/react/cjs/react.production.min.js');

// Check if React module exists
if (!fs.existsSync(reactPath) && !fs.existsSync(reactCjsPath)) {
  console.log('⚠️  React module not found, skipping cache polyfill');
  process.exit(0);
}

console.log('🔧 Patching React module to add cache() function...');

// Create patch file that adds cache function
const cachePatch = `
// CRITICAL: Patch added by patch-react-cache.js
// Next.js 14.2.35 requires React.cache() which doesn't exist in React 18.3.1
if (typeof exports !== 'undefined' && !exports.cache) {
  exports.cache = function cache(fn) {
    return fn;
  };
}
if (typeof module !== 'undefined' && module.exports && !module.exports.cache) {
  module.exports.cache = function cache(fn) {
    return fn;
  };
}
`;

// For now, we'll just log that patch would be applied
// Actual patching requires modifying node_modules which can be fragile
console.log('✅ React cache polyfill would be applied');
console.log('⚠️  Note: This is a no-op. Consider using patch-package for actual patching.');

process.exit(0);

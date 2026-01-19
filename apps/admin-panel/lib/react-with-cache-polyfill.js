// CRITICAL: Polyfill for React that adds cache() and preload() functions
// Next.js 14.2.3 expects React.cache() and React.preload() but React 18.2.0 doesn't have them
// This module exports React with cache and preload polyfills for Next.js build process
// This file should be used as a replacement for React in Next.js internal code

const React = require('react');

// Create a proxy that adds cache and preload functions without modifying original React
const ReactWithPolyfills = Object.create(React);

// Add cache function to React proxy
ReactWithPolyfills.cache = function cache(fn) {
  // No-op cache function that mimics React 19's cache() API
  // In React 18.2.0, we don't have real caching, so just return the function as-is
  // This is safe because Next.js build process only uses this during static generation
  // which we've already disabled with force-dynamic flags
  return fn;
};

// Add preload function to React proxy (React 19 feature)
ReactWithPolyfills.preload = function preload(href, options) {
  // No-op preload function that mimics React 19's preload() API
  // In React 18.2.0, we don't have preload, so just return a no-op
  // This is safe because Next.js uses this for resource hints which we can ignore in SSR
  return undefined;
};

// Ensure default export exists (for ESM compatibility)
ReactWithPolyfills.default = ReactWithPolyfills;

// Copy all React properties to the proxy
Object.setPrototypeOf(ReactWithPolyfills, React);

module.exports = ReactWithPolyfills;

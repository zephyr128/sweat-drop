// CRITICAL: Polyfill for React.cache() that Next.js 14.2.35 expects
// React 18.3.1 doesn't have React.cache(), so we provide a no-op implementation
// This is only used during build process by Next.js internals

/**
 * No-op cache function that mimics React 19's cache() API
 * @param {Function} fn - Function to cache
 * @returns {Function} - Cached version of the function (same function in this case)
 */
function cache(fn) {
  // In React 18.3.1, we don't have real caching, so just return the function as-is
  // This is safe because Next.js build process only uses this during static generation
  // which we've already disabled with force-dynamic flags
  return fn;
}

module.exports = cache;
module.exports.default = cache;

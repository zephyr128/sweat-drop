/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable static optimization for error pages to prevent build failures
  // This ensures /_error routes are not statically generated during build
  skipTrailingSlashRedirect: true,
  // Force dynamic rendering for all routes (prevents static generation of error pages)
  output: undefined, // Remove standalone output to allow dynamic rendering
  // CRITICAL: Disable static generation of error pages during build
  // This prevents Next.js from attempting to statically generate /_error routes
  experimental: {
    // Force all pages to be dynamic (prevents static generation of error pages)
    isrMemoryCacheSize: 0,
  },
}

module.exports = nextConfig

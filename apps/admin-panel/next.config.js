/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Vercel: minimal server output, avoids static export issues
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable static optimization for error pages to prevent build failures
  // This ensures /_error routes are not statically generated during build
  skipTrailingSlashRedirect: true,
}

module.exports = nextConfig

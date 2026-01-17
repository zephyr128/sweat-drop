/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false, // TypeScript errors will fail the build
  },
  eslint: {
    ignoreDuringBuilds: true, // Ignore ESLint during builds (lint separately)
  },
}

module.exports = nextConfig

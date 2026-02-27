/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
    unoptimized: true, // For local images
  },
  typescript: {
    // Skip type checking during build to avoid React type conflicts
    // Type checking should still be done via `pnpm type-check`
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig

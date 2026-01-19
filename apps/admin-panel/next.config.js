/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  serverExternalPackages: ['styled-jsx'], // Externalizes styled-jsx → uses your React 18.3.1

  // Remove any invalid experimental keys (typedRoutes, optimizePackageImports if boolean)
};

module.exports = nextConfig;

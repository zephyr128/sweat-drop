/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
    unoptimized: true, // For local images
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
  // NOTE on www → apex handling:
  //   We handle the www → apex redirect inside middleware.ts rather than here,
  //   because middleware lets us exclude /.well-known/* and /auth/* cleanly
  //   (both MUST be reachable directly on www without a 3xx redirect — see the
  //   long comment in middleware.ts for why).
}

module.exports = nextConfig

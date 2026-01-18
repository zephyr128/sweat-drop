/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent styled-jsx context crash on error pages without disabling anything else
  // No other experimental flags unless already needed
  // Transpile shared packages to ensure React is processed correctly
  transpilePackages: [],
  // NOTE: With .npmrc hoist=false, each workspace has its own node_modules
  // Next.js will automatically use React 18.2.0 from apps/admin-panel/node_modules
  // No webpack alias needed - the overrides in root package.json ensure correct version
  
  // CRITICAL: Explicitly expose environment variables for monorepo setup
  // This ensures Vercel environment variables are available at build and runtime
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

module.exports = nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent styled-jsx context crash on error pages without disabling anything else
  // No other experimental flags unless already needed
  // Transpile shared packages to ensure React is processed correctly
  transpilePackages: [],
  // NOTE: With .npmrc hoist=false, each workspace has its own node_modules
  // Next.js will automatically use React 18.2.0 from apps/admin-panel/node_modules
  // No webpack alias needed - the overrides in root package.json ensure correct version
  
  // NOTE: Next.js automatically exposes NEXT_PUBLIC_* variables
  // The `env` section is NOT needed and might cause object wrapping issues
  // Removing it to let Next.js handle env vars natively
  // env: {
  //   NEXT_PUBLIC_SUPABASE_URL: String(process.env.NEXT_PUBLIC_SUPABASE_URL || ''),
  //   NEXT_PUBLIC_SUPABASE_ANON_KEY: String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
  // },
};

module.exports = nextConfig

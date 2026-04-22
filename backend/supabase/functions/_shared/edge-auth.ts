/**
 * Internal service-role JWT used when one Edge Function calls another
 * (e.g. process-campaigns -> send-push).
 *
 * Context: Supabase has rolled out a new API key format (`sb_secret_...`)
 * that the platform now injects as `SUPABASE_SERVICE_ROLE_KEY` inside the
 * edge runtime. That value is NOT a JWT, so the gateway rejects it with
 * `UNAUTHORIZED_INVALID_JWT_FORMAT` when passed as `Authorization: Bearer`
 * for cross-function calls (which require a JWT until verify_jwt=false is
 * configured).
 *
 * The fix is to keep the JWT-format service role key (the one that still
 * works as a Bearer token) in a custom secret named `EDGE_INTERNAL_JWT`
 * and use it for internal function-to-function invocations. Database
 * operations can continue to use the platform-injected service role key.
 *
 * Set via:
 *   supabase secrets set EDGE_INTERNAL_JWT=<JWT-format service role key> \
 *     --project-ref <ref>
 *
 * Falls back to SUPABASE_SERVICE_ROLE_KEY when EDGE_INTERNAL_JWT is not set
 * so local dev (where the reserved secret is still a JWT) keeps working.
 */
export function getEdgeInternalJwt(): string {
  const jwt = Deno.env.get('EDGE_INTERNAL_JWT');
  if (jwt && jwt.length > 0) return jwt;
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

/**
 * Provider endpoint base normalization. One policy shared by discovery
 * (connection tests, /models) and generation (SDK base URLs) so the two
 * can never diverge for the same stored endpoint (audit F08).
 */

/**
 * Normalize an Anthropic endpoint to its versioned API base.
 *
 * The Vercel AI SDK appends `/messages` to the base it is given — and
 * only special-cases the exact official host when deciding whether to
 * insert `/v1`. Any other root or custom gateway prefix therefore
 * produced `.../messages` while the connection test was probing
 * `.../v1/models`: two different paths for one provider row.
 *
 * Rules (applied identically everywhere):
 * - strip trailing slashes
 * - a base that already ends in `/v1` is kept as-is (no double append)
 * - anything else (bare host, custom gateway prefix) gets `/v1` appended
 */
export function anthropicApiBase(endpointUrl: string): string {
  const base = endpointUrl.replace(/\/+$/, '')
  return /\/v1$/.test(base) ? base : `${base}/v1`
}

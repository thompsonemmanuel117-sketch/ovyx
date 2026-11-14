/**
 * Enforce OVYX's single supported remote AI inference engine.
 *
 * Cloudflare Pages bindings are preserved while legacy provider-routing flags,
 * account-specific AI Brain routing and client provider selections are ignored.
 * An explicitly configured Cloudflare paid-capped mode is preserved; otherwise
 * the guarded free-only mode is the safe default.
 */
export const OVYX_CLOUDFLARE_ONLY_PROVIDER = 'cloudflare-workers-ai';

export function withCloudflareAIOnly(env = {}) {
  const source = env && typeof env === 'object' ? env : {};
  const requestedMode = String(source.OVYX_AI_ENGINE_MODE || '').trim().toLowerCase();
  const engineMode = requestedMode === 'cloudflare-paid-capped'
    ? 'cloudflare-paid-capped'
    : 'cloudflare-free-only';

  return {
    ...source,
    OVYX_AI_ENGINE_MODE: engineMode,
    OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'false',
  };
}

export function cloudflareOnlyModelOptions(options = {}) {
  return {
    ...options,
    provider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
    preferredProvider: '',
    providerRouting: 'automatic',
    fallback: 'stop',
    useSelectedUniversalBrain: false,
  };
}

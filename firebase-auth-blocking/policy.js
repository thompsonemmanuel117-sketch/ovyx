const ALLOWED_NEW_ACCOUNT_PROVIDERS = new Set(['password']);

export function isAllowedNewAccountProvider(providerId) {
  return ALLOWED_NEW_ACCOUNT_PROVIDERS.has(String(providerId || '').trim().toLowerCase());
}

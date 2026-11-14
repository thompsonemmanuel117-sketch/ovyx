const PROPERTY_CASE = 'nigeria-lagos-real-estate';
const SHARED_NON_PROPERTY_CASES = Object.freeze([
  'uk-independent-restaurant',
  'us-independent-fashion',
  'japan-product-software',
]);

function isConfiguredAuthoritativePublicFeed(settings) {
  const rawUrl = String(settings?.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL || '').trim();
  const authority = String(settings?.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY || '').trim().toLowerCase();
  if (!rawUrl || authority !== 'authoritative') return false;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function selectLiveAcceptanceCases(settings = {}) {
  const hasAuthoritativeFeed = isConfiguredAuthoritativePublicFeed(settings);
  return {
    caseIds: hasAuthoritativeFeed
      ? [PROPERTY_CASE, ...SHARED_NON_PROPERTY_CASES]
      : ['nigeria-baby-products', ...SHARED_NON_PROPERTY_CASES],
    skippedCases: hasAuthoritativeFeed
      ? []
      : [{
          id: PROPERTY_CASE,
          reason: 'no-authoritative-public-listing-feed-configured',
          substitute: 'nigeria-baby-products',
        }],
  };
}

// Pure filtering helpers for Cloudflare Pages deployment log diagnostics.
// Cloudflare build logs include Git checkout notices; commit subjects are user-authored
// and can contain words such as "error" without indicating a failed deployment.
const VCS_INFORMATION_PATTERNS = Object.freeze([
  /^HEAD is now at [0-9a-f]{7,40}\b/i,
  /^Previous HEAD position was [0-9a-f]{7,40}\b/i,
  /^Switched to (?:a new )?branch\b/i,
  /^Already up to date\.?$/i,
  /^Updating [0-9a-f]{7,40}\.\.[0-9a-f]{7,40}\b/i,
  /^From https?:\/\//i,
]);

const ERROR_PATTERNS = Object.freeze([
  /\berror\b/i,
  /\bfailed\b/i,
  /\bfailure\b/i,
  /\bfatal\b/i,
  /\bexception\b/i,
  /\bunhandled\b/i,
  /\bpanic\b/i,
  /\bcrash\b/i,
  /permission denied/i,
  /module not found/i,
  /build failed/i,
  /deployment failed/i,
  /could not publish/i,
  /publish(?:ing)? (?:the )?function/i,
]);

export function isInformationalVcsLine(line) {
  const value = String(line ?? '').trim();
  return VCS_INFORMATION_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Keep a bounded, sanitized transcript so failures can be understood in context.
 * Only known log fields are copied; arbitrary Cloudflare response properties are
 * deliberately excluded from the diagnostics artifact.
 */
export function sanitizeCloudflareLogContext(lines, sanitizeLine = value => String(value ?? '').slice(0, 1200), options = {}) {
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 500));
  return (Array.isArray(lines) ? lines : [])
    .map(item => {
      const line = sanitizeLine(item?.line || item?.message || '');
      if (!line) return null;
      const timestamp = item?.timestamp || item?.created_on || item?.time || null;
      const level = item?.level || item?.type || null;
      return {
        ...(timestamp ? { timestamp: String(timestamp).slice(0, 80) } : {}),
        ...(level ? { level: String(level).slice(0, 40) } : {}),
        line,
      };
    })
    .filter(Boolean)
    .slice(-limit);
}

export function findCloudflareLogErrors(lines, sanitizeLine = value => String(value ?? '').slice(0, 1200)) {
  return (Array.isArray(lines) ? lines : [])
    .map(item => sanitizeLine(item?.line || item?.message || ''))
    .filter(line => line && !isInformationalVcsLine(line))
    .filter(line => ERROR_PATTERNS.some(pattern => pattern.test(line)))
    .slice(-150);
}

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
  /error/i,
  /failed/i,
  /failure/i,
  /fatal/i,
  /exception/i,
  /unhandled/i,
  /panic/i,
  /crash/i,
  /permission denied/i,
  /module not found/i,
  /build failed/i,
  /deployment failed/i,
]);

export function isInformationalVcsLine(line) {
  const value = String(line ?? '').trim();
  return VCS_INFORMATION_PATTERNS.some(pattern => pattern.test(value));
}

export function findCloudflareLogErrors(lines, sanitizeLine = value => String(value ?? '').slice(0, 1200)) {
  return (Array.isArray(lines) ? lines : [])
    .map(item => sanitizeLine(item?.line || item?.message || ''))
    .filter(line => line && !isInformationalVcsLine(line))
    .filter(line => ERROR_PATTERNS.some(pattern => pattern.test(line)))
    .slice(-150);
}

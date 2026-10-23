// Keep the host policy pure so tests can import it without executing the
// billable live-generation CLI entry point.
export function isTrustedGithubOidcRequestHostname(rawHostname) {
  const hostname = String(rawHostname || '').toLowerCase().replace(/\.$/, '');
  return hostname === 'pipelines.actions.githubusercontent.com' ||
    /^run-actions-\d+-[a-z0-9]+(?:-[a-z0-9]+)*\.actions\.githubusercontent\.com$/.test(hostname);
}

export function isTrustedGithubOidcRequestUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '')); } catch { return false; }
  return url.protocol === 'https:' &&
    isTrustedGithubOidcRequestHostname(url.hostname) &&
    !url.username && !url.password && !url.hash && !url.port;
}

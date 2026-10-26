const COMMIT_SHA = /^[a-f0-9]{40}$/i;
const PROJECT_SUBDOMAIN = /^[a-z0-9][a-z0-9-]*\.pages\.dev$/i;
const DEPLOYMENT_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i;

export function normalizePagesSubdomain(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return PROJECT_SUBDOMAIN.test(host) ? host : null;
}

/**
 * Select only a successful production Pages deployment built from this exact
 * GitHub commit. Never fall back to the stable project hostname: it can still
 * serve an older release while Cloudflare finishes switching deployments.
 */
export function findExactCommitDeployment(deployments, expectedCommitSha, canonicalSubdomain) {
  const commit = String(expectedCommitSha || '').trim().toLowerCase();
  if (!COMMIT_SHA.test(commit)) throw new Error('A full 40-character GitHub commit SHA is required to verify live website acceptance.');
  const projectHost = normalizePagesSubdomain(canonicalSubdomain);
  if (!projectHost) throw new Error('Cloudflare did not return a valid canonical Pages subdomain.');

  const candidates = (Array.isArray(deployments) ? deployments : [])
    .filter(item =>
      String(item?.environment || '').trim().toLowerCase() === 'production' &&
      String(item?.deployment_trigger?.metadata?.commit_hash || '').trim().toLowerCase() === commit
    )
    .sort((a, b) =>
      (Date.parse(b.created_on || b.created_at || '') || 0) -
      (Date.parse(a.created_on || a.created_at || '') || 0)
    );

  for (const deployment of candidates) {
    if (String(deployment?.latest_stage?.name || '').trim().toLowerCase() !== 'deploy' ||
        String(deployment?.latest_stage?.status || '').trim().toLowerCase() !== 'success') continue;

    const id = String(deployment?.id || '').trim().toLowerCase();
    if (!DEPLOYMENT_ID.test(id)) continue;

    const expectedHost = id.slice(0, 8) + '.' + projectHost;
    let reported;
    try { reported = new URL(String(deployment?.url || '')); } catch { continue; }
    if (reported.protocol !== 'https:' ||
        reported.username || reported.password || reported.port ||
        reported.pathname !== '/' || reported.search || reported.hash ||
        reported.hostname.toLowerCase() !== expectedHost) continue;

    return {
      id,
      commitSha: commit,
      origin: 'https://' + expectedHost,
      createdOn: String(deployment.created_on || deployment.created_at || ''),
      stage: 'deploy/success',
    };
  }
  return null;
}

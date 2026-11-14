export default {
  async scheduled(_event, env, execution) {
    execution.waitUntil((async () => {
      const base = String(env.OVYX_SENTINEL_BASE_URL || '').trim().replace(/\/+$/, '');
      const secret = String(env.OVYX_SENTINEL_CRON_SECRET || '');
      let target;
      try { target = new URL('/api/admin/sentinel', base); } catch { target = null; }
      if (!target || target.protocol !== 'https:' || target.username || target.password || secret.length < 32) {
        console.error('[OVYX Sentinel Scheduler] Required configuration is missing or invalid.');
        return;
      }
      try {
        const response = await fetch(target.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-ovyx-sentinel-cron-secret': secret },
          body: JSON.stringify({ action: 'scan', source: 'scheduled' }),
          redirect: 'manual',
          signal: AbortSignal.timeout(45000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok !== true) {
          console.error('[OVYX Sentinel Scheduler] Scan not confirmed. HTTP ' + response.status + '; code=' + String(data.error || 'UNKNOWN').slice(0, 80));
          return;
        }
        console.log('[OVYX Sentinel Scheduler] Stored scan: ' + String(data.report?.status || 'unknown') + ', critical=' + Number(data.report?.criticalCount || 0) + ', warnings=' + Number(data.report?.warningCount || 0));
      } catch (error) {
        console.error('[OVYX Sentinel Scheduler] Scan request failed: ' + (error?.name === 'AbortError' ? 'timeout' : 'network error'));
      }
    })());
  },
  async fetch() {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  },
};

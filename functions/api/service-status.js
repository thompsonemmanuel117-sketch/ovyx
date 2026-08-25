// functions/api/service-status.js
// GET /api/service-status
//
// Reports which secrets are actually configured in Cloudflare, WITHOUT ever
// sending the key values themselves back to the browser. This is what makes
// the "Connected / Not Configured" badges in the ForgeOS Admin screens real
// instead of decorative.
//
// Status values match what the ForgeOS frontend already expects:
//   CONFIGURED      -> the secret exists on the server (not yet live-tested)
//   NOT_CONFIGURED  -> the secret is missing
// (CONNECTED / CONNECTION_FAILED are set client-side after a live test via
// /api/test-provider, so this endpoint never returns those.)

export async function onRequestGet(context) {
    const { env } = context;

    const has = (name) => Boolean(env[name] && String(env[name]).trim().length > 0);

    const knownKeys = new Set([
        'FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'GITHUB_TOKEN', 'GITHUB_REPO',
        'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
        'FORGEOS_INSTALLATION_ID', 'CLOUDFLARE_PAGES_URL',
    ]);

    // Real dynamic detection: any environment variable that LOOKS like an
    // API key or token (by naming convention), that isn't one of the ones
    // already shown above, gets picked up automatically - no new code
    // needed when a new key is added in Cloudflare. Only the NAME is ever
    // reported, never the value.
    const additionalKeys = [];
    try {
        for (const key of Object.keys(env)) {
            if (knownKeys.has(key)) continue;
            if (typeof env[key] !== 'string') continue; // skip bindings (KV, etc.), only plain vars/secrets
            if (/_(API_KEY|TOKEN|SECRET|KEY)$/i.test(key) && env[key].trim().length > 0) {
                additionalKeys.push(key);
            }
        }
    } catch { /* env enumeration not available in this runtime - skip gracefully */ }

    const body = {
        forgeos: {
            // If this function is running at all, ForgeOS's backend is reachable.
            recognized: true,
            installationId: env.FORGEOS_INSTALLATION_ID || '',
        },
        firebase: {
            status: has('FIREBASE_API_KEY') && has('FIREBASE_PROJECT_ID') ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        github: {
            status: has('GITHUB_TOKEN') ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        cloudflare: {
            // Cloudflare is, by definition, connected if this function executed.
            status: 'CONFIGURED',
        },
        gemini: {
            status: has('GEMINI_API_KEY') ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        deepseek: {
            status: has('DEEPSEEK_API_KEY') ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        openai: {
            status: has('OPENAI_API_KEY') ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        anthropic: {
            status: has('ANTHROPIC_API_KEY') ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        // Any other key Cloudflare has that looks like a credential -
        // detected automatically, name only.
        additionalKeysDetected: additionalKeys,
    };

    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });
}

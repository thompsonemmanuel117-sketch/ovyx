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
    };

    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });
      }

// functions/api/test-provider.js
// POST /api/test-provider   body: { provider, message }
//
// Used by the "Send Test" button in Admin -> AI Brain. Confirms the stored
// key actually works by making one real call to the provider. The key itself
// never leaves the server.

import { getProviderKey, callProvider } from './_lib/providers.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Invalid request body.' }, 400);
    }

    const { provider, message } = body || {};
    if (!provider) {
        return json({ success: false, error: 'No provider specified.' }, 400);
    }

    const apiKey = getProviderKey(provider, env);
    if (!apiKey) {
        return json({ success: false, error: `${provider} is not configured on the server.` }, 200);
    }

    try {
        const response = await callProvider(provider, apiKey, message || 'Reply with: ForgeOS AI connection successful.');
        return json({ success: true, response });
    } catch (err) {
        return json({ success: false, error: err.message || 'Provider request failed.' }, 200);
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// functions/api/chat.js
// POST /api/chat   body: { message, provider }
//
// Powers the ForgeOS AI Assistant chat panel. Looks up the right server-side
// key for the requested provider and forwards the user's message to it.

import { getProviderKey, callProvider } from './_lib/providers.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }

    const { message, provider } = body || {};
    if (!message || !provider) {
        return json({ error: 'A message and provider are required.' }, 400);
    }

    const apiKey = getProviderKey(provider, env);
    if (!apiKey) {
        return json({ error: `${provider} is not configured on the server.` }, 200);
    }

    try {
        const response = await callProvider(provider, apiKey, message);
        return json({ response });
    } catch (err) {
        return json({ error: err.message || 'The AI provider could not be reached.' }, 200);
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

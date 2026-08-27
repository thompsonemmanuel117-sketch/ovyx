// functions/api/_lib/providers.js
// Shared helper: given a provider name + the server-side env, actually call that
// provider's API. Used by both /api/test-provider and /api/chat so the two
// endpoints never get out of sync with each other.

// Maps each provider id (as used by the ForgeOS frontend) to the name of the
// Cloudflare environment variable / secret that should hold its API key.
export const PROVIDER_ENV_KEYS = {
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
};

export function getProviderKey(provider, env) {
    const envName = PROVIDER_ENV_KEYS[provider];
    if (!envName) return null;
    return env[envName] || null;
}

// Calls the given provider with a single user message and returns the plain
// text reply. Throws an Error with a human-readable message on failure.
export async function callProvider(provider, apiKey, message, env = {}) {
    switch (provider) {
        case 'deepseek':
            return callOpenAICompatible('https://api.deepseek.com/chat/completions', 'deepseek-chat', apiKey, message);
        case 'openai':
            // Dynamically checks for your Cloudflare Base URL; falls back to standard OpenAI if missing.
            // Also swaps model to llama-3.3-70b-specdec if a Groq base URL is detected.
            const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
            const cleanUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/chat/completions`;
            const modelName = cleanUrl.includes('groq.com') ? 'llama-3.3-70b-specdec' : 'gpt-4o-mini';
            return callOpenAICompatible(cleanUrl, modelName, apiKey, message);
        case 'gemini':
            return callGemini(apiKey, message);
        case 'anthropic':
            return callAnthropic(apiKey, message);
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

async function callOpenAICompatible(url, model, apiKey, message) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: message }],
            max_tokens: 300,
        }),
    });
    const rawText = await res.text();
    let data;
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(`Provider returned an unreadable response (status ${res.status}).`);
    }
    if (!res.ok) {
        throw new Error(data?.error?.message || `Request failed (${res.status})`);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Provider returned an empty response.');
    return text;
}

async function callAnthropic(apiKey, message) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 300,
            messages: [{ role: 'user', content: message }],
        }),
    });
    const rawText = await res.text();
    let data;
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(`Provider returned an unreadable response (status ${res.status}).`);
    }
    if (!res.ok) {
        throw new Error(data?.error?.message || `Request failed (${res.status})`);
    }
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('Provider returned an empty response.');
    return text;
}

async function callGemini(apiKey, message) {
    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: message }] }],
        }),
    });
    const rawText = await res.text();
    let data;
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(`Provider returned an unreadable response (status ${res.status}).`);
    }
    if (!res.ok) {
        throw new Error(data?.error?.message || `Request failed (${res.status})`);
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Provider returned an empty response.');
    return text;
}
    

// functions/api/_lib/providers.js
//
// Shared provider helper for ForgeOS AI.
// Used by:
//   /api/test-provider
//   /api/chat
//
// IMPORTANT:
// API keys must remain server-side in Cloudflare environment variables/secrets.
// Never expose them to the frontend.

export const PROVIDER_ENV_KEYS = {
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
};

export function getProviderKey(provider, env) {
    const envName = PROVIDER_ENV_KEYS[provider];

    if (!envName) {
        return null;
    }

    return env?.[envName] || null;
}

/**
 * Call an AI provider with one user message.
 *
 * @param {string} provider
 * @param {string} apiKey
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function callProvider(provider, apiKey, message) {
    if (!apiKey) {
        throw new Error(`API key is not configured for ${provider}.`);
    }

    if (!message || typeof message !== 'string') {
        throw new Error('Message is required.');
    }

    switch (provider) {
        case 'deepseek':
            return callDeepSeek(apiKey, message);

        case 'openai':
            return callOpenAI(apiKey, message);

        case 'gemini':
            return callGemini(apiKey, message);

        case 'anthropic':
            return callAnthropic(apiKey, message);

        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}


/* =========================================================
   DEEPSEEK
   ========================================================= */

async function callDeepSeek(apiKey, message) {
    const res = await fetch(
        'https://api.deepseek.com/chat/completions',
        {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },

            body: JSON.stringify({
                model: 'deepseek-v4-flash',

                messages: [
                    {
                        role: 'user',
                        content: message,
                    },
                ],

                max_tokens: 300,

                stream: false,
            }),
        }
    );

    return parseOpenAICompatibleResponse(res, 'DeepSeek');
}


/* =========================================================
   OPENAI
   ========================================================= */

async function callOpenAI(apiKey, message) {
    const res = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },

            body: JSON.stringify({
                model: 'gpt-4o-mini',

                messages: [
                    {
                        role: 'user',
                        content: message,
                    },
                ],

                max_tokens: 300,

                stream: false,
            }),
        }
    );

    return parseOpenAICompatibleResponse(res, 'OpenAI');
}


/* =========================================================
   GEMINI
   ========================================================= */

async function callGemini(apiKey, message) {
    const model = 'gemini-3.7-flash';

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const res = await fetch(
        url,
        {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },

            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: message,
                            },
                        ],
                    },
                ],

                generationConfig: {
                    maxOutputTokens: 300,
                },
            }),
        }
    );

    const rawText = await res.text();

    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(
            `Gemini returned an unreadable response (HTTP ${res.status}).`
        );
    }

    if (!res.ok) {
        const message =
            data?.error?.message ||
            `Gemini request failed (${res.status}).`;

        throw new Error(message);
    }

    const text =
        data?.candidates?.[0]?.content?.parts
            ?.map(part => part?.text || '')
            .join('')
            .trim();

    if (!text) {
        throw new Error('Gemini returned an empty response.');
    }

    return text;
}


/* =========================================================
   ANTHROPIC
   ========================================================= */

async function callAnthropic(apiKey, message) {
    const res = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },

            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',

                max_tokens: 300,

                messages: [
                    {
                        role: 'user',
                        content: message,
                    },
                ],
            }),
        }
    );

    const rawText = await res.text();

    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(
            `Anthropic returned an unreadable response (HTTP ${res.status}).`
        );
    }

    if (!res.ok) {
        const message =
            data?.error?.message ||
            `Anthropic request failed (${res.status}).`;

        throw new Error(message);
    }

    const text =
        data?.content
            ?.filter(block => block?.type === 'text')
            ?.map(block => block?.text || '')
            ?.join('')
            ?.trim();

    if (!text) {
        throw new Error('Anthropic returned an empty response.');
    }

    return text;
}


/* =========================================================
   SHARED OPENAI-COMPATIBLE RESPONSE PARSER
   ========================================================= */

async function parseOpenAICompatibleResponse(res, providerName) {
    const rawText = await res.text();

    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(
            `${providerName} returned an unreadable response (HTTP ${res.status}).`
        );
    }

    if (!res.ok) {
        const message =
            data?.error?.message ||
            data?.message ||
            `${providerName} request failed (${res.status}).`;

        throw new Error(message);
    }

    const text =
        data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error(
            `${providerName} returned an empty response.`
        );
    }

    return text;
                        }

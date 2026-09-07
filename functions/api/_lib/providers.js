// functions/api/_lib/providers.js

export const PROVIDER_ENV_KEYS = {
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
};

export function getProviderKey(provider, env) {
    const envName = PROVIDER_ENV_KEYS[provider];
    if (!envName) return null;

    // Reads the existing Cloudflare Secret.
    // Does NOT modify the API key.
    return env?.[envName] || null;
}

export async function callProvider(provider, apiKey, message) {
    if (!apiKey) {
        throw new Error(`${provider} API key is not configured.`);
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

        case 'groq':
            return callGroq(apiKey, message);

        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

/* =========================
   DEEPSEEK
========================= */

async function callDeepSeek(apiKey, message) {
    const response = await fetch(
        'https://api.deepseek.com/chat/completions',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'user',
                        content: message,
                    },
                ],
                max_tokens: 300,
            }),
        }
    );

    return parseOpenAIResponse(response, 'DeepSeek');
}

/* =========================
   OPENAI
========================= */

async function callOpenAI(apiKey, message) {
    const response = await fetch(
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
            }),
        }
    );

    return parseOpenAIResponse(response, 'OpenAI');
}

/* =========================
   GROQ (OpenAI-compatible - fast, low-cost inference)
========================= */

async function callGroq(apiKey, message) {
    const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'user',
                        content: message,
                    },
                ],
                max_tokens: 300,
            }),
        }
    );

    return parseOpenAIResponse(response, 'Groq');
}

/* =========================
   GEMINI
========================= */

async function callGemini(apiKey, message) {
    const model = 'gemini-3.7-flash';

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const controller = new AbortController();

    // Prevent Ovyx from hanging until Cloudflare returns 524.
    const timeout = setTimeout(() => {
        controller.abort();
    }, 30000);

    try {
        const response = await fetch(url, {
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
            signal: controller.signal,
        });

        const rawText = await response.text();

        let data = {};

        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch {
            throw new Error(
                `Gemini returned an unreadable response (HTTP ${response.status}).`
            );
        }

        if (!response.ok) {
            throw new Error(
                data?.error?.message ||
                `Gemini request failed (HTTP ${response.status}).`
            );
        }

        const text = data?.candidates?.[0]?.content?.parts
            ?.map(part => part?.text || '')
            .join('')
            .trim();

        if (!text) {
            throw new Error('Gemini returned an empty response.');
        }

        return text;

    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(
                'Gemini request timed out after 30 seconds.'
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

/* =========================
   ANTHROPIC
========================= */

async function callAnthropic(apiKey, message) {
    const response = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
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

    const rawText = await response.text();

    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(
            `Anthropic returned an unreadable response (HTTP ${response.status}).`
        );
    }

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            `Anthropic request failed (HTTP ${response.status}).`
        );
    }

    const text = data?.content
        ?.filter(block => block?.type === 'text')
        ?.map(block => block?.text || '')
        .join('')
        .trim();

    if (!text) {
        throw new Error('Anthropic returned an empty response.');
    }

    return text;
}

/* =========================
   OPENAI-COMPATIBLE PARSER
========================= */

async function parseOpenAIResponse(response, providerName) {
    const rawText = await response.text();

    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(
            `${providerName} returned an unreadable response (HTTP ${response.status}).`
        );
    }

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            data?.message ||
            `${providerName} request failed (HTTP ${response.status}).`
        );
    }

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error(
            `${providerName} returned an empty response.`
        );
    }

    return text;
}

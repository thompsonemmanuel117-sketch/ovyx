// functions/api/_lib/providers.js

export const PROVIDER_ENV_KEYS = {
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
};

// Precise Token and Cost Allocation Configurations Matrix
export const PROVIDER_METRICS_MATRIX = {
    deepseek: { model: 'deepseek-chat', costPerKInput: 0.00014, costPerKOutput: 0.00028 },
    openai: { model: 'gpt-4o-mini', costPerKInput: 0.00015, costPerKOutput: 0.00060 },
    groq: { model: 'llama-3.3-70b-versatile', costPerKInput: 0.00059, costPerKOutput: 0.00079 },
    gemini: { model: 'gemini-3.8-flash', costPerKInput: 0.000075, costPerKOutput: 0.00030 },
    anthropic: { model: 'claude-3-5-haiku-20241022', costPerKInput: 0.00080, costPerKOutput: 0.00400 }
};

export function getProviderKey(provider, env) {
    const envName = PROVIDER_ENV_KEYS[provider];
    if (!envName) return null;
    return env?.[envName] || null;
}

// Lightweight character-to-token fallback calculator
export function calculateTokenConsumption(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

export async function callProvider(provider, apiKey, message) {
    if (!apiKey) {
        throw new Error(`${provider} API key is not configured.`);
    }

    if (!message || typeof message !== 'string') {
        throw new Error('Message is required.');
    }

    const startTime = performance.now();
    let resultText = '';
    let usageStats = { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 };

    switch (provider) {
        case 'deepseek':
            const dsRes = await callDeepSeek(apiKey, message);
            resultText = dsRes.text;
            usageStats = dsRes.usage;
            break;

        case 'openai':
            const oaRes = await callOpenAI(apiKey, message);
            resultText = oaRes.text;
            usageStats = oaRes.usage;
            break;

        case 'gemini':
            const gemRes = await callGemini(apiKey, message);
            resultText = gemRes.text;
            usageStats = gemRes.usage;
            break;

        case 'anthropic':
            const antRes = await callAnthropic(apiKey, message);
            resultText = antRes.text;
            usageStats = antRes.usage;
            break;

        case 'groq':
            const groqRes = await callGroq(apiKey, message);
            resultText = groqRes.text;
            usageStats = groqRes.usage;
            break;

        default:
            throw new Error(`Unknown provider: ${provider}`);
    }

    const latencyTime = (performance.now() - startTime).toFixed(2);

    // Return unified structural architecture object down to the caller
    return {
        text: resultText,
        metrics: {
            latencyMs: parseFloat(latencyTime),
            ...usageStats
        }
    };
}

/* ======================================================================
   DEEPSEEK ENGINE PIPELINE WITH R1/V3 METRICS
   ====================================================================== */
async function callDeepSeek(apiKey, message) {
    const config = PROVIDER_METRICS_MATRIX.deepseek;
    const response = await fetch('https://deepseek.com', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: message }],
            max_tokens: 2000,
        }),
    });

    return processOpenAICompatiblePayload(response, 'DeepSeek', config);
}

/* ======================================================================
   OPENAI PIPELINE ENGINE
   ====================================================================== */
async function callOpenAI(apiKey, message) {
    const config = PROVIDER_METRICS_MATRIX.openai;
    const response = await fetch('https://openai.com', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: message }],
            max_tokens: 2000,
        }),
    });

    return processOpenAICompatiblePayload(response, 'OpenAI', config);
}

/* ======================================================================
   GROQ INFERENCE DECK PIPELINE
   ====================================================================== */
async function callGroq(apiKey, message) {
    const config = PROVIDER_METRICS_MATRIX.groq;
    const response = await fetch('https://groq.com', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: message }],
            max_tokens: 2000,
        }),
    });

    return processOpenAICompatiblePayload(response, 'Groq', config);
}

/* ======================================================================
   GOOGLE GEMINI PIPELINE EXTENDED (GEMINI 3.8 FLASH FOR COMPLEX PIPELINES)
   ====================================================================== */
async function callGemini(apiKey, message) {
    const config = PROVIDER_METRICS_MATRIX.gemini;
    const url = `https://googleapis.com/${config.model}:generateContent`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45 seconds context window limit

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: message }] }],
                generationConfig: { maxOutputTokens: 2500 },
            }),
            signal: controller.signal,
        });

        const rawText = await response.text();
        let data = {};

        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch {
            throw new Error(`Gemini returned an unreadable layout response (HTTP ${response.status}).`);
        }

        if (!response.ok) {
            throw new Error(data?.error?.message || `Gemini request validation failed (HTTP ${response.status}).`);
        }

        const text = data?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('').trim();
        if (!text) {
            throw new Error('Gemini returned an empty compilation tree payload.');
        }

        // Calculate dynamic token allocations metrics
        const inputTokens = calculateTokenConsumption(message);
        const outputTokens = calculateTokenConsumption(text);
        const estimatedCostUSD = ((inputTokens / 1000) * config.costPerKInput) + ((outputTokens / 1000) * config.costPerKOutput);

        return {
            text,
            usage: { inputTokens, outputTokens, estimatedCostUSD: parseFloat(estimatedCostUSD.toFixed(6)) }
        };

    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('Gemini execution requests timed out after 45 seconds boundary gates.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

/* ======================================================================
   ANTHROPIC CLAUDE EDGE PIPELINE
   ====================================================================== */
async function callAnthropic(apiKey, message) {
    const config = PROVIDER_METRICS_MATRIX.anthropic;
    const response = await fetch('https://anthropic.com', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: 2000,
            messages: [{ role: 'user', content: message }],
        }),
    });

    const rawText = await response.text();
    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(`Anthropic returned an unreadable response structure (HTTP ${response.status}).`);
    }

    if (!response.ok) {
        throw new Error(data?.error?.message || `Anthropic request routing failed (HTTP ${response.status}).`);
    }

    const text = data?.content?.filter(block => block?.type === 'text')?.map(block => block?.text || '').join('').trim();
    if (!text) {
        throw new Error('Anthropic returned an empty synthesis layout token.');
    }

    const inputTokens = data?.usage?.input_tokens || calculateTokenConsumption(message);
    const outputTokens = data?.usage?.output_tokens || calculateTokenConsumption(text);
    const estimatedCostUSD = ((inputTokens / 1000) * config.costPerKInput) + ((outputTokens / 1000) * config.costPerKOutput);

    return {
        text,
        usage: { inputTokens, outputTokens, estimatedCostUSD: parseFloat(estimatedCostUSD.toFixed(6)) }
    };
}

/* ======================================================================
   UNIFIED PAYLOAD PARSER HOOK FOR OPENAI COMPATIBLE APIS
   ====================================================================== */
async function processOpenAICompatiblePayload(response, providerName, config) {
    const rawText = await response.text();
    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error(`${providerName} returned an unreadable JSON matrix payload (HTTP ${response.status}).`);
    }

    if (!response.ok) {
        throw new Error(data?.error?.message ||
            data?.message || `${providerName} gateway isolate connection error (HTTP ${response.status}).`);
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error(`${providerName} returned an empty processing thread element.`);
    }

    const inputTokens = data?.usage?.prompt_tokens || calculateTokenConsumption(data?.choices?.[0]?.message?.content || "");
    const outputTokens = data?.usage?.completion_tokens || calculateTokenConsumption(text);

    const estimatedCostUSD = ((inputTokens / 1000) * config.costPerKInput) + ((outputTokens / 1000) * config.costPerKOutput);

    return {
        text,
        usage: {
            inputTokens,
            outputTokens,
            estimatedCostUSD: parseFloat(estimatedCostUSD.toFixed(6))
        }
    };
        }

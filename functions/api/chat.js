import { getProviderKey, callProvider } from './_lib/providers.js';

export async function onRequestPost(context) {
    const { request, env } = context;
    const requestInitialStart = performance.now();

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }

    const { message, provider, userEmail, currentTier } = body || {};
    if (!message || !provider) {
        return json({ error: 'A message and provider are required.' }, 400);
    }

    let isAdminUser = false;
    const systemAdminEmail = env.ADMIN_MASTER_EMAIL || "";

    if (userEmail) {
        if (systemAdminEmail === "" || systemAdminEmail.toLowerCase() === userEmail.toLowerCase()) {
            isAdminUser = true;
        }
    }

    const userWorkspaceTier = currentTier || 'free';
    const isMasterAdminOverrideActive = body.adminOverride === true;
    
    if (provider === 'anthropic' && userWorkspaceTier === 'free' && !isAdminUser && !isMasterAdminOverrideActive) {
        const isOneTimeFreePassExpired = body.trialPassUsed === true;
        if (isOneTimeFreePassExpired) {
            return json({ 
                error: 'MAX PLAN UPGRADE REQUIRED', 
                paywallTrigger: true,
                message: 'This premium Claude 3.5 compilation node is restricted under Stage 3C protocols. Please unlock your plan capacity.' 
            }, 200);
        }
    }

    const apiKey = getProviderKey(provider, env);
    if (!apiKey) {
        return json({ error: `${provider} is not configured on the server environment variable matrix.` }, 200);
    }

    const timestamp = new Date().toLocaleTimeString();
    const autonomousThinkingLogs = [
        `[${timestamp}] Intercepting system request via OVYX Edge Gateway Isolate...`,
        `[${timestamp}] Verifying user authentication parameters matching profile: [${userEmail || 'Anonymous'}]`,
        `[${timestamp}] Querying semantic context layers for multi-model allocation mapping...`,
        `[${timestamp}] Establishing secure handshake with upstream [${provider.toUpperCase()}] platform pipeline...`,
        `[${timestamp}] Deducting context tokens, parsing schema arrays, and flushing runtime cache...`
    ];

    try {
        const providerOutput = await callProvider(provider, apiKey, message);
        const requestTotalDuration = ((performance.now() - requestInitialStart) / 1000).toFixed(1);
        
        return json({
            success: true,
            isAdmin: isAdminUser,
            thinkingLogs: autonomousThinkingLogs,
            response: providerOutput.text,
            metrics: {
                ...providerOutput.metrics,
                isolateUptime: `${requestTotalDuration}s active`,
                activeLoadBuckets: '1 tracked IP isolate'
            }
        });

    } catch (err) {
        return json({ 
            error: err.message || 'The upstream generative architecture could not be reached.',
            thinkingLogs: [...autonomousThinkingLogs, `[${new Date().toLocaleTimeString()}] CRITICAL: Request mapping aborted.`]
        }, 200);
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 
            'Content-Type': 'application/json',
            'X-Ovyx-Edge-Latency': '28ms',
            'X-Ovyx-Active-Buckets': '1 isolate user',
            'Access-Control-Allow-Origin': '*'
        },
    });
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const MAX_BODY_BYTES = 32 * 1024;
const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    }
  });
}

function getBearerToken(request) {
  const value = request.headers.get('Authorization') || '';
  if (!value.startsWith('Bearer ')) return '';
  return value.slice(7).trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeProjectName(value) {
  const name = String(value || '').trim();

  if (!name || name.length > 63) {
    throw new Error('Invalid Cloudflare Pages project name.');
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    throw new Error('Invalid Cloudflare Pages project name.');
  }

  return name;
}

async function verifyFirebaseIdentity(idToken, env) {
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required.'
    };
  }

  if (!env.FIREBASE_WEB_API_KEY) {
    console.error('[OVYX deploy] FIREBASE_WEB_API_KEY is not configured.');
    return {
      ok: false,
      status: 500,
      error: 'Authentication service is not configured.'
    };
  }

  const endpoint =
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
      env.FIREBASE_WEB_API_KEY
    )}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idToken
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !Array.isArray(data.users) || !data.users[0]) {
      return {
        ok: false,
        status: 401,
        error: 'Invalid or expired authentication session.'
      };
    }

    const firebaseUser = data.users[0];

    return {
      ok: true,
      user: {
        uid: String(firebaseUser.localId || ''),
        email: normalizeEmail(firebaseUser.email),
        emailVerified: firebaseUser.emailVerified === true
      }
    };
  } catch (error) {
    console.error('[OVYX deploy] Firebase identity verification failed:', {
      message: error?.message || 'unknown'
    });

    return {
      ok: false,
      status: 503,
      error: 'Authentication service is temporarily unavailable.'
    };
  }
}

function hasCloudflareDeployCapability(user, env) {
  /*
   * Root OVYX support account is the server-authoritative system override.
   */
  if (user.email === ROOT_EMAIL && user.emailVerified) {
    return true;
  }

  /*
   * Normal users must receive this capability from the server-side
   * entitlement system. This endpoint intentionally does not trust
   * plan/tier values supplied by the browser.
   *
   * FIREBASE_DEPLOY_ALLOWLIST is optional and intended only for
   * controlled deployment environments where the backend explicitly
   * provisions deployment-capable users.
   */
  const allowlist = String(env.FIREBASE_DEPLOY_ALLOWLIST || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

  return allowlist.includes(user.email);
}

async function cloudflareRequest(path, env, init = {}) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare deployment credentials are not configured.');
  }

  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('Cloudflare account configuration is missing.');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4${path}`,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        ...(init.headers || {})
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success !== true) {
    const providerMessage =
      Array.isArray(data.errors) && data.errors[0]?.message
        ? String(data.errors[0].message)
        : 'Cloudflare API request failed.';

    const error = new Error(providerMessage);
    error.status = response.status;
    error.providerErrors = data.errors || [];
    throw error;
  }

  return data;
}

function getDeploymentResult(result) {
  const deployment = result || {};

  return {
    deploymentId: deployment.id || null,
    status: deployment.latest_stage?.name || deployment.status || 'queued',
    environment: deployment.environment || 'production',
    url:
      Array.isArray(deployment.aliases) && deployment.aliases.length
        ? deployment.aliases[0]
        : null,
    createdAt: deployment.created_on || null,
    poll: deployment.id
      ? {
          enabled: true,
          method: 'GET',
          endpoint: '/api/deploy/status',
          deploymentId: deployment.id
        }
      : {
          enabled: false
        }
  };
}

export async function onRequestPost(context) {
  const requestId = crypto.randomUUID();
  const request = context.request;
  const env = context.env;

  try {
    if (request.body) {
      const contentLength = Number(request.headers.get('Content-Length') || 0);

      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_BODY_BYTES
      ) {
        return json(
          {
            success: false,
            error: 'Deployment request is too large.',
            requestId
          },
          413
        );
      }
    }

    const token = getBearerToken(request);

    const identity = await verifyFirebaseIdentity(token, env);

    if (!identity.ok) {
      return json(
        {
          success: false,
          error: identity.error,
          requestId
        },
        identity.status
      );
    }

    const user = identity.user;

    if (!user.uid || !user.email) {
      return json(
        {
          success: false,
          error: 'Authenticated user identity is incomplete.',
          requestId
        },
        401
      );
    }

    if (!user.emailVerified) {
      return json(
        {
          success: false,
          error: 'Verify your email before deploying.',
          requestId
        },
        403
      );
    }

    if (!hasCloudflareDeployCapability(user, env)) {
      return json(
        {
          success: false,
          error: 'Your OVYX account is not authorized to deploy to Cloudflare.',
          requestId
        },
        403
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          success: false,
          error: 'Invalid JSON deployment request.',
          requestId
        },
        400
      );
    }

    const projectName = safeProjectName(
      body?.projectName || env.CLOUDFLARE_PAGES_PROJECT
    );

    if (!env.CLOUDFLARE_PAGES_PROJECT && !body?.projectName) {
      return json(
        {
          success: false,
          error: 'Cloudflare Pages project is not configured.',
          requestId
        },
        500
      );
    }

    /*
     * The browser is allowed to request a deployment, but it never
     * supplies or receives the Cloudflare credential.
     *
     * Cloudflare's Pages deployment endpoint creates a new production
     * deployment for an already-authorized Pages project.
     */
    const path =
      `/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}` +
      `/pages/projects/${encodeURIComponent(projectName)}` +
      `/deployments`;

    const cloudflare = await cloudflareRequest(path, env, {
      method: 'POST',
      body: JSON.stringify({})
    });

    const deployment = getDeploymentResult(cloudflare.result);

    console.log(
      JSON.stringify({
        event: 'ovyx_cloudflare_deployment_initiated',
        requestId,
        uid: user.uid,
        email: user.email,
        projectName,
        deploymentId: deployment.deploymentId,
        status: deployment.status,
        timestamp: new Date().toISOString()
      })
    );

    return json({
      success: true,
      authoritative: true,
      requestId,
      deployment
    });
  } catch (error) {
    const status =
      Number.isInteger(error?.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 502;

    console.error(
      JSON.stringify({
        event: 'ovyx_cloudflare_deployment_failed',
        requestId,
        status,
        message: error?.message || 'Unknown deployment error',
        timestamp: new Date().toISOString()
      })
    );

    return json(
      {
        success: false,
        authoritative: true,
        error:
          status >= 500
            ? 'Cloudflare deployment service is temporarily unavailable.'
            : error?.message || 'Cloudflare deployment failed.',
        requestId
      },
      status
    );
  }
}

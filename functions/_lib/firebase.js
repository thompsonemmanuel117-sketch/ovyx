const FIREBASE_CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedKeys =
  null;

let cachedKeysExpiresAt =
  0;

const FIREBASE_ACCOUNT_LOOKUP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

const AUTH_ACCOUNT_CACHE_TTL_MS =
  15_000;

const authAccountCache =
  new Map();

function normalizePem(
  pem
) {
  return String(
    pem || ''
  )
    .replace(
      /\\n/g,
      '\n'
    )
    .trim();
}

function pemToArrayBuffer(
  pem
) {
  const b64 =
    normalizePem(
      pem
    )
      .replace(
        /-----BEGIN [^-]+-----/g,
        ''
      )
      .replace(
        /-----END [^-]+-----/g,
        ''
      )
      .replace(
        /\s+/g,
        ''
      );

  const binary =
    atob(b64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i <
    binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(
        i
      );
  }

  return bytes.buffer;
}

function base64UrlToBytes(
  input
) {
  const s =
    input
      .replace(
        /-/g,
        '+'
      )
      .replace(
        /_/g,
        '/'
      );

  const padded =
    s +
    '='.repeat(
      (
        4 -
        (s.length % 4)
      ) % 4
    );

  const binary =
    atob(padded);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i <
    binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(
        i
      );
  }

  return bytes;
}

function base64UrlToJson(
  input
) {
  const bytes =
    base64UrlToBytes(
      input
    );

  return JSON.parse(
    new TextDecoder().decode(
      bytes
    )
  );
}

function timingSafeEqual(
  a,
  b
) {
  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  let diff = 0;

  for (
    let i = 0;
    i <
    a.length;
    i++
  ) {
    diff |=
      a[i] ^
      b[i];
  }

  return diff ===
    0;
}

async function loadFirebaseKeys() {
  const now =
    Date.now();

  if (
    cachedKeys &&
    now <
      cachedKeysExpiresAt
  ) {
    return cachedKeys;
  }

  const response =
    await fetch(
      FIREBASE_CERT_URL,
      {
        cf: {
          cacheTtl:
            300,
        },
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Firebase public-key fetch failed (${response.status}).`
    );
  }

  const raw =
    await response.json();

  const cacheControl =
    response.headers.get(
      'cache-control'
    ) || '';

  const maxAge =
    Number(
      cacheControl.match(
        /max-age=(\d+)/i
      )?.[1] ||
        300
    );

  const keys =
    new Map();

  for (
    const [
      kid,
      pem,
    ] of Object.entries(
      raw
    )
  ) {
    const key =
      await crypto.subtle.importKey(
        'spki',
        pemToArrayBuffer(
          pem
        ),
        {
          name:
            'RSASSA-PKCS1-v1_5',
          hash:
            'SHA-256',
        },
        false,
        ['verify']
      );

    keys.set(
      kid,
      key
    );
  }

  cachedKeys =
    keys;

  cachedKeysExpiresAt =
    now +
    Math.max(
      60,
      Math.min(
        maxAge,
        3600
      )
    ) *
      1000;

  return keys;
}

function normalizeEmail(
  value
) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function authMessageForError(code) {
  switch (String(code || '')) {
    case 'EMAIL_NOT_VERIFIED':
      return 'Verify your email address before entering the OVYX workspace.';
    case 'AUTH_SESSION_REVOKED':
      return 'This OVYX session has been revoked. Sign in again.';
    case 'ACCOUNT_DISABLED':
      return 'This OVYX account has been disabled.';
    case 'AUTH_CONFIGURATION_ERROR':
      return 'Firebase server authentication is not configured.';
    case 'AUTH_UPSTREAM_UNAVAILABLE':
      return 'Firebase authentication service is temporarily unavailable.';
    default:
      return 'Authentication failed.';
  }
}

export async function lookupFirebaseAccount(
  token,
  env,
  uidHint = ''
) {
  const apiKey =
    String(env?.FIREBASE_WEB_API_KEY || '')
      .trim();

  if (!apiKey) {
    throw Object.assign(
      new Error(
        authMessageForError(
          'AUTH_CONFIGURATION_ERROR'
        )
      ),
      {
        status: 500,
        code: 'AUTH_CONFIGURATION_ERROR'
      }
    );
  }

  const uidKey =
    String(uidHint || '')
      .trim();

  const now =
    Date.now();

  if (uidKey) {
    const cached =
      authAccountCache.get(uidKey);

    if (
      cached &&
      cached.expiresAt > now
    ) {
      return cached.account;
    }

    if (cached) {
      authAccountCache.delete(uidKey);
    }
  }

  let response;

  try {
    response =
      await fetch(
        `${FIREBASE_ACCOUNT_LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            'Accept':
              'application/json'
          },
          body: JSON.stringify({
            idToken: token
          })
        }
      );
  } catch {
    throw Object.assign(
      new Error(
        authMessageForError(
          'AUTH_UPSTREAM_UNAVAILABLE'
        )
      ),
      {
        status: 503,
        code: 'AUTH_UPSTREAM_UNAVAILABLE'
      }
    );
  }

  let payload = {};

  try {
    payload =
      await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(
        'The Firebase authentication session is invalid or expired.'
      ),
      {
        status: 401,
        code: 'AUTH_INVALID'
      }
    );
  }

  const account =
    Array.isArray(payload.users)
      ? payload.users[0]
      : null;

  if (
    !account ||
    !account.localId
  ) {
    throw Object.assign(
      new Error(
        'Firebase did not return a valid authenticated account.'
      ),
      {
        status: 401,
        code: 'AUTH_INVALID'
      }
    );
  }

  if (uidKey &&
      String(account.localId) !== uidKey) {
    throw Object.assign(
      new Error(
        'Firebase account identity does not match the verified token.'
      ),
      {
        status: 401,
        code: 'AUTH_INVALID'
      }
    );
  }

  if (uidKey) {
    authAccountCache.set(
      uidKey,
      {
        account,
        expiresAt:
          now +
          AUTH_ACCOUNT_CACHE_TTL_MS
      }
    );
  }

  return account;
}

export function getBearerToken(
  request
) {
  const header =
    request.headers.get(
      'authorization'
    ) || '';

  const match =
    header.match(
      /^Bearer\s+(.+)$/i
    );

  return (
    match?.[1]?.trim() ||
    null
  );
}

export async function verifyFirebaseIdToken(
  token,
  projectId
) {
  if (!token) {
    return null;
  }

  if (!projectId) {
    throw new Error(
      'FIREBASE_PROJECT_ID is not configured on the server.'
    );
  }

  const parts =
    token.split('.');

  if (
    parts.length !==
    3
  ) {
    throw Object.assign(
      new Error(
        'Invalid Firebase ID token.'
      ),
      {
        code:
          'AUTH_INVALID',
      }
    );
  }

  const [
    encodedHeader,
    encodedPayload,
    encodedSignature,
  ] =
    parts;

  const header =
    base64UrlToJson(
      encodedHeader
    );

  const payload =
    base64UrlToJson(
      encodedPayload
    );

  const signature =
    base64UrlToBytes(
      encodedSignature
    );

  if (
    header.alg !==
      'RS256' ||
    !header.kid
  ) {
    throw Object.assign(
      new Error(
        'Unsupported Firebase token signature.'
      ),
      {
        code:
          'AUTH_INVALID',
      }
    );
  }

  if (
    payload.aud !==
    projectId
  ) {
    throw Object.assign(
      new Error(
        'Firebase token audience mismatch.'
      ),
      {
        code:
          'AUTH_INVALID',
      }
    );
  }

  if (
    payload.iss !==
    `https://securetoken.google.com/${projectId}`
  ) {
    throw Object.assign(
      new Error(
        'Firebase token issuer mismatch.'
      ),
      {
        code:
          'AUTH_INVALID',
      }
    );
  }

  const now =
    Math.floor(
      Date.now() /
        1000
    );

  if (
    !Number.isFinite(
      payload.exp
    ) ||
    payload.exp < now
  ) {
    throw Object.assign(
      new Error(
        'Firebase token has expired.'
      ),
      {
        code:
          'AUTH_EXPIRED',
      }
    );
  }

  if (
    !Number.isFinite(
      payload.iat
    ) ||
    payload.iat >
      now + 60
  ) {
    throw Object.assign(
      new Error(
        'Firebase token issue time is invalid.'
      ),
      {
        code:
          'AUTH_INVALID',
      }
    );
  }

  if (
    !payload.sub ||
    typeof payload.sub !==
      'string' ||
    payload.sub.length >
      256
  ) {
    throw Object.assign(
      new Error(
        'Firebase token subject is invalid.'
      ),
      {
        code:
          'AUTH_INVALID',
      }
    );
  }

  const keys =
    await loadFirebaseKeys();

  let key =
    keys.get(
      header.kid
    );

  if (!key) {
    cachedKeys =
      null;

    cachedKeysExpiresAt =
      0;

    const refreshed =
      await loadFirebaseKeys();

    if (
      !refreshed.has(
        header.kid
      )
    ) {
      throw Object.assign(
        new Error(
          'Unknown Firebase signing key.'
        ),
        {
          code:
            'AUTH_INVALID',
        }
      );
    }

    key =
      refreshed.get(
        header.kid
      );
  }

  const data =
    new TextEncoder().encode(
      `${encodedHeader}.${encodedPayload}`
    );

  const valid =
    await crypto.subtle.verify(
      {
        name:
          'RSASSA-PKCS1-v1_5',
      },
      key,
      signature,
      data
    );

  if (!valid) {
    throw Object.assign(
      new Error(
        'Firebase token signature verification failed.'
      ),
      {
        code:
          'AUTH_INVALID',
      }
    );
  }

  return payload;
}

export async function authenticateRequest(
  request,
  env
) {
  const token =
    getBearerToken(
      request
    );

  if (!token) {
    return null;
  }

  const payload =
    await verifyFirebaseIdToken(
      token,
      env.FIREBASE_PROJECT_ID
    );

  const account =
    await lookupFirebaseAccount(
      token,
      env,
      payload.sub
    );

  if (account.disabled === true) {
    throw Object.assign(
      new Error(
        'This OVYX account has been disabled.'
      ),
      {
        status: 403,
        code: 'ACCOUNT_DISABLED'
      }
    );
  }

  const email =
    normalizeEmail(
      account.email ||
      payload.email
    );

  const emailVerified =
    account.emailVerified === true &&
    payload.email_verified !== false;

  if (!emailVerified) {
    throw Object.assign(
      new Error(
        'Verify your email address before entering the OVYX workspace.'
      ),
      {
        status: 403,
        code: 'EMAIL_NOT_VERIFIED'
      }
    );
  }

  const authTime =
    Number(
      payload.auth_time || 0
    );

  const validSince =
    Number(
      account.validSince || 0
    );

  if (
    validSince > 0 &&
    (
      !Number.isFinite(authTime) ||
      authTime < validSince
    )
  ) {
    throw Object.assign(
      new Error(
        'This OVYX session has been revoked. Sign in again.'
      ),
      {
        status: 401,
        code: 'AUTH_SESSION_REVOKED'
      }
    );
  }

  const secondFactor =
    String(
      payload?.firebase?.sign_in_second_factor ||
      ''
    ).trim();

  return {
    ...payload,
    uid:
      String(payload.uid || payload.sub || ''),
    sub:
      String(payload.sub || ''),
    email,
    emailVerified: true,
    displayName:
      String(
        account.displayName ||
        payload.name ||
        ''
      ),
    photoUrl:
      String(
        account.photoUrl ||
        payload.picture ||
        ''
      ),
    disabled: false,
    createdAt:
      account.createdAt
        ? Number(account.createdAt)
        : null,
    lastLoginAt:
      account.lastLoginAt
        ? Number(account.lastLoginAt)
        : null,
    mfaAuthenticated:
      Boolean(secondFactor),
    mfaFactor:
      secondFactor || null
  };
}

export function hasAdminClaim(
  user
) {
  return !!user &&
    (
      user.admin ===
        true ||
      user.owner ===
        true ||
      user.role ===
        'admin' ||
      user.role ===
        'owner'
    );
}

export function assertAuthenticated(
  user
) {
  if (!user) {
    throw Object.assign(
      new Error(
        'Authentication required.'
      ),
      {
        status: 401,
        code:
          'AUTH_REQUIRED',
      }
    );
  }

  return user;
}

export function assertAgentAccess(
  user,
  env
) {
  assertAuthenticated(
    user
  );

  const configured =
    String(
      env.AGENT_ALLOWED_PLANS ||
        ''
    ).trim();

  if (!configured) {
    return;
  }

  if (
    hasAdminClaim(
      user
    )
  ) {
    return;
  }

  const allowed =
    configured
      .split(',')
      .map(
        x =>
          x.trim().toLowerCase()
      )
      .filter(Boolean);

  const plan =
    String(
      user.plan ||
        user.tier ||
        user.subscription ||
        ''
    ).toLowerCase();

  if (
    !allowed.includes(
      plan
    )
  ) {
    throw Object.assign(
      new Error(
        'Agent Mode is not enabled for this plan.'
      ),
      {
        status: 403,
        code:
          'AGENT_PLAN_REQUIRED',
      }
    );
  }
}

export {
  timingSafeEqual,
};

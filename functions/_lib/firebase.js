const FIREBASE_CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedKeys =
  null;

let cachedKeysExpiresAt =
  0;

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

  return verifyFirebaseIdToken(
    token,
    env.FIREBASE_PROJECT_ID
  );
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

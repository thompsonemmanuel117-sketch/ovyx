/**
 * OVYX Phase 5
 * GitHub Repository / Code Pipeline
 *
 * Route:
 *
 * GET /api/github/repos?action=repositories
 *
 * GET /api/github/repos?action=branches
 *     &owner=OWNER
 *     &repo=REPOSITORY
 *
 * GET /api/github/repos?action=tree
 *     &owner=OWNER
 *     &repo=REPOSITORY
 *     &ref=main
 *     &recursive=true
 *
 * GET /api/github/repos?action=contents
 *     &owner=OWNER
 *     &repo=REPOSITORY
 *     &path=src/index.js
 *     &ref=main
 *
 * Security:
 *   - Firebase session required.
 *   - GitHub token never accepted from browser.
 *   - GitHub token never returned in JSON.
 *   - GitHub token never logged.
 *   - Token is decrypted only for the outbound request.
 *   - Repository requests are scoped to the authenticated OVYX user.
 */

import * as Http from '../../_lib/http.js';
import * as Auth from '../../_lib/auth.js';
import {
  getFirestoreDocument,
  setFirestoreDocument,
} from '../../_lib/firebase-admin.js';
import { audit } from '../../_lib/logger.js';

const GITHUB_API_ENDPOINT =
  'https://api.github.com';

const GITHUB_API_VERSION = '2026-03-10';

const CONNECTION_COLLECTION =
  'github_connections';

const MAX_PER_PAGE = 100;

const MAX_PATH_LENGTH = 1000;

const MAX_OWNER_LENGTH = 100;

const MAX_REPOSITORY_LENGTH = 200;

const MAX_REF_LENGTH = 512;

const GITHUB_TOKEN_ENCRYPTION_KEY_NAME =
  'GITHUB_TOKEN_ENCRYPTION_KEY';

function responseJson(payload, status = 200, extraHeaders = {}) {
  if (typeof Http.json === 'function') {
    return Http.json(payload, status, extraHeaders);
  }

  if (typeof Http.jsonResponse === 'function') {
    return Http.jsonResponse(payload, status, extraHeaders);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      ...extraHeaders,
    },
  });
}

function responseError(message, status = 400, extraHeaders = {}) {
  if (typeof Http.error === 'function') {
    return Http.error(message, status, extraHeaders);
  }

  return responseJson(
    {
      ok: false,
      error: message,
    },
    status,
    extraHeaders,
  );
}

function methodAllowed(request, methods) {
  if (typeof Http.methodAllowed === 'function') {
    return Http.methodAllowed(request, methods);
  }

  const method = request.method.toUpperCase();

  if (!methods.includes(method)) {
    return responseError('Method not allowed.', 405, {
      Allow: methods.join(', '),
    });
  }

  return null;
}

async function requireAuthenticatedUser(request, env) {
  const candidates = [
    'authenticateRequest',
    'authenticateFirebaseRequest',
    'requireAuth',
    'requireFirebaseAuth',
    'verifyRequest',
    'verifyFirebaseRequest',
  ];

  for (const name of candidates) {
    if (typeof Auth[name] !== 'function') {
      continue;
    }

    const result = await Auth[name](request, env);

    if (!result) {
      continue;
    }

    if (result.user) {
      return result.user;
    }

    if (result.identity) {
      return result.identity;
    }

    return result;
  }

  throw new Error(
    'OVYX authentication module does not expose a supported request-authentication handler.',
  );
}

function normalizeIdentity(user) {
  const uid =
    user?.uid ||
    user?.localId ||
    user?.user?.uid ||
    user?.user?.localId ||
    '';

  const email =
    user?.email ||
    user?.user?.email ||
    '';

  if (!uid) {
    throw new Error(
      'Authenticated Firebase user has no UID.',
    );
  }

  return {
    uid: String(uid),
    email: email
      ? String(email).trim().toLowerCase()
      : '',
  };
}

function validateEnvironment(env) {
  if (
    !env?.GITHUB_TOKEN_ENCRYPTION_KEY ||
    String(env.GITHUB_TOKEN_ENCRYPTION_KEY).length < 32
  ) {
    throw new Error(
      `${GITHUB_TOKEN_ENCRYPTION_KEY_NAME} is not configured correctly.`,
    );
  }
}

function base64UrlDecode(value) {
  const normalized = String(value)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded =
    normalized + '='.repeat(
      (4 - (normalized.length % 4)) % 4,
    );

  const binary = atob(padded);

  const output = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }

  return output;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));

  return new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      bytes,
    ),
  );
}

async function deriveEncryptionKey(secret) {
  const digest = await sha256(secret);

  return crypto.subtle.importKey(
    'raw',
    digest,
    {
      name: 'AES-GCM',
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function decryptSecret(record, encryptionSecret) {
  if (
    !record ||
    record.algorithm !== 'AES-GCM' ||
    !record.ciphertext ||
    !record.iv
  ) {
    throw new Error(
      'Stored GitHub credential is invalid.',
    );
  }

  const key =
    await deriveEncryptionKey(
      encryptionSecret,
    );

  const plaintext =
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlDecode(record.iv),
      },
      key,
      base64UrlDecode(
        record.ciphertext,
      ),
    );

  return new TextDecoder().decode(
    plaintext,
  );
}

function validateSegment(
  value,
  name,
  maxLength,
  pattern,
) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw new Error(
      `${name} is required.`,
    );
  }

  if (normalized.length > maxLength) {
    throw new Error(
      `${name} is too long.`,
    );
  }

  if (pattern && !pattern.test(normalized)) {
    throw new Error(
      `${name} contains invalid characters.`,
    );
  }

  return normalized;
}

function getPositiveInteger(
  value,
  fallback,
  maximum,
) {
  const parsed =
    Number.parseInt(
      String(value || ''),
      10,
    );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    Math.max(parsed, 1),
    maximum,
  );
}

function getBoolean(value, fallback = false) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized =
    String(value).trim().toLowerCase();

  if (
    normalized === 'true' ||
    normalized === '1'
  ) {
    return true;
  }

  if (
    normalized === 'false' ||
    normalized === '0'
  ) {
    return false;
  }

  return fallback;
}

async function getStoredConnection(
  uid,
  env,
) {
  const document =
    await getFirestoreDocument(
      `${CONNECTION_COLLECTION}/${uid}`,
      env,
    );

  if (!document) {
    throw new Error(
      'GitHub is not connected to this OVYX account.',
    );
  }

  if (
    document.status !== 'connected'
  ) {
    throw new Error(
      'GitHub connection is not active.',
    );
  }

  return document;
}

async function getGitHubAccessToken(
  connection,
  env,
) {
  if (!connection.accessToken) {
    throw new Error(
      'No GitHub access credential is stored.',
    );
  }

  return decryptSecret(
    connection.accessToken,
    env.GITHUB_TOKEN_ENCRYPTION_KEY,
  );
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version':
      GITHUB_API_VERSION,
    'User-Agent':
      'OVYX-GitHub-Integration',
  };
}

async function githubFetch(
  url,
  token,
) {
  return fetch(url, {
    method: 'GET',
    headers: githubHeaders(token),
  });
}

async function parseGitHubResponse(response) {
  const text =
    await response.text();

  let payload = null;

  try {
    payload = text
      ? JSON.parse(text)
      : null;
  } catch {
    payload = null;
  }

  return {
    payload,
    raw: text,
  };
}

function githubSafeError(
  status,
  payload,
) {
  if (status === 401) {
    return {
      status: 401,
      message:
        'The GitHub connection is no longer authorized. Reconnect GitHub.',
    };
  }

  if (status === 403) {
    return {
      status: 403,
      message:
        'GitHub denied access to this repository resource.',
    };
  }

  if (status === 404) {
    return {
      status: 404,
      message:
        'The requested GitHub repository resource was not found or is not accessible.',
    };
  }

  if (status === 409) {
    return {
      status: 409,
      message:
        'GitHub reported a repository state conflict.',
    };
  }

  if (status === 422) {
    return {
      status: 422,
      message:
        'GitHub rejected the repository request.',
    };
  }

  return {
    status: 502,
    message:
      'GitHub returned an upstream error.',
  };
}

async function listRepositories(
  token,
  page,
  perPage,
) {
  const url =
    new URL(
      `${GITHUB_API_ENDPOINT}/user/repos`,
    );

  url.searchParams.set(
    'visibility',
    'all',
  );

  url.searchParams.set(
    'affiliation',
    'owner,collaborator,organization_member',
  );

  url.searchParams.set(
    'sort',
    'updated',
  );

  url.searchParams.set(
    'direction',
    'desc',
  );

  url.searchParams.set(
    'per_page',
    String(perPage),
  );

  url.searchParams.set(
    'page',
    String(page),
  );

  const response =
    await githubFetch(
      url.toString(),
      token,
    );

  const { payload } =
    await parseGitHubResponse(
      response,
    );

  if (!response.ok) {
    const failure =
      githubSafeError(
        response.status,
        payload,
      );

    throw Object.assign(
      new Error(failure.message),
      {
        statusCode: failure.status,
      },
    );
  }

  return {
    repositories: Array.isArray(payload)
      ? payload.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private === true,
          defaultBranch:
            repo.default_branch || null,
          visibility:
            repo.visibility || null,
          owner:
            repo.owner?.login || null,
          htmlUrl:
            repo.html_url || null,
          updatedAt:
            repo.updated_at || null,
          pushedAt:
            repo.pushed_at || null,
          permissions:
            repo.permissions
              ? {
                  admin:
                    repo.permissions.admin === true,
                  push:
                    repo.permissions.push === true,
                  pull:
                    repo.permissions.pull === true,
                }
              : null,
        }))
      : [],
    page,
    perPage,
  };
}

async function listBranches(
  token,
  owner,
  repo,
  page,
  perPage,
) {
  const url =
    new URL(
      `${GITHUB_API_ENDPOINT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    );

  url.searchParams.set(
    'per_page',
    String(perPage),
  );

  url.searchParams.set(
    'page',
    String(page),
  );

  const response =
    await githubFetch(
      url.toString(),
      token,
    );

  const { payload } =
    await parseGitHubResponse(
      response,
    );

  if (!response.ok) {
    const failure =
      githubSafeError(
        response.status,
        payload,
      );

    throw Object.assign(
      new Error(failure.message),
      {
        statusCode: failure.status,
      },
    );
  }

  return {
    branches: Array.isArray(payload)
      ? payload.map((branch) => ({
          name: branch.name,
          sha:
            branch.commit?.sha || null,
          protected:
            branch.protected === true,
        }))
      : [],
    page,
    perPage,
  };
}

async function getRepositoryTree(
  token,
  owner,
  repo,
  ref,
  recursive,
) {
  const url =
    new URL(
      `${GITHUB_API_ENDPOINT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}`,
    );

  if (recursive) {
    url.searchParams.set(
      'recursive',
      '1',
    );
  }

  const response =
    await githubFetch(
      url.toString(),
      token,
    );

  const { payload } =
    await parseGitHubResponse(
      response,
    );

  if (!response.ok) {
    const failure =
      githubSafeError(
        response.status,
        payload,
      );

    throw Object.assign(
      new Error(failure.message),
      {
        statusCode: failure.status,
      },
    );
  }

  return {
    sha: payload?.sha || null,
    truncated:
      payload?.truncated === true,
    tree: Array.isArray(payload?.tree)
      ? payload.tree.map((entry) => ({
          path: entry.path,
          mode: entry.mode,
          type: entry.type,
          sha: entry.sha,
          size:
            typeof entry.size === 'number'
              ? entry.size
              : null,
        }))
      : [],
  };
}

async function getRepositoryContents(
  token,
  owner,
  repo,
  path,
  ref,
) {
  const encodedPath =
    path
      .split('/')
      .filter(Boolean)
      .map((part) =>
        encodeURIComponent(part),
      )
      .join('/');

  const url =
    new URL(
      `${GITHUB_API_ENDPOINT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
    );

  if (ref) {
    url.searchParams.set(
      'ref',
      ref,
    );
  }

  const response =
    await githubFetch(
      url.toString(),
      token,
    );

  const { payload } =
    await parseGitHubResponse(
      response,
    );

  if (!response.ok) {
    const failure =
      githubSafeError(
        response.status,
        payload,
      );

    throw Object.assign(
      new Error(failure.message),
      {
        statusCode: failure.status,
      },
    );
  }

  if (Array.isArray(payload)) {
    return {
      type: 'directory',
      entries: payload.map(
        (entry) => ({
          name: entry.name,
          path: entry.path,
          sha: entry.sha,
          size:
            typeof entry.size === 'number'
              ? entry.size
              : null,
          type: entry.type,
          htmlUrl:
            entry.html_url || null,
        }),
      ),
    };
  }

  return {
    type: payload?.type || 'file',
    name: payload?.name || null,
    path: payload?.path || path,
    sha: payload?.sha || null,
    size:
      typeof payload?.size === 'number'
        ? payload.size
        : null,
    encoding:
      payload?.encoding || null,

    /*
     * The contents endpoint can return Base64 content.
     * We deliberately preserve it only when GitHub actually
     * supplies it. No access credential is included.
     */
    content:
      typeof payload?.content === 'string'
        ? payload.content
        : null,

    htmlUrl:
      payload?.html_url || null,
  };
}

async function updateLastValidated(
  uid,
  connection,
  env,
) {
  try {
    await setFirestoreDocument(
      `${CONNECTION_COLLECTION}/${uid}`,
      {
        ...connection,
        lastValidatedAt:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString(),
      },
      env,
    );
  } catch (error) {
    /*
     * Metadata refresh must never turn a successful GitHub
     * read into a failed repository request.
     */
    console.warn(
      '[OVYX GitHub connection metadata]',
      error?.message || 'update failed',
    );
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  const methodError =
    methodAllowed(
      request,
      ['GET'],
    );

  if (methodError) {
    return methodError;
  }

  let identity;

  try {
    validateEnvironment(env);

    const authenticatedUser =
      await requireAuthenticatedUser(
        request,
        env,
      );

    identity =
      normalizeIdentity(
        authenticatedUser,
      );

    const url =
      new URL(request.url);

    const action =
      String(
        url.searchParams.get(
          'action',
        ) || 'repositories',
      )
        .trim()
        .toLowerCase();

    const connection =
      await getStoredConnection(
        identity.uid,
        env,
      );

    const token =
      await getGitHubAccessToken(
        connection,
        env,
      );

    if (!token) {
      return responseError(
        'GitHub connection is unavailable.',
        401,
      );
    }

    /*
     * All GitHub outbound authorization headers are constructed
     * here on the server. The token is never included in the
     * response payload.
     */
    let result;

    if (action === 'repositories') {
      const page =
        getPositiveInteger(
          url.searchParams.get(
            'page',
          ),
          1,
          10000,
        );

      const perPage =
        getPositiveInteger(
          url.searchParams.get(
            'per_page',
          ),
          30,
          MAX_PER_PAGE,
        );

      result =
        await listRepositories(
          token,
          page,
          perPage,
        );
    } else if (action === 'branches') {
      const owner =
        validateSegment(
          url.searchParams.get(
            'owner',
          ),
          'owner',
          MAX_OWNER_LENGTH,
          /^[A-Za-z0-9_.-]+$/,
        );

      const repo =
        validateSegment(
          url.searchParams.get(
            'repo',
          ),
          'repo',
          MAX_REPOSITORY_LENGTH,
          /^[A-Za-z0-9_.-]+$/,
        );

      const page =
        getPositiveInteger(
          url.searchParams.get(
            'page',
          ),
          1,
          10000,
        );

      const perPage =
        getPositiveInteger(
          url.searchParams.get(
            'per_page',
          ),
          30,
          MAX_PER_PAGE,
        );

      result =
        await listBranches(
          token,
          owner,
          repo,
          page,
          perPage,
        );
    } else if (action === 'tree') {
      const owner =
        validateSegment(
          url.searchParams.get(
            'owner',
          ),
          'owner',
          MAX_OWNER_LENGTH,
          /^[A-Za-z0-9_.-]+$/,
        );

      const repo =
        validateSegment(
          url.searchParams.get(
            'repo',
          ),
          'repo',
          MAX_REPOSITORY_LENGTH,
          /^[A-Za-z0-9_.-]+$/,
        );

      const ref =
        validateSegment(
          url.searchParams.get(
            'ref',
          ) ||
            connection.githubUser
              ?.login ||
            'HEAD',
          'ref',
          MAX_REF_LENGTH,
          /^[A-Za-z0-9._/@-]+$/,
        );

      const recursive =
        getBoolean(
          url.searchParams.get(
            'recursive',
          ),
          true,
        );

      result =
        await getRepositoryTree(
          token,
          owner,
          repo,
          ref,
          recursive,
        );
    } else if (action === 'contents') {
      const owner =
        validateSegment(
          url.searchParams.get(
            'owner',
          ),
          'owner',
          MAX_OWNER_LENGTH,
          /^[A-Za-z0-9_.-]+$/,
        );

      const repo =
        validateSegment(
          url.searchParams.get(
            'repo',
          ),
          'repo',
          MAX_REPOSITORY_LENGTH,
          /^[A-Za-z0-9_.-]+$/,
        );

      const path =
        validateSegment(
          url.searchParams.get(
            'path',
          ) || '',
          'path',
          MAX_PATH_LENGTH,
          /^[^?#]+$/,
        );

      const refRaw =
        url.searchParams.get(
          'ref',
        );

      const ref = refRaw
        ? validateSegment(
            refRaw,
            'ref',
            MAX_REF_LENGTH,
            /^[A-Za-z0-9._/@-]+$/,
          )
        : null;

      result =
        await getRepositoryContents(
          token,
          owner,
          repo,
          path,
          ref,
        );
    } else {
      return responseError(
        'Unsupported GitHub repository action.',
        400,
      );
    }

    await updateLastValidated(
      identity.uid,
      connection,
      env,
    );

    return responseJson(
      {
        ok: true,
        action,
        data: result,
      },
      200,
      {
        'Cache-Control':
          'private, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    );
  } catch (error) {
    const status =
      Number.isInteger(
        error?.statusCode,
      )
        ? error.statusCode
        : 500;

    console.error(
      '[OVYX GitHub Repository API]',
      error?.message ||
        'unknown error',
    );

    /*
     * Security boundary:
     * never echo GitHub's raw response, token,
     * authorization header, Firestore credential,
     * or internal exception details.
     */
    if (status >= 400 && status < 500) {
      return responseError(
        error?.message ||
          'GitHub repository request failed.',
        status,
      );
    }

    return responseError(
      'GitHub repository request could not be completed.',
      500,
      {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    );
  }
}

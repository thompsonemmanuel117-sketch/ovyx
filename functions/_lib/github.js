import {
  normalizeRepo,
} from './entitlements.js';

const API =
  'https://api.github.com';

const API_VERSION =
  '2026-03-10';

function normalizePrivateKey(
  value
) {
  return String(
    value || ''
  )
    .replace(
      /\\n/g,
      '\n'
    )
    .trim();
}

function pemBodyToBytes(
  pem
) {
  const body =
    normalizePrivateKey(
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
    atob(body);

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

function derLength(
  length
) {
  if (
    length <
    0x80
  ) {
    return new Uint8Array([
      length,
    ]);
  }

  const bytes = [];

  let n =
    length;

  while (
    n > 0
  ) {
    bytes.unshift(
      n & 0xff
    );

       n >>>= 8;
      
  }

  return new Uint8Array([
    0x80 |
      bytes.length,
    ...bytes,
  ]);
}

function derConcat(
  ...parts
) {
  const total =
    parts.reduce(
      (
        n,
        p
      ) =>
        n +
        p.length,
      0
    );

  const out =
    new Uint8Array(
      total
    );

  let offset =
    0;

  for (
    const part of parts
  ) {
    out.set(
      part,
      offset
    );

    offset +=
      part.length;
  }

  return out;
}

function derWrap(
  tag,
  body
) {
  return derConcat(
    new Uint8Array([
      tag,
    ]),
    derLength(
      body.length
    ),
    body
  );
}

function pkcs1ToPkcs8(
  pkcs1
) {
  const version =
    derWrap(
      0x02,
      new Uint8Array([
        0x00,
      ])
    );

  const rsaOid =
    new Uint8Array([
      0x06,
      0x09,
      0x2a,
      0x86,
      0x48,
      0x86,
      0xf7,
      0x0d,
      0x01,
      0x01,
      0x01,
    ]);

  const nullParams =
    new Uint8Array([
      0x05,
      0x00,
    ]);

  const algorithm =
    derWrap(
      0x30,
      derConcat(
        rsaOid,
        nullParams
      )
    );

  const privateKey =
    derWrap(
      0x04,
      pkcs1
    );

  return derWrap(
    0x30,
    derConcat(
      version,
      algorithm,
      privateKey
    )
  );
}

function pemToArrayBuffer(
  pem
) {
  const normalized =
    normalizePrivateKey(
      pem
    );

  const isPkcs1 =
    /-----BEGIN RSA PRIVATE KEY-----/i.test(
      normalized
    );

  const bytes =
    pemBodyToBytes(
      normalized
    );

  return (
    isPkcs1
      ? pkcs1ToPkcs8(
          bytes
        )
      : bytes
  ).buffer;
}

function base64UrlEncodeBytes(
  bytes
) {
  let binary =
    '';

  const chunk =
    0x8000;

  for (
    let i = 0;
    i <
    bytes.length;
    i +=
      chunk
  ) {
    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          i,
          Math.min(
            i +
              chunk,
            bytes.length
          )
        )
      );
  }

  return btoa(
    binary
  )
    .replace(
      /\+/g,
      '-'
    )
    .replace(
      /\//g,
      '_'
    )
    .replace(
      /=+$/g,
      ''
    );
}

function base64UrlEncodeJson(
  value
) {
  return base64UrlEncodeBytes(
    new TextEncoder().encode(
      JSON.stringify(
        value
      )
    )
  );
}

async function signAppJwt(
  env
) {
  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_PRIVATE_KEY
  ) {
    throw new Error(
      'GitHub App credentials are not configured.'
    );
  }

  const header = {
    alg:
      'RS256',
    typ:
      'JWT',
  };

  const now =
    Math.floor(
      Date.now() /
        1000
    );

  const payload = {
    iat:
      now - 60,
    exp:
      now + 540,
    iss:
      String(
        env.GITHUB_APP_ID
      ),
  };

  const unsigned =
    `${base64UrlEncodeJson(
      header
    )}.${base64UrlEncodeJson(
      payload
    )}`;

  const key =
    await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(
        env.GITHUB_APP_PRIVATE_KEY
      ),
      {
        name:
          'RSASSA-PKCS1-v1_5',
        hash:
          'SHA-256',
      },
      false,
      [
        'sign',
      ]
    );

  const signature =
    await crypto.subtle.sign(
      {
        name:
          'RSASSA-PKCS1-v1_5',
      },
      key,
      new TextEncoder().encode(
        unsigned
      )
    );

  return (
    `${unsigned}.` +
    base64UrlEncodeBytes(
      new Uint8Array(
        signature
      )
    )
  );
}

let cachedInstallationToken =
  null;

let cachedInstallationTokenExpiresAt =
  0;

export async function getGitHubToken(
  env
) {
  if (
    env.GITHUB_TOKEN
  ) {
    return env.GITHUB_TOKEN;
  }

  const now =
    Date.now();

  if (
    cachedInstallationToken &&
    now <
      cachedInstallationTokenExpiresAt
  ) {
    return cachedInstallationToken;
  }

  if (
    !env.GITHUB_APP_INSTALLATION_ID
  ) {
    throw new Error(
      'GITHUB_APP_INSTALLATION_ID is not configured.'
    );
  }

  const jwt =
    await signAppJwt(
      env
    );

  const response =
    await fetch(
      `${API}/app/installations/${encodeURIComponent(
        env.GITHUB_APP_INSTALLATION_ID
      )}/access_tokens`,
      {
        method:
          'POST',

        headers: {
          Authorization:
            `Bearer ${jwt}`,

          Accept:
            'application/vnd.github+json',

          'X-GitHub-Api-Version':
            API_VERSION,

          'User-Agent':
            'OVYX-Agent/1.0',
        },
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (
    !response.ok
  ) {
    throw new Error(
      data.message ||
        `GitHub installation token failed (${response.status}).`
    );
  }

  cachedInstallationToken =
    data.token;

  cachedInstallationTokenExpiresAt =
    Date.parse(
      data.expires_at ||
        ''
    ) -
    120_000;

  return cachedInstallationToken;
}

export async function githubFetch(
  env,
  path,
  options = {}
) {
  const token =
    await getGitHubToken(
      env
    );

  const headers =
    new Headers(
      options.headers ||
        {}
    );

  headers.set(
    'Accept',
    headers.get(
      'Accept'
    ) ||
      'application/vnd.github+json'
  );

  headers.set(
    'Authorization',
    `Bearer ${token}`
  );

  headers.set(
    'X-GitHub-Api-Version',
    API_VERSION
  );

  headers.set(
    'User-Agent',
    'OVYX-Agent/1.0'
  );

  if (
    options.body &&
    !headers.has(
      'Content-Type'
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json'
    );
  }

  const response =
    await fetch(
      `${API}${path}`,
      {
        ...options,
        headers,
      }
    );

  if (
    !response.ok
  ) {
    const text =
      await response.text();

    let message =
      text.slice(
        0,
        1000
      );

    try {
      message =
        JSON.parse(
          text
        ).message ||
        message;
    } catch {}

    const error =
      Object.assign(
        new Error(
          message ||
            `GitHub HTTP ${response.status}`
        ),
        {
          status:
            response.status,
          githubStatus:
            response.status,
        }
      );

    throw error;
  }

  return response;
}

export async function getBranch(
  env,
  owner,
  repo,
  branch
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/git/ref/heads/${encodeURIComponent(
        branch
      )}`
    );

  const data =
    await response.json();

  return {
    sha:
      data.object.sha,
    ref:
      data.ref,
  };
}

export async function getCommit(
  env,
  owner,
  repo,
  sha
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/git/commits/${encodeURIComponent(
        sha
      )}`
    );

  return response.json();
}

export async function listTree(
  env,
  owner,
  repo,
  branch
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const ref =
    await getBranch(
      env,
      r.owner,
      r.repo,
      branch
    );

  const commit =
    await getCommit(
      env,
      r.owner,
      r.repo,
      ref.sha
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/git/trees/${encodeURIComponent(
        commit.tree.sha
      )}?recursive=1`
    );

  const data =
    await response.json();

  if (
    data.truncated
  ) {
    const err =
      Object.assign(
        new Error(
          'GitHub returned a truncated repository tree. Narrow the project or use a smaller repository.'
        ),
        {
          code:
            'TREE_TRUNCATED',
        }
      );

    err.partialTree =
      data.tree ||
      [];

    throw err;
  }

  const files =
    (
      data.tree ||
      []
    )
      .filter(
        x =>
          x.type ===
          'blob'
      )
      .map(
        x => ({
          path:
            x.path,
          sha:
            x.sha,
          size:
            x.size || 0,
        })
      );

  return {
    files,
    commitSha:
      ref.sha,
    treeSha:
      commit.tree.sha,
  };
}

export async function readFile(
  env,
  owner,
  repo,
  path,
  branch
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const encodedPath =
    path
      .split('/')
      .map(
        encodeURIComponent
      )
      .join('/');

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/contents/${encodedPath}?ref=${encodeURIComponent(
        branch
      )}`
    );

  const data =
    await response.json();

  if (
    Array.isArray(
      data
    ) ||
    data.type !==
      'file'
  ) {
    throw new Error(
      `${path} is not a file.`
    );
  }

  if (
    typeof data.content ===
      'string' &&
    data.encoding ===
      'base64'
  ) {
    const cleaned =
      data.content.replace(
        /\s+/g,
        ''
      );

    const binary =
      atob(cleaned);

    const bytes =
      Uint8Array.from(
        binary,
        c =>
          c.charCodeAt(0)
      );

    return {
      path,
      sha:
        data.sha,
      content:
        new TextDecoder().decode(
          bytes
        ),
      size:
        data.size ||
        bytes.length,
    };
  }

  const blobResponse =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/git/blobs/${encodeURIComponent(
        data.sha
      )}`,
      {
        headers: {
          Accept:
            'application/vnd.github.raw+json',
        },
      }
    );

  return {
    path,
    sha:
      data.sha,
    content:
      await blobResponse.text(),
    size:
      data.size || 0,
  };
}

function encodeUtf8Base64(
  text
) {
  const bytes =
    new TextEncoder().encode(
      String(text)
    );

  return (
    base64UrlEncodeBytes(
      bytes
    )
      .replace(
        /-/g,
        '+'
      )
      .replace(
        /_/g,
        '/'
      )
      .replace(
        /=+$/g,
        ''
      ) +
    '='.repeat(
      (
        4 -
        (
          bytes.length %
          3
        )
      ) % 3
    )
  );
}

export async function createBranch(
  env,
  owner,
  repo,
  baseBranch,
  newBranch
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const base =
    await getBranch(
      env,
      r.owner,
      r.repo,
      baseBranch
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/git/refs`,
      {
        method:
          'POST',

        body:
          JSON.stringify({
            ref:
              `refs/heads/${newBranch}`,
            sha:
              base.sha,
          }),
      }
    );

  const data =
    await response.json();

  return {
    sha:
      data.object.sha,
    ref:
      data.ref,
    baseSha:
      base.sha,
  };
}

export async function commitBatch(
  env,
  owner,
  repo,
  branch,
  changes,
  message
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const ref =
    await getBranch(
      env,
      r.owner,
      r.repo,
      branch
    );

  const commit =
    await getCommit(
      env,
      r.owner,
      r.repo,
      ref.sha
    );

  const treeItems =
    [];

  for (
    const change of changes
  ) {
    const path =
      change.path;

    if (
      change.action ===
      'delete'
    ) {
      treeItems.push({
        path,
        mode:
          '100644',
        type:
          'blob',
        sha:
          null,
      });

      continue;
    }

    const blob =
      await githubFetch(
        env,
        `/repos/${encodeURIComponent(
          r.owner
        )}/${encodeURIComponent(
          r.repo
        )}/git/blobs`,
        {
          method:
            'POST',

          body:
            JSON.stringify({
              encoding:
                'base64',
              content:
                encodeUtf8Base64(
                  change.content
                ),
            }),
        }
      );

    const blobData =
      await blob.json();

    treeItems.push({
      path,
      mode:
        '100644',
      type:
        'blob',
      sha:
        blobData.sha,
    });
  }

  const treeResponse =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/git/trees`,
      {
        method:
          'POST',

        body:
          JSON.stringify({
            base_tree:
              commit.tree.sha,
            tree:
              treeItems,
          }),
      }
    );

  const tree =
    await treeResponse.json();

  const commitResponse =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/git/commits`,
      {
        method:
          'POST',

        body:
          JSON.stringify({
            message,
            tree:
              tree.sha,
            parents: [
              ref.sha,
            ],
          }),
      }
    );

  const newCommit =
    await commitResponse.json();

  await githubFetch(
    env,
    `/repos/${encodeURIComponent(
      r.owner
    )}/${encodeURIComponent(
      r.repo
    )}/git/refs/heads/${encodeURIComponent(
      branch
    )}`,
    {
      method:
        'PATCH',

      body:
        JSON.stringify({
          sha:
            newCommit.sha,
          force:
            false,
        }),
    }
  );

  return {
    commitSha:
      newCommit.sha,
    treeSha:
      tree.sha,
    parentSha:
      ref.sha,
  };
}

export async function createPullRequest(
  env,
  owner,
  repo,
  {
    title,
    body,
    head,
    base,
    draft = true,
  }
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/pulls`,
      {
        method:
          'POST',

        body:
          JSON.stringify({
            title,
            body,
            head,
            base,
            draft,
          }),
      }
    );

  const data =
    await response.json();

  return {
    number:
      data.number,
    url:
      data.html_url,
    apiUrl:
      data.url,
    draft:
      !!data.draft,
  };
}

export async function updatePullRequest(
  env,
  owner,
  repo,
  number,
  patch
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/pulls/${encodeURIComponent(
        number
      )}`,
      {
        method:
          'PATCH',

        body:
          JSON.stringify(
            patch
          ),
      }
    );

  const data =
    await response.json();

  return {
    number:
      data.number,
    url:
      data.html_url,
    draft:
      !!data.draft,
    state:
      data.state,
  };
}

export async function getWorkflowRun(
  env,
  owner,
  repo,
  runId
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/actions/runs/${encodeURIComponent(
        runId
      )}`
    );

  return response.json();
}

export async function getWorkflowJobs(
  env,
  owner,
  repo,
  runId
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/actions/runs/${encodeURIComponent(
        runId
      )}/jobs?per_page=100`
    );

  return response.json();
}

export async function getJobLogs(
  env,
  owner,
  repo,
  jobId
) {
  const r =
    normalizeRepo(
      owner,
      repo
    );

  const response =
    await githubFetch(
      env,
      `/repos/${encodeURIComponent(
        r.owner
      )}/${encodeURIComponent(
        r.repo
      )}/actions/jobs/${encodeURIComponent(
        jobId
      )}/logs`,
      {
        headers: {
          Accept:
            'text/plain',
        },
      }
    );

  return response.text();
      }

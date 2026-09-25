import {
  hasAdminClaim,
} from './firebase.js';

export function normalizeRepo(
  owner,
  name
) {
  const o =
    String(
      owner || ''
    ).trim();

  const r =
    String(
      name || ''
    )
      .trim()
      .replace(
        /\.git$/i,
        ''
      );

  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(
      o
    ) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(
      r
    )
  ) {
    throw Object.assign(
      new Error(
        'Invalid GitHub repository identifier.'
      ),
      {
        status:
          400,
        code:
          'INVALID_REPO',
      }
    );
  }

  return {
    owner: o,
    repo: r,
  };
}

export function assertRepoAllowed(
  user,
  env,
  repo
) {
  const allowedRaw =
    String(
      env.GITHUB_ALLOWED_REPOS ||
        ''
    ).trim();

  if (!allowedRaw) {
    throw Object.assign(
      new Error(
        'GITHUB_ALLOWED_REPOS is not configured.'
      ),
      {
        status:
          503,
        code:
          'GITHUB_REPO_NOT_CONFIGURED',
      }
    );
  }

  const key =
    `${repo.owner}/${repo.repo}`.toLowerCase();

  const allowed =
    allowedRaw
      .split(',')
      .map(
        x =>
          x.trim().toLowerCase()
      )
      .filter(Boolean);

  if (
    allowed.includes(
      key
    )
  ) {
    return repo;
  }

  const userRepos =
    Array.isArray(
      user?.githubRepos
    )
      ? user.githubRepos.map(
          x =>
            String(
              x
            ).toLowerCase()
        )
      : [];

  if (
    hasAdminClaim(
      user
    ) &&
    allowed.includes('*')
  ) {
    return repo;
  }

  if (
    userRepos.includes(
      key
    )
  ) {
    return repo;
  }

  throw Object.assign(
    new Error(
      'This GitHub repository is not linked to your OVYX workspace.'
    ),
    {
      status:
        403,
      code:
        'REPO_NOT_LINKED',
    }
  );
}

export function assertSafePath(
  path,
  {
    allowDeletes = false,
    allowWorkflowChanges = false,
  } = {}
) {
  const p =
    String(
      path || ''
    )
      .trim()
      .replace(
        /^\//,
        ''
      );

  if (
    !p ||
    p.length >
      500
  ) {
    throw new Error(
      'Invalid file path.'
    );
  }

  if (
    p.includes('..') ||
    p.includes('\\') ||
    p.startsWith(
      '.git/'
    )
  ) {
    throw new Error(
      `Blocked path: ${p}`
    );
  }

  if (
    /^(node_modules|dist|build|coverage|\.cache)\//i.test(
      p
    )
  ) {
    throw new Error(
      `Generated/dependency path is not editable: ${p}`
    );
  }

  if (
    /^\.env(?:\.|$)/i.test(
      p
    )
  ) {
    throw new Error(
      `Secret file is not editable: ${p}`
    );
  }

  if (
    /^\.github\/workflows\//i.test(
      p
    ) &&
    !allowWorkflowChanges
  ) {
    throw new Error(
      `Workflow file edits require elevated permission: ${p}`
    );
  }

  if (
    !allowDeletes &&
    p ===
      '__DELETE__'
  ) {
    throw new Error(
      'Destructive delete not allowed.'
    );
  }

  return p;
}

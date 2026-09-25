const SECRET_RE =
  /(api[_-]?key|access[_-]?token|private[_-]?key|client[_-]?secret|service[_-]?account|password)\s*[:=]\s*["'`][^"'`]{12,}/i;

const PLACEHOLDER_RE =
  /\b(TODO|FIXME|NOT_IMPLEMENTED|IMPLEMENT_LATER|STUB|MOCK_RESPONSE)\b/i;

function basicStructureCheck(
  text
) {
  const pairs =
    new Map([
      [
        '{',
        '}',
      ],
      [
        '[',
        ']',
      ],
      [
        '(',
        ')',
      ],
    ]);

  const closers =
    new Set([
      '}',
      ']',
      ')',
    ]);

  const stack =
    [];

  let quote =
    null;

  let escaped =
    false;

  let lineComment =
    false;

  let blockComment =
    false;

  for (
    let i = 0;
    i <
    text.length;
    i++
  ) {
    const c =
      text[i];

    const n =
      text[i + 1];

    if (
      lineComment
    ) {
      if (
        c ===
        '\n'
      ) {
        lineComment =
          false;
      }

      continue;
    }

    if (
      blockComment
    ) {
      if (
        c ===
          '*' &&
        n ===
          '/'
      ) {
        blockComment =
          false;

        i++;
      }

      continue;
    }

    if (
      quote
    ) {
      if (
        escaped
      ) {
        escaped =
          false;

        continue;
      }

      if (
        c ===
        '\\'
      ) {
        escaped =
          true;

        continue;
      }

      if (
        c ===
        quote
      ) {
        quote =
          null;
      }

      continue;
    }

    if (
      c ===
        '"' ||
      c ===
        "'" ||
      c ===
        '`'
    ) {
      quote =
        c;

      continue;
    }

    if (
      c ===
        '/' &&
      n ===
        '/'
    ) {
      lineComment =
        true;

      i++;

      continue;
    }

    if (
      c ===
        '/' &&
      n ===
        '*'
    ) {
      blockComment =
        true;

      i++;

      continue;
    }

    if (
      pairs.has(c)
    ) {
      stack.push(
        c
      );
    } else if (
      closers.has(c)
    ) {
      const open =
        stack.pop();

      if (
        !open ||
        pairs.get(
          open
        ) !== c
      ) {
        return `Unbalanced delimiter near character ${i}.`;
      }
    }
  }

  if (quote) {
    return 'Unterminated string/template literal.';
  }

  if (
    blockComment
  ) {
    return 'Unterminated block comment.';
  }

  if (
    stack.length
  ) {
    return 'Unbalanced braces/brackets/parentheses.';
  }

  return null;
}

function htmlCheck(
  text
) {
  const errors =
    [];

  const stack =
    [];

  const voids =
    new Set([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]);

  const tagRe =
    /<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[^<>]*?)?\s*\/?>/g;

  let m;

  while (
    (m =
      tagRe.exec(
        text
      ))
  ) {
    const full =
      m[0];

    const name =
      m[1].toLowerCase();

    if (
      full.startsWith(
        '</'
      )
    ) {
      const last =
        stack.pop();

      if (
        last !==
        name
      ) {
        errors.push(
          `Unexpected closing tag </${name}>.`
        );
      }
    } else if (
      !full.endsWith(
        '/>'
      ) &&
      !voids.has(
        name
      )
    ) {
      stack.push(
        name
      );
    }
  }

  if (
    stack.length
  ) {
    errors.push(
      `Unclosed HTML tag <${stack[stack.length - 1]}>.`
    );
  }

  if (
    !/<html\b/i.test(
      text
    ) &&
    !/<body\b/i.test(
      text
    )
  ) {
    errors.push(
      'HTML file has no recognizable document shell.'
    );
  }

  return errors;
}

function parseJson(
  text,
  path
) {
  try {
    JSON.parse(
      text
    );

    return null;
  } catch (
    err
  ) {
    return `${path}: invalid JSON — ${err.message}`;
  }
}

export function validateChanges(
  changes,
  {
    allowDeletes = false,
  } = {}
) {
  const errors =
    [];

  for (
    const change of changes
  ) {
    const path =
      String(
        change.path ||
          ''
      );

    if (
      change.action ===
      'delete'
    ) {
      if (
        !allowDeletes
      ) {
        errors.push(
          `${path}: delete operation is not allowed.`
        );
      }

      continue;
    }

    const content =
      String(
        change.content ??
          ''
      );

    if (
      !content.trim()
    ) {
      errors.push(
        `${path}: empty file content.`
      );
    }

    if (
      SECRET_RE.test(
        content
      )
    ) {
      errors.push(
        `${path}: possible secret detected.`
      );
    }

    if (
      PLACEHOLDER_RE.test(
        content
      )
    ) {
      errors.push(
        `${path}: placeholder/TODO text detected.`
      );
    }

    if (
      /\.json$/i.test(
        path
      )
    ) {
      const e =
        parseJson(
          content,
          path
        );

      if (e) {
        errors.push(e);
      }
    }

    if (
      /\.(js|mjs|cjs)$/i.test(
        path
      )
    ) {
      const e =
        basicStructureCheck(
          content
        );

      if (e) {
        errors.push(
          `${path}: ${e}`
        );
      }
    }

    if (
      /\.html?$/i.test(
        path
      )
    ) {
      errors.push(
        ...htmlCheck(
          content
        ).map(
          e =>
            `${path}: ${e}`
        )
      );
    }
  }

  return errors;
}

export function validateRepositoryFiles(
  files
) {
  const changes =
    Object.entries(
      files
    ).map(
      ([
        path,
        content,
      ]) => ({
        path,
        action:
          'update',
        content,
      })
    );

  return validateChanges(
    changes,
    {
      allowDeletes:
        true,
    }
  );
    }

// functions/api/deploy.js
// POST /api/deploy   body: { slug, pages, globalStyles }
//
// Stage 3G — Real Deployment.
//
// HOW THIS ACTUALLY WORKS (read this before wiring it up):
// This does NOT call a separate hosting API. It uses the GitHub connection
// you already have configured (the same GITHUB_TOKEN used elsewhere) to
// commit real static HTML files into your existing repo, under
// `deployed-sites/<slug>/`. Because your Cloudflare Pages project is
// already connected to this GitHub repo and set to auto-deploy on push,
// committing these files is what makes Cloudflare actually build and
// publish them - the same real pipeline your own app uses to update itself.
//
// This means every deployed project lives at a path under your existing
// Cloudflare Pages domain, e.g.:
//   https://your-project.pages.dev/deployed-sites/<slug>/
// Custom domains per-project are a real, separate piece of work (Stage 3G
// only asks for the *foundation* for that - see the domain status the
// frontend shows).
//
// REQUIRED environment variables (set these in Cloudflare):
//   GITHUB_TOKEN  - already used elsewhere in this project
//   GITHUB_REPO   - "your-username/your-repo-name" (NEW - not set yet)
//
// If either is missing, this honestly reports "not connected" - it never
// pretends a deployment happened.

export async function onRequestPost(context) {
    const { request, env } = context;

    const token = env.GITHUB_TOKEN;
    const repo = env.GITHUB_REPO; // "owner/repo"

    if (!token) {
        return json({ success: false, stage: 'preparing', error: 'GitHub is not connected. Add GITHUB_TOKEN in Cloudflare to enable deployment.' });
    }
    if (!repo) {
        return json({ success: false, stage: 'preparing', error: 'No repository configured. Add a GITHUB_REPO environment variable (e.g. "yourname/ovyx") in Cloudflare.' });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, stage: 'preparing', error: 'Invalid request body.' }, 400);
    }

    const { slug, pages, globalStyles } = body || {};
    if (!slug || !Array.isArray(pages) || pages.length === 0) {
        return json({ success: false, stage: 'preparing', error: 'No project data to deploy.' }, 400);
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
        return json({ success: false, stage: 'preparing', error: 'Project slug must be lowercase letters, numbers, and hyphens only.' }, 400);
    }

    try {
        // ── Build: render each page to real static HTML ──
        const files = pages.map(page => ({
            path: `deployed-sites/${slug}/${page.slug === 'home' || pages[0].id === page.id ? 'index' : page.slug}.html`,
            content: renderPageHTML(page, globalStyles || {}),
        }));

        // ── Upload: commit each file via the GitHub Contents API ──
        const commitResults = [];
        for (const file of files) {
            const result = await commitFile(repo, token, file.path, file.content);
            if (!result.success) {
                return json({
                    success: false,
                    stage: 'uploading',
                    error: `Couldn't publish "${file.path}": ${result.error}`,
                });
            }
            commitResults.push(result);
        }

        const latestCommit = commitResults[commitResults.length - 1];
        const [owner, repoName] = repo.split('/');
        // This is the conventional Cloudflare Pages URL pattern. If the
        // project uses a custom Pages project name, CLOUDFLARE_PAGES_URL
        // can override it.
        const baseUrl = env.CLOUDFLARE_PAGES_URL || `https://${repoName}.pages.dev`;
        const liveUrl = `${baseUrl}/deployed-sites/${slug}/`;

        return json({
            success: true,
            stage: 'deploying',
            commitSha: latestCommit.sha,
            liveUrl,
            filesPublished: files.length,
            note: 'Files committed. Cloudflare is now building - this can take 30-90 seconds. Use /api/deployment-status to check when it is actually live.',
        });
    } catch (err) {
        return json({ success: false, stage: 'uploading', error: err.message || 'Deployment failed unexpectedly.' });
    }
}

async function commitFile(repo, token, path, content) {
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Ovyx-Deploy',
    };

    // GitHub requires the existing file's SHA to update it - fetch it first.
    let existingSha = null;
    try {
        const getRes = await fetch(url, { headers });
        if (getRes.ok) {
            const data = await getRes.json();
            existingSha = data.sha;
        }
    } catch { /* file doesn't exist yet - that's fine, we're creating it */ }

    const putRes = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
            message: `Deploy: update ${path}`,
            content: base64Encode(content),
            sha: existingSha || undefined,
        }),
    });

    const data = await putRes.json();
    if (!putRes.ok) {
        return { success: false, error: data.message || `GitHub API returned ${putRes.status}` };
    }
    return { success: true, sha: data.commit?.sha };
}

function base64Encode(str) {
    // Cloudflare Workers runtime - btoa doesn't handle UTF-8 directly.
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
}

function renderPageHTML(page, globalStyles) {
    const sections = (page.sections || []).map(sec => {
        if (sec.rawHtmlOverride != null) return sec.rawHtmlOverride;
        const s = sec.styles || {};
        const styleStr = Object.entries(s).map(([k, v]) => `${k}:${v}`).join(';');
        const c = sec.content || {};
        let inner = '';
        switch (sec.type) {
            case 'hero':
                inner = `<h1 style="font-size:2.5rem;font-weight:800;margin-bottom:0.5rem;">${escapeHtml(c.heading || '')}</h1><p style="font-size:1.2rem;opacity:0.8;margin-bottom:1rem;">${escapeHtml(c.subheading || '')}</p>${c.cta ? `<a href="#" style="display:inline-block;background:#d4a06a;color:#000;padding:0.6rem 1.8rem;border-radius:999px;text-decoration:none;font-weight:600;">${escapeHtml(c.cta)}</a>` : ''}`;
                break;
            case 'text':
                inner = `<p style="font-size:1.1rem;line-height:1.8;">${escapeHtml(c.text || '')}</p>`;
                break;
            default:
                inner = `<div>${escapeHtml(JSON.stringify(c))}</div>`;
        }
        return `<section style="${styleStr}">${inner}</section>`;
    }).join('\n');

    if (page.rawHtmlOverride != null) {
        return wrapDocument(page.name, page.rawHtmlOverride, globalStyles);
    }
    return wrapDocument(page.name, sections, globalStyles);
}

function wrapDocument(title, bodyHtml, styles) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title || 'Website')}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:${styles.fontFamily || 'Inter, sans-serif'};background:${styles.bodyBackground || '#0a0a0a'};color:${styles.bodyColor || '#e0e0e0'};line-height:1.6;}a{color:${styles.linkColor || '#d4a06a'};}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
                                            }
            
                                               

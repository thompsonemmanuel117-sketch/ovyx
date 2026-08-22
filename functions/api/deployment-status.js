// functions/api/deployment-status.js
// GET /api/deployment-status?url=<liveUrl>
//
// After /api/deploy commits the files, Cloudflare needs time to actually
// build and publish them. This endpoint does a REAL fetch of the live URL
// and reports whether it's actually responding - it never assumes success
// just because the commit succeeded.

export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url).searchParams.get('url');

    if (!url) {
        return json({ live: false, error: 'No URL provided.' }, 400);
    }

    try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        return json({
            live: res.ok,
            status: res.status,
            checkedUrl: url,
        });
    } catch (err) {
        // Site not reachable yet (still building) or a real network problem -
        // either way, honestly report "not live yet" rather than guessing.
        return json({ live: false, status: null, checkedUrl: url, error: 'Site is not responding yet.' });
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

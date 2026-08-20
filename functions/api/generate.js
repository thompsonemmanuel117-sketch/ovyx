// functions/api/generate.js
// POST /api/generate   body: { prompt, template, provider }
//
// Stage 3C — AI Website Builder (real implementation).
// Takes the user's idea, asks the configured AI provider to plan and produce
// a structured website (pages -> sections -> content/styles) matching the
// existing Web Studio project model, validates it, and returns it.
//
// The AI never returns raw HTML that gets injected directly - it returns
// structured data that ForgeOS controls and can safely render/edit.

import { getProviderKey, callProvider } from './_lib/providers.js';

const SYSTEM_PROMPT = `You are ForgeOS's website planning engine.
Given a user's idea, respond with ONLY valid JSON (no markdown fences, no commentary)
matching exactly this shape:

{
  "pages": [
    {
      "id": "page-home",
      "name": "Home",
      "slug": "home",
      "sections": [
        {
          "id": "sec-hero",
          "type": "hero",
          "content": { "heading": "...", "subheading": "...", "cta": "..." },
          "styles": { "textAlign": "center", "padding": "4rem 2rem", "background": "#1a1a2e", "color": "#ffffff" }
        }
      ]
    }
  ],
  "globalStyles": { "primaryColor": "#00b4d8", "fontFamily": "Inter, sans-serif" },
  "responsive": { "mobileOptimized": true }
}

Rules:
- Choose pages and sections that fit the user's actual goal (a restaurant needs a menu/hours/reservation CTA,
  a portfolio needs projects/about/contact, a SaaS product needs features/pricing/testimonials, etc).
  Do not use one generic structure for every idea.
- Every page needs a unique "id" and "slug". Every section needs a unique "id" and a "type"
  (hero, features, text, form, footer, gallery, pricing, testimonials, cta, or similar).
- Keep it to 3-5 pages and 2-5 sections per page for a first version.
- Output raw JSON only - it will be parsed directly.`;

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Invalid request body.' }, 400);
    }

    const { prompt, template, provider } = body || {};
    if (!prompt || !provider) {
        return json({ success: false, error: 'A prompt and provider are required.' }, 400);
    }

    const apiKey = getProviderKey(provider, env);
    if (!apiKey) {
        return json({ success: false, error: `${provider} is not configured on the server.` }, 200);
    }

    const userMessage = `${SYSTEM_PROMPT}\n\nUser's idea: "${prompt}"${template ? `\nStarting point/template hint: ${template}` : ''}`;

    let raw;
    try {
        raw = await callProvider(provider, apiKey, userMessage);
    } catch (err) {
        return json({ success: false, error: err.message || 'The AI provider could not be reached.' }, 200);
    }

    let projectData;
    try {
        projectData = parseAIJson(raw);
    } catch {
        return json({ success: false, error: 'The AI returned a response that could not be understood. Please try again.' }, 200);
    }

    const validationError = validateProjectData(projectData);
    if (validationError) {
        return json({ success: false, error: validationError }, 200);
    }

    return json({ success: true, projectData });
}

// Strips markdown code fences if the model wraps its JSON in ```json ... ```
function parseAIJson(raw) {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    return JSON.parse(cleaned);
}

// Basic structural validation - rejects malformed AI output before it ever
// reaches Web Studio or gets saved.
function validateProjectData(data) {
    if (!data || typeof data !== 'object') return 'AI response was not a valid object.';
    if (!Array.isArray(data.pages) || data.pages.length === 0) return 'AI response had no pages.';

    const seenPageIds = new Set();
    for (const page of data.pages) {
        if (!page.id || typeof page.id !== 'string') return 'A page was missing a valid id.';
        if (seenPageIds.has(page.id)) return `Duplicate page id: ${page.id}`;
        seenPageIds.add(page.id);
        if (!page.name || !page.slug) return `Page ${page.id} is missing a name or slug.`;
        if (!Array.isArray(page.sections) || page.sections.length === 0) {
            return `Page ${page.id} has no sections.`;
        }
        const seenSectionIds = new Set();
        for (const sec of page.sections) {
            if (!sec.id || typeof sec.id !== 'string') return `A section in page ${page.id} is missing a valid id.`;
            if (seenSectionIds.has(sec.id)) return `Duplicate section id: ${sec.id}`;
            seenSectionIds.add(sec.id);
            if (!sec.type) return `Section ${sec.id} is missing a type.`;
            if (!sec.content || typeof sec.content !== 'object') return `Section ${sec.id} is missing content.`;
        }
    }
    return null; // valid
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
  

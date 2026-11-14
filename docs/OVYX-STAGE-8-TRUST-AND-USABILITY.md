# OVYX Stage 8 — Trust and usability

## Audit findings before changes

- Ordinary assistant chat already uses `POST /api/ai/ovyx` and the native OVYX AI service. Stage 7 has added curated source knowledge about OVYX, separate tools for inspecting a signed-in user's saved project, and clear boundaries between platform-repository questions and user-project questions.
- The AI Preferences page still showed end-user selectors for Gemini, Claude, OpenAI and specific models, plus provider-priority and fallback controls. Those choices were misleading in guarded Cloudflare mode because server-side routing intentionally ignores client attempts to override the configured engine.
- The existing settings page already had Balanced/Fast/Quality cards, but the native chat request did not pass the selected value to the server; the saved preference therefore did not reliably change actual native chat behavior.
- The existing admin-only `/api/ai/status` endpoint is designed for provider diagnostics and must not be used as a general-user readiness panel. The new readiness route is authenticated but non-admin, does not run model inference, does not access secret values, and does not spend AI quota.

## What Stage 8 changes

### 1. Simple OVYX modes, not provider names

AI Preferences now offers:

- **OVYX Everyday** — a balanced response for normal questions and tasks (up to 1,800 output tokens).
- **OVYX Quick** — concise answers and smaller tasks (up to 900 output tokens).
- **OVYX Deep** — more room for complex reasoning and code review (up to 2,800 output tokens).

The server accepts only the three known values and safely normalizes invalid input to Everyday. The mode changes response instructions and the bounded output-token budget; it does not select a third-party provider, raise the daily neuron allowance, or bypass quota rules. The settings UI removes obsolete preferred-provider, model, provider-priority and fallback selectors. The Home composer now uses the same **OVYX Everyday / Quick / Deep** names instead of a Gemini/Claude/OpenAI selector; changing a Home mode is verified against the authenticated account preference API and updates the shared mode state. Home builds always hand off to Web Studio with managed routing, even if old browser storage contains a legacy provider choice. It keeps the existing user's safety and project-context preferences. Existing stored provider/model preferences are normalized to server-selected routing (`automatic`).

Web Studio and App Studio generation still use their separate workflows. Selecting OVYX Deep does not replace the site/app generation workflow or weaken entitlements, preview/approval controls, or source validation.

### 2. Visible, honest AI readiness

`GET /api/ai/readiness` requires a signed-in user and returns only a safe readiness state:

- the Cloudflare Workers AI binding is configured; or
- the binding is missing and platform-admin setup is required.

The route does **not** query saved personal AI Brain connections, call the AI model, test a credential, return a connection ID, read or return secret values, or spend usage. Legacy external AI connection records cannot make OVYX look configured. The UI intentionally says **“Cloudflare AI configured — not live-tested”**. A real request can still fail because of an exhausted allowance, inactive connection, temporary upstream issue, or bad configuration. That distinction avoids a false “Ready” promise.

The readiness card appears in AI Preferences, the Home composer shows a compact OVYX AI status chip, and the workspace assistant header shows the same status. It can be refreshed manually. It uses the existing Firebase session and same-origin endpoint with no caching.

### 3. Helpful recovery messages

Ordinary assistant failures are mapped to plain-language guidance for common conditions: sign-in expiry, missing AI setup, an exhausted protected allowance, a timed-out request, a temporarily unavailable Cloudflare service, and missing feature access. The quota message explains that OVYX stopped instead of switching providers. Cloudflare service and quota failures are reported directly; no saved external AI Brain can be tested, selected, or used as a substitute.

### 4. Regression and safety boundaries

- Existing plan entitlements, AI quota reservations/refunds, daily neuron ledger protections, and Stage 7 quota stop remain in place.
- Cloudflare Workers AI is the only platform model provider across native chat, Web Studio, App Studio, Agent and automated repair. Personal/external AI Brain assignments are disabled; legacy encrypted records are retained but ignored. Non-AI HTTP, webhook, database and tool connections remain separate.
- No external provider is automatically selected, no local model is introduced, and no quota is increased.
- Readiness checks are configuration-only and must never be described as successful live inference.
- The new tests assert the readiness endpoint is authenticated, no-inference, no-secret and no-store; verify mode-to-token-budget behavior; and protect the removal of confusing user-facing provider selectors.
- Existing ordinary-chat, provider-routing, Stage 5, Stage 6, Stage 7, Universal Connections, project-knowledge, image-generation and Web Studio tests remain registered.

## User acceptance checklist

1. Open Home. Confirm the old Gemini/Claude/OpenAI **BRAIN** selector is gone and the composer offers **OVYX Everyday**, **OVYX Quick**, and **OVYX Deep**. Change a mode and confirm it saves to the signed-in account. Open Settings → AI Preferences and confirm the same mode is selected.
2. Confirm the Settings page has no provider/model/provider-priority/fallback selector. Select **OVYX Everyday**, save, leave Settings, and return. Confirm Everyday remains selected.
3. Send a normal chat message. Confirm the result shows truthful provider metadata and works as usual.
4. Select **OVYX Quick**, send the same short question, and confirm it returns a shorter answer. Select **OVYX Deep** and ask a multi-step question; confirm it has a larger response budget. These modes should not switch providers.
5. Open the assistant and check the readiness badge. It must say **configured — not live-tested**, not promise that a live AI call succeeded.
6. Click **Check again** in AI Preferences. Confirm the readiness check completes without charging tokens or invoking model inference.
7. Test a no-AI-binding environment. The panel must say setup is needed and direct the user to the platform administrator; it must not invite a personal AI provider connection.
8. With a legacy saved AI Brain record present, confirm readiness never queries it and still reports only the Cloudflare binding state.
9. Confirm Universal Connections still supports non-AI HTTP, webhook, database and tool records, while legacy AI records cannot be tested or activated.
10. In a controlled test, exhaust the Cloudflare AI allowance. Confirm OVYX shows a plain-language limit message and stops—no alternate-provider fallback.
11. Confirm Web Studio and App Studio still generate through their own routes and retain existing validation, entitlement, quota, preview and repair controls.
12. Run `npm test`, `npm run validate`, `npm run build`, and `npm run check` in CI. Live AI inference and deployed website acceptance must be reported separately from these automated tests.

## Completion boundary

A passing readiness check means configuration was found; it is not proof that the next live AI call will succeed. Live model access, quota availability and production website/app acceptance still require real acceptance tests. The Stage 4 live benchmark remains separate and must not be marked passed while the required Cloudflare allowance is unavailable.

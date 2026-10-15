# OVYX Settings Audit Checkpoint — Stage 1

**Status:** Source inventory recorded; live-browser verification remains pending.
**Baseline:** main @ 49d4fe7493b8f5b221ca6a0979de5f0bac0d4106 — “Repair Settings workspace and project sync”.
**Rollback branch:** rollback/settings-baseline-20261015 (created at that exact baseline SHA; preserve it).
**Stage 1 merge:** merged into `main` by PR #136; main merge commit `3ed1e28d0d78155c08011592a9ae19280ec4376d`. The temporary audit branch was used only to submit the inventory; its files are now in `main`.
**Source:** index.html blob 5ccef85057bf2a4b18958d676139ffcd5c26fcdf; Settings runtime asset blob e2304b9e2f34b2762b67ffc594eb5848a886155a.
**Links:** [Baseline commit](https://github.com/thompsonemmanuel117-sketch/ovyx/commit/49d4fe7493b8f5b221ca6a0979de5f0bac0d4106) · [Settings runtime](https://github.com/thompsonemmanuel117-sketch/ovyx/blob/main/assets/ovyx-settings-reliability.js) · [Source contract tests](https://github.com/thompsonemmanuel117-sketch/ovyx/blob/main/scripts/ovyx-settings-actions.test.mjs)

Scope: inventory source-visible controls and current handlers without rebuilding anything. Source inspection is not proof that a control succeeds in the live application. GitHub inspection cannot reveal an agent's local uncommitted working-tree changes; that remains unknown.

## Control inventory — all 13 categories

Legend: **Account/server** = authenticated API-backed; **Browser-local** = localStorage or local runtime; **Navigation/read-only** = display or routing only; **External integration** = depends on configuration and server/provider response. All controls still need browser verification.

### 1. General
- [ ] Settings search (#ovyx-settings-search): filters category navigation and opens matching section; UI state only. Handler: OVYXSettings.search in index.html.
- [ ] Open Profile, Open Appearance, Configure Workspace, Configure Notifications: navigate to category; no data save.
- [ ] All 13 sidebar category buttons: call OVYXSettings.show; visibility/navigation only.

### 2. Profile
- [ ] Display name and Workspace name fields (#set-profile-name, #set-workspace-name; legacy IDs also exist): Save calls PUT /api/settings/profile; loading uses GET /api/settings/profile. Server API: functions/api/settings/profile.js. Successful values are also cached under a per-user localStorage key and Firebase displayName sync is attempted. **Account/server + local cache.**
- [ ] Save Profile (#profile-save-action / [data-save-profile]): capture-phase runtime intercepts older local-only click handler and sends server save. Must test confirmation and failure paths.
- [ ] Change profile photo (#profile-photo-button, #profile-photo-input): resize/validate image, browser-local profile cache, then Firebase Storage upload to profile/<uid>/avatar.jpg when available; updates Firebase photoURL. **Browser-local + optional Firebase Storage.**
- [ ] Manage authentication: navigates to Security.
- [ ] Switch account: signs out and opens auth flow.
- [ ] Sign out: Firebase sign-out.
- [ ] Delete account (profile action): confirmation + recent-auth check; patched handler calls POST /api/account/delete and Firebase deletion/cleanup. API: functions/api/account/delete.js. Verify older handlers cannot also execute.
- [ ] Account tier, email, account-created metadata: display only.

### 3. Appearance
- [ ] Dark / System / Light: change theme; browser-local appearance state uses ovyx.appearance.v3 and Theme Lab uses ovyx.theme.lab.v1.
- [ ] Interface density (#set-density: comfortable/balanced/compact), Interface scale (#set-scale: small/balanced/large), Motion (#set-motion: full/reduced/minimal): appearance draft/apply/save flow through ThemeContext/canonical handlers; browser-local.
- [ ] Theme cards: preview/select built-in or custom theme; local Theme Lab/ThemeContext state.
- [ ] Theme name, color picker and hex fields ([data-theme-name], [data-theme-field], [data-theme-hex]): edit theme colors/name; browser-local.
- [ ] Save Custom Theme: creates local custom theme.
- [ ] Duplicate: copies current theme to a custom theme.
- [ ] Import: reads JSON file and checks required color keys; browser-local.
- [ ] Export: downloads current theme as JSON; no server save.
- [ ] Delete: removes custom theme; built-in presets should not be deletable.
- [ ] Reset Lab, Clear appearance, Save, Cancel: reset or commit/restore theme draft. Legacy ThemeLab and later canonical handlers both exist; identify the one that executes in browser tests.

### 4. Workspace
- [ ] Open behavior (#set-open-behavior: Web Studio / Last active view / Project overview): browser-local preference; test all three routes.
- [ ] Autosave recovery snapshot (#set-autosave): browser-local; affects recovery snapshots. Multiple storage/handler generations reference ovyx.settings.toggles.v34 and ovyx.settings.integrity.v83; verify one effective value.
- [ ] Confirm destructive actions (#set-confirm-delete): browser-local intended to gate delete confirmation; verify project deletion reads it.
- [ ] Data API endpoint (#ovyx-data-endpoint): saved to ovyx.data.layer.v1 in localStorage; external endpoint config only.
- [ ] OVYX cloud project sync (#ovyx-data-sync): local preference calls OVYXDataLayerSettings.changed and existing ProjectCloudSync hooks. Existing authenticated project service remains the sync service; custom endpoint does not replace /api/projects.
- [ ] Save Data Settings: saves endpoint/toggle locally; does not prove backend readiness.
- [ ] Test API: calls only <endpoint>/health; successful health response is not proof of CRUD/project-sync/PostgreSQL integration.
- [ ] Download PostgreSQL Schema: downloads starter SQL; does not create/connect a database.
- [ ] Status text must not claim the database is connected until a real test supports that statement.

### 5. Notifications
- [ ] Project activity, Generation completed, Deployment status, Connection failures, AI usage warnings, Billing, Product updates (email), Security alerts (email): preference toggles.
- [ ] Toggles are intended as unsaved draft until Save Notification Preferences; runtime intercepts older local-only handlers.
- [ ] Save Notification Preferences: authenticated PUT /api/settings/preferences; load uses GET /api/settings/preferences. API: functions/api/settings/preferences.js. Local fallback is account-scoped ovyx.notifications.v1.user.<uid> (guest fallback if signed out).
- [ ] Reset: save server defaults.
- [ ] Runtime filters supported in-app toasts by these preferences.
- [ ] **Email switches are stored preferences only; they do not send emails without configured mail delivery.**

### 6. Editor
- [ ] Default Web Studio mode (#set-editor-mode: Build/Plan/Ask/Fix): browser-local ovyx.settings.integrity.v83 and calls WebStudio.setMode when available.
- [ ] Show inspector (#set-inspector): browser-local toggle intended to hide/show #app-node-inspector.
- [ ] Live preview (#set-live-preview): browser-local toggle wraps WebStudio.renderPreview to pause automatic refresh; manual refresh bridge exists.
- [ ] Verify persisted preferences take effect in an actual Web Studio session.

### 7. Shortcuts
- [ ] Display-only shortcut rows: Command palette (Ctrl/⌘+K), New project (Ctrl/⌘+N), Save project (Ctrl/⌘+S), Undo, Redo.
- [ ] Reliability runtime implements New/Save, checks ProjectStore outcome against local project snapshot, and reports success/failure. Local save does not mean cloud sync.
- [ ] Command palette/Undo/Redo depend on separate global handlers; they are not Settings-bound actions and need keyboard testing.

### 8. AI
- [ ] Balanced / Fast / Quality: browser-local AI preference saved through OVYXAIStorageKey; runtime adds generation instructions.
- [ ] Preferred model (#set-ai-model) and Preferred provider (#set-provider): browser-local; provider-compatible model override affects generation payload. Unsupported model/provider combinations should revert to Automatic.
- [ ] Explain major changes, Preserve existing structure, Ask before destructive edits: browser-local preferences translated into generation instructions/safeguards.
- [ ] Project files, Current page, GitHub repository context: browser-local preferences for including context; actual access/connection still determines available context.
- [ ] Model routing (#set-ai-routing), Provider fallback (#set-ai-fallback), Context limits (#set-ai-context-limit), Generation budget (#set-ai-budget): browser-local; reliability runtime passes values into AI request/routing/context logic.
- [ ] Save AI Preferences: validates provider/model and persists locally; not cross-device account persistence.
- [ ] Reset AI Preferences: clears/resets browser-local AI preferences.
- [ ] Safe generation (#set-ai-safe legacy toggle) maps to destructive-operation preference. Legacy AI renderers and reliability runtime both have handlers; verify active handler.
- [ ] Related implementation exists in assets/ovyx-settings-reliability.js, functions/_lib/providers.js, functions/api/ai/assistant.js, functions/api/ai/gateway.js and functions/_lib/studio-multipage.js. Source is not live-provider proof.

### 9. Privacy
- [ ] Local-first projects and Telemetry/Controlled: informational rows, not toggles. Actual project-sync setting is in Workspace.
- [ ] Clear appearance data / Reset: clears appearance preference and resets ThemeContext/Theme Lab; browser-local. Multiple reset handlers exist.
- [ ] Privacy Policy and Terms of Service Read: call window.openLegal('privacy'/'terms') when available; test fallback.
- [ ] Support email: mailto link opens the user's mail client; no in-app send action.

### 10. Security
- [ ] Authentication, Secret storage, Production secrets: informational rows, not editable controls.
- [ ] Sign out current session (#ovyx-signout-current): Firebase sign-out then route home.
- [ ] Log Out All Devices (#ovyx-revoke-all-devices): POST /api/api/auth/revoke-sessions; upon success signs out current browser. API: functions/api/api/auth/revoke-sessions.js.
- [ ] Delete account (#ovyx-security-delete): modern handler POSTs /api/account/delete with confirmation and recent-auth requirement, then removes server data/storage and deletes Firebase user. A legacy direct user.delete handler remains in source but should be suppressed by capture handler; browser-test duplicate prevention.
- [ ] Device/browser, sign-in time, account-created details: read-only Firebase/browser metadata; no location collection claimed by this UI.

### 11. Plan
- [ ] Current plan/tier: display from quota/entitlement state; verify server entitlement is authoritative.
- [ ] Open Plans / Upgrade to Pro: routes to Pricing. Purchase only works with configured payment/checkout integration; navigation is not proof of payment.
- [ ] AI usage meter/countdown: token/quota display; timer is UI refresh only.
- [ ] Billing history: source reads local history and shows empty state otherwise; do not treat an unverified local entry as payment proof.
- [ ] Legacy Token Booster route sends user to Pricing; later dedicated Booster UI also exists.

### 12. Usage
- [ ] Monthly token meter (#set-token-meter): authenticated GET /api/tokens/balance; renders usage/limit/remaining and plan details. Signed-out and failed API states have separate messages.
- [ ] Loaded on Usage panel open and auth refresh. Test signed-in, signed-out, server error and malformed response.

### 13. Boosters
- [ ] Starter / Builder / Studio Buy buttons: open OVYXTokenBooster purchase flow; packs are configured in index.html (100k, 500k, 1.5m tokens with NGN prices). Requires sign-in and configured provider; test checkout, cancel, failed payment and confirmed payment.
- [ ] Extra balance and Refresh balance: authenticated GET /api/tokens/balance; display booster balance or unavailable state.
- [ ] Modal/payment confirmation logic exists later in index.html; presence is not proof production checkout is configured. The early Booster placeholder is replaced by a later renderer.

## Cross-cutting findings
1. **Duplicate/legacy handlers:** index.html has several generations of Settings rendering/handlers; assets/ovyx-settings-reliability.js capture-intercepts Profile save/delete, notification actions, toggles and AI controls. Do not add duplicate listeners. Test actual event path first.
2. **Persistence varies:** Profile/Notifications have account APIs; AI/Editor/Workspace/Appearance are mainly browser-local; project sync uses existing authenticated service. Do not claim browser-local preferences sync across devices.
3. **Data Layer is partial:** endpoint save is local, health test only calls /health, and schema download is static. Not a proven complete PostgreSQL integration.
4. **Email preferences don't send mail** without a configured mail-delivery provider.
5. **Tests:** scripts/ovyx-settings-actions.test.mjs is in npm test and checks source patterns, JavaScript syntax and selected API contract invariants. It is not a live-browser test of every control.
6. **CI:** GitHub combined status returned no status entries for baseline SHA; therefore there is no confirmed green CI result recorded for this commit.
7. **Working tree:** source was inspected through GitHub; the connected environment did not reveal any local checkout changes, so local uncommitted changes cannot be ruled out.

## Stage 1 status
- [x] Latest main baseline SHA recorded.
- [x] Rollback branch created at that exact SHA.
- [x] Separate audit branch created at the same SHA.
- [x] All 13 Settings categories inventoried; intended effects, storage/API path and known handler/source recorded.
- [x] Existing test limitations and known misleading/duplicate-handler risks recorded.
- [ ] **Runtime verification remains outstanding:** open the deployed/local application, count rendered and injected controls, and test them. Do not claim the Stage is fully runtime-verified until this evidence is recorded.

## Exact next action
Stage 2: use browser evidence to audit duplicate handlers and misleading status claims first. Begin with Profile save/delete, Notifications save/reset, Workspace toggles/Data Layer, Appearance commit/cancel/reset, AI save/reset/routing, Security revocation, Usage and Booster checkout. Change only failures supported by tests.


## Stage 1 inventory artifact link
A detailed second-format checklist, with per-control intent, persistence location, implementation path, overlap risks, and verification boundary, is also committed at:
- `docs/SETTINGS-CONTROL-INVENTORY.md`
- URL: https://github.com/thompsonemmanuel117-sketch/ovyx/blob/main/docs/SETTINGS-CONTROL-INVENTORY.md

This supplemental document does not change product code. The rollback branch remains untouched. Stage 1 source inventory is complete; rendered/live-browser verification is intentionally still unchecked.


## Mainline merge and build-log checkpoint — 2026-10-15
- [x] PR #136 merged: https://github.com/thompsonemmanuel117-sketch/ovyx/pull/136
- [x] Main commit: `3ed1e28d0d78155c08011592a9ae19280ec4376d`; source files were not changed in this docs-only merge.
- [x] PR verification job `OVYX Agent Verify` run #791 / job `verify` completed with **success**: https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/38814368633
- [x] Verified log steps: `npm test` passed, `npm run validate` reported `OVYX static verification passed.`, and `npm run build` reported `OVYX Pages build preflight passed.`
- [x] Settings action regression output was green within the full npm test chain.
- [!] Non-blocking warnings visible in the log: the Node `punycode` module is deprecated; GitHub warns the workflow's `actions/checkout@v4` and `actions/setup-node@v4` use Node.js 20 while the runner forces Node.js 24. Tests also intentionally exercise missing-provider-secret/configuration paths; the log reports those messages while those tests pass.
- [!] The available combined-status endpoint returns no status contexts for the final squash commit itself. Run #791 checked the pull-request merge tree `28c7cea` before merge, whose application files are identical because PR #136 changed documentation only. Do not describe this as live-browser verification.
- [ ] Real browser click-through of all Settings controls remains pending.

## Mandatory build-log rule for every future stage
1. After each milestone/commit, inspect GitHub Actions for the exact tested commit and open the job log.
2. Confirm `npm test`, `npm run validate`, and `npm run build` (plus new targeted browser tests) actually completed with success.
3. Read warnings/errors from the actual log. Separate expected negative-test configuration messages from genuine failing commands, but record deprecations and actionable warnings in this checkpoint.
4. If a required job is failed or still running, do not claim it passed or mark the stage verified. Inspect the failed step/log, fix only in-scope failures, rerun, and record the result here before proceeding.
5. Keep the rollback branch `rollback/settings-baseline-20261015` untouched. Do not deploy without explicit permission.

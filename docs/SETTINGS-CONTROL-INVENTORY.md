# OVYX Settings Control Inventory — Stage 1

## Frozen baseline

- **Baseline branch:** `main`
- **Baseline commit:** [`49d4fe7493b8f5b221ca6a0979de5f0bac0d4106`](https://github.com/thompsonemmanuel117-sketch/ovyx/commit/49d4fe7493b8f5b221ca6a0979de5f0bac0d4106) — `Repair Settings workspace and project sync` (2026-10-15 20:23:31 UTC).
- **Rollback point:** `rollback/settings-baseline-20261015`, created directly from that exact SHA. Do not move this branch during the Settings audit.
- **Audit/work branch:** `audit/settings-stage-1-20261015`, also started from the exact baseline SHA. Stage 1 documentation is committed here; `main` is not changed.
- **Source fingerprints at the baseline:** `index.html` blob `5ccef85057bf2a4b18958d676139ffcd5c26fcdf`; `assets/ovyx-settings-reliability.js` blob `e2304b9e2f34b2762b67ffc594eb5848a886155a`; `scripts/ovyx-settings-actions.test.mjs` blob `1e90b7ef63db057036c266470d33c0d91dc24992`; `package.json` blob `1820027650adc8f16aa9819090681a6273ceadd9`.
- **Scope rule:** Stage 1 is inventory only. No Settings application behavior has been changed.

## Stage 1 checklist

- [x] Confirm latest `main` HEAD and preserve it as a rollback branch.
- [x] Create an isolated audit branch from the same baseline.
- [x] Inspect the original Settings template and later runtime renderers/patches.
- [x] Inventory all 13 requested navigation categories and their visible controls.
- [x] Mark where controls are device-persisted, account/server-backed, read-only, or only a navigation action.
- [ ] Exercise every interaction in a real browser and verify resulting state/API requests. This is not a Stage 1 claim.
- [ ] Run the test/build suite against the exact audit commit after subsequent implementation work.

**How to read this checklist:** “Code path found” means the source contains a handler or API call; it does not prove that the deployed click works. “Needs browser verification” is deliberately retained until a real click/state/network result is observed.

## Global Settings shell

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Settings search input `#ovyx-settings-search` | Filter category navigation and open the best matching category | In-memory navigation only; `OVYXSettings.search()` | Code path found; test typing, clearing, and keyboard shortcut behavior |
| 13 sidebar category buttons | Show General, Profile, Appearance, Workspace, Notifications, Editor, Shortcuts, AI Preferences, Privacy, Security, Plan, AI Usage, or Token Boosters | In-memory `OVYXSettings.show(id)`; no preference save | All 13 IDs are present in source |
| Escape while Settings search is focused | Clear search and restore category list | No persistence | Key handler exists in Settings code |

## 1. General

| Control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| **Open Profile** | Navigate to Profile | `data-jump="profile"` → `OVYXSettings.show()` | Navigation only |
| **Open Appearance** | Navigate to Appearance | `data-jump="appearance"` → `OVYXSettings.show()` | Navigation only |
| **Configure** (Workspace) | Navigate to Workspace | `data-jump="workspace"` → `OVYXSettings.show()` | Navigation only |
| **Configure** (Notifications) | Navigate to Notifications | `data-jump="notifications"` → `OVYXSettings.show()` | Navigation only |

## 2. Profile

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Change profile photo button + file chooser | Pick and resize PNG/JPEG/WebP photo (8 MB limit) | Local mirror under `ovyx.profile.v1.user.<uid>` (or guest key); tries Firebase Storage `profile/<uid>/avatar.jpg` and Firebase Auth `photoURL` sync | Local update and cloud attempt are in code; browser test needed for signed-out and signed-in failure cases |
| Display name field `#set-profile-name` | Update account display name | Reliability runtime intercepts **Save Profile** and sends authenticated `PUT /api/settings/profile`; Firestore-backed profile plus UID-scoped browser mirror; attempts Firebase Auth display-name sync | Server-backed handler found; legacy profile save listener also exists |
| Workspace name field `#set-workspace-name` | Update workspace label | Same `PUT /api/settings/profile` action and local account mirror | Server-backed handler found; verify it survives reload/sign-in on another device |
| **Save Profile** | Validate and save both names | `assets/ovyx-settings-reliability.js` → `/api/settings/profile` | Capture-phase handler stops the older save listener; verify only one successful save occurs |
| Account tier badge | Show current tier | Read from `KernelState.userTier` / current account state | Read-only; not a plan-change control |
| **Manage authentication** | Open Security | `OVYXSettings.show('security')` | Navigation only |
| **Switch account** | Sign out and show sign-in surface | Firebase Auth `signOut()`, then Router/auth UI | Real auth action in source; browser test needed |
| **Sign out** | End current account session | Firebase Auth `signOut()`, then route home | Real auth action in source; browser test needed |
| **Delete account** (Profile action) | Confirm recent sign-in, remove account/project data, then delete authentication account | Later `patchDelete()` replaces the legacy button and calls authenticated `POST /api/account/delete` with `X-OVYX-Account-Deletion: CONFIRM`; enforces 4-minute recent-auth window, then deletes Firebase user and clears local storage | Server cleanup path is present; destructive action must be tested only with a safe test account |

## 3. Appearance

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Dark / System / Light theme choices | Preview or select base appearance mode | Original controller uses `ovyx.appearance.v3`; later theme authority reads/writes `ovyx-theme` and legacy appearance state | **Known overlap:** more than one theme controller/key exists; canonical preview/save behavior must be browser-tested |
| Interface density selector | Comfortable / Balanced / Compact spacing | Appearance theme state in local storage; later Theme Context stages the change as a preview | Verify preview changes surfaces outside Settings and that Cancel reverts |
| Interface scale selector | Small / Balanced / Large | Same appearance theme state | Preview/save path exists; needs browser verification |
| Animation selector | Full / Reduced / Minimal motion | Same appearance theme state | Preview/save path exists; needs browser verification |
| Theme cards (built-in/custom) | Choose a Theme Lab preset or saved custom theme | Original Theme Lab state key `ovyx.theme.lab.v1`; later theme authority also maps cards into `ovyx-theme` | Multiple controllers are visible in code; test card selection and persistence |
| Theme name field | Name a custom theme | Theme Lab `ovyx.theme.lab.v1` | Local only |
| Background, Panel, Elevated, Primary text, Secondary text, Muted text, Gold/accent, and Border color + hex fields | Edit theme colors | Theme Lab/Theme Context local storage; hex must be a valid 6-digit color | Border is injected by a later renderer; two color-state implementations overlap |
| **Save Custom Theme** | Save current custom palette | Original action is `ThemeLab.saveCustom()`; later capture handlers also govern theme actions | **Needs browser verification:** capture-phase code intentionally blocks some older handlers, so do not assume click works |
| **Duplicate** | Copy current theme into a custom theme | Original `ThemeLab.duplicate()` / local theme state | Needs browser verification due overlapping handlers |
| **Import** | Load a theme JSON file | File chooser + theme validation + local theme state | Needs browser verification |
| **Export** | Download active theme as `ovyx-theme.json` | Browser-generated JSON download; no server save | Export path exists in source |
| **Delete** | Delete selected custom theme; built-in presets should be protected | Theme Lab local state, with fallback to default preset | Needs browser verification |
| **Reset Lab** | Reset Theme Lab to default preset | `ovyx.theme.lab.v1` local state | Needs browser verification |
| **Cancel** | Discard unsaved appearance preview | Later Theme Context `cancel()` | Dynamically inserted by later appearance controller; test reverting on leave |
| **Save Appearance** | Persist current appearance preview | Later Theme Context `saveCanonical()`, primary key `ovyx-theme` | Dynamically inserted by later appearance controller; test reload persistence |
| **Reset** (Clear appearance data in Privacy) | Reset saved appearance/theme values | Removes appearance preference, resets Theme Context/Theme Lab | A later capture handler supersedes an earlier reset handler; test exact reset scope |
| **Start Building** inside the miniature theme preview | Looks like a preview CTA | No Settings click handler was identified for the miniature preview button | Treat as preview artwork until browser test proves it is interactive |

## 4. Workspace

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Open behavior selector | Choose Web Studio, Last active view, or Project overview after opening a project | `ovyx.settings.integrity.v83` local storage; `OVYXSettingsIntegrity` / workspace route handler | Local preference and route wrapper exist; test each option from project list |
| Autosave recovery snapshot toggle `#set-autosave` | Enable/disable local recovery snapshots | `ovyx.settings.toggles.v34` and `ovyx.settings.integrity.v83`; recovery logic checks `autosaveRecoveryEnabled` | Code path found; test off means no snapshot is written and existing snapshots are handled correctly |
| Confirm destructive actions toggle `#set-confirm-delete` | Control confirmation before project deletion | Same local toggle stores; project deletion wrapper checks `confirmDelete` | Code path found; test both enabled and disabled states |
| Data API endpoint field `#ovyx-data-endpoint` | Configure an external server API endpoint | Local storage key `ovyx.data.layer.v1` via `dbSave()` | Local only; does not itself provision a database |
| OVYX cloud project sync toggle `#ovyx-data-sync` | Enable/pause the existing authenticated OVYX project sync | Same `ovyx.data.layer.v1` setting; calls `OVYXDataLayerSettings.changed()` and existing `ProjectCloudSync.load/scheduleSyncActive`; disabled path clears pending sync timer/flag | Wired to existing sync code in latest baseline; test with network and verify reads/writes actually stop when off |
| **Save Data Settings** | Save endpoint and sync preference | `dbSave()` to `ovyx.data.layer.v1` | Device-only setting save |
| **Test API** | Probe configured endpoint health | Browser `GET <endpoint>/health` | **Scope limitation:** health probe only; not proof that Postgres is provisioned or project CRUD works |
| **Download PostgreSQL Schema** | Download starter SQL schema | Browser-generated `ovyx-postgresql-schema.sql` | Static file download; does not connect to or create a database |

## 5. Notifications

The effective panel is rendered later than the original template. Its eight preference switches are **drafts until Save or Reset is pressed**.

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Project activity | Show project changes/saves/important activity | Draft in memory; **Save Notification Preferences** sends authenticated `PUT /api/settings/preferences`; account-scoped local mirror `ovyx.notifications.v1.user.<uid>` | Server-backed on save |
| Generation completed | Notify when AI generation completes | Same server API and local mirror | Server-backed preference; browser test needed |
| Deployment status | Notify about deployment changes | Same server API and local mirror | Server-backed preference; browser test needed |
| Connection failures | Show provider/backend connection errors | Same server API and local mirror | Server-backed preference; used by toast filtering |
| AI usage warnings | Warn near plan limit | Same server API and local mirror | Server-backed preference; verify warning is actually filtered/triggered |
| Billing | Payment/subscription/booster notices | Same server API and local mirror | Preference stored; verify actual notice sources |
| Product updates (email preference) | Record opt-in preference for product update emails | Same server API and local mirror | **Does not send email**; delivery integration is not configured by this control |
| Security alerts (email preference) | Record opt-in preference for security emails | Same server API and local mirror | **Does not send email**; delivery integration is not configured by this control |
| **Save Notification Preferences** | Persist all eight switch values | Capture-phase handler calls `saveNotifications()` → `PUT /api/settings/preferences` | Server confirmation is shown on success; failure should remain visible |
| **Reset** | Restore notification defaults and save them | Calls the same preferences API with default values | Server-backed reset; test failed request handling |
| Legacy Build completion / Connection failures / Usage threshold switches | Older template controls | `set-notify-build/fail/usage` legacy toggles in original panel | Not present in the final dynamically rendered Notifications panel; do not duplicate them |

## 6. Editor

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Default Web Studio mode selector | Set Build / Plan / Ask / Fix default | `ovyx.settings.integrity.v83` and AI/editor runtime; applies `WebStudio.setMode(mode)` | Code path found; test actual Web Studio mode, not just selected option |
| Show inspector toggle `#set-inspector` | Show/hide `#app-node-inspector` | Local setting keys `ovyx.settings.toggles.v34` and `ovyx.settings.integrity.v83`; `applySettingEffects()`/workspace wrapper | Code path found; verify across entering/leaving Web Studio |
| Live preview toggle `#set-live-preview` | Pause/resume automatic preview refresh | Local setting keys above; reliability runtime wraps `WebStudio.renderPreview()`; explicit refresh bridge can force one refresh | Code path found; verify iframe actually stops refreshing when off |

## 7. Shortcuts

These rows are shortcut references, not settings to save. No per-shortcut customization control is visible.

| Visible shortcut row | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Command palette — ⌘ K | Open command palette | Global keyboard handlers elsewhere in the shell | Reference only; test hotkey |
| New project — ⌘ N | Open/create a new project | Reliability runtime intercepts Ctrl/⌘+N and uses `ProjectStore.createPromptModal()`; checks local project snapshot | Device/project state; browser test needed |
| Save project — ⌘ S | Save active project locally | Reliability runtime calls `ProjectStore.save()` and verifies the project in UID/guest-scoped `ovyx.projects.v22...` local storage | Local save only; not cloud-save proof |
| Undo — ⌘ Z | Undo in Web Studio | Web Studio keyboard implementation, outside Settings | Reference only; test inside Web Studio |
| Redo — ⌘ ⇧ Z | Redo in Web Studio | Web Studio keyboard implementation, outside Settings | Reference only; test inside Web Studio |

## 8. AI Preferences

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Default generation mode: Balanced / Fast / Quality | Prefer balanced behavior, lower latency, or more thorough generation | AI preference key from `OVYXAIStorageKey()` (account-scoped when signed in); selection updates local preference state | The mode influences AI instructions; verify live generation payload |
| Preferred model | Choose Automatic or a provider-specific model override | Same account-scoped local preference key; runtime filters models by provider | Model IDs are provider-specific; invalid provider/model combination falls back to Automatic |
| Preferred provider | Choose Gemini, Claude, DeepSeek, or OpenAI for automatic requests | Same AI preference store; reliability runtime feeds preferred provider into AI service/router and gateway | Code path found; check provider key/connection availability |
| Explain major changes | Add concise explanation preference | Same AI preference store; added to generation instructions | Code path found |
| Preserve existing structure | Prefer editing current project rather than rebuilding | Same AI preference store; added to generation instructions | Code path found |
| Ask before destructive edits | Request confirmation for destructive changes | Same AI preference store; also reflected by legacy `set-ai-safe` toggle in older template | Multiple old/new controls/state pathways exist; verify one authoritative value |
| Project files | Include/exclude project files from generation context | Same AI preference store; runtime removes file context when disabled | Code path found; verify payload |
| Current page | Include/exclude active page/section from context | Same AI preference store; runtime limits current-page context when disabled | Code path found; verify payload |
| GitHub repository | Include/exclude connected repository context | Same AI preference store; context is used only when connected/available | Code path found; verify payload |
| Advanced → Model routing | Automatic / preferred provider first / owner provider priority | Same AI preference store; sent as routing strategy to AI provider code | Code path found; verify each route using traceable requests |
| Advanced → Provider fallback | Automatic / next provider / stop and notify | Same AI preference store; affects generation fallback behavior | Code path found; test provider failure |
| Advanced → Context limits | Automatic / Conservative / Expanded | Same AI preference store; affects context limit logic | Code path found; test a project with enough context to observe result |
| Advanced → Generation budget | Automatic / Efficient / Maximum | Same AI preference store; influences preference payload/instructions | Code path found; verify actual downstream effect |
| **Save AI Preferences** | Save current visible choices | Capture-phase reliability handler saves via `OVYXAIStorageKey()` and updates `window.OVYXAI`; generation bridge uses saved values | Local browser/account-scoped key, not a server API write |
| **Reset AI Preferences** | Remove saved AI preferences and reload defaults | Removes the AI key, then reopens the AI panel | Local only; test the reset values and next generation |

## 9. Privacy

| Visible control / item | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Local-first projects status | Explain local-first project persistence | Read-only status; no toggle/action in this row | Information only, not a sync control |
| Telemetry status | Explain diagnostics are initiated by explicit diagnostic actions | Read-only status; no opt-in switch in this row | Information only, not a telemetry switch |
| **Reset** (Clear appearance data) | Clear appearance preferences | Appearance/theme local-storage reset through Theme Context and legacy Theme Lab | This resets appearance, not all private data |
| **Read** — Privacy Policy | Open privacy policy | `window.openLegal('privacy')` | Handler exists; browser test needed |
| **Read** — Terms of Service | Open terms | `window.openLegal('terms')` | Handler exists; browser test needed |
| **Email** — OVYX Support | Open email client to support address | `mailto:ovyxsupportteam@gmail.com` | External mail client action |

## 10. Security

| Visible control / item | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Authentication/session/last sign-in/account-created status | Show the current account and session details | Read from Firebase Auth metadata/browser | Read-only display; current-session/device data is not a remote device inventory |
| **Sign out current session** | Sign out in this browser | Firebase Auth `signOut()`, route home | Code path found |
| **Log Out All Devices** | Revoke refresh sessions and end this browser session | Authenticated `POST /api/api/auth/revoke-sessions`, then Firebase sign-out after server success | Server action exists; verify API result and other-device behavior with a safe account |
| **Delete account** (Security action) | Permanently delete the OVYX account and server-owned data after confirmation/recent auth | Reliability runtime intercepts `#ovyx-security-delete`; `POST /api/account/delete`, verifies `deleted:true`, then Firebase user delete and local cleanup | Server-backed handler exists; destructive test requires a safe test account |

## 11. Plan

| Visible control / item | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Current plan / active tier | Display the current OVYX tier | `KernelState`/quota state | Read-only status |
| AI usage bar/countdown shown within Plan | Display used tokens and reset countdown | Uses local quota-registry/token info and countdown helper; quota refresh paths also exist elsewhere | Do not treat display alone as proof of live usage; compare with Usage tab/API |
| **Upgrade to Pro** | Open available plans/checkout entry point | `Router.go('pricing')` | Navigation only; payment depends on configured secure checkout |
| Billing history | Show purchase records if present | Read from local `BILLING_KEY` history; no edit control in Settings | Browser-local record is not itself server-verification evidence |
| Token Booster link in older Plan implementation | Go to Pricing and show Booster note | Handler references `#ovyx-token-boost-btn`, which is not in the current Plan renderer | No visible current Plan control by that ID; Booster buying lives in the dedicated panel |

## 12. AI Usage

| Visible control / item | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Monthly token meter | Show used/limit and remaining quota | On opening Usage, authenticated `GET /api/tokens/balance`; result populates `#set-token-meter` and remaining/plan detail | Server-backed read; no manual refresh control in this panel |

## 13. Token Boosters

| Visible control | Intended effect | Persistence / action path | Baseline observation |
|---|---|---|---|
| Extra balance label | Show purchased extra tokens | Authenticated `GET /api/tokens/balance` | Server-backed read; should show sign-in/unavailable states honestly |
| **Refresh balance** | Fetch extra-token balance again | Calls `syncBoosterBalance()` → `GET /api/tokens/balance` | Real request in source; test success, signed-out, and failure cases |
| **Buy Starter Booster** — 100,000 tokens / ₦3,500 | Start a separate token purchase | `OVYXTokenBooster.open('starter')`; authenticated `POST /api/payments/create`, then hosted provider checkout or bank transfer; polls `GET /api/payments/verify?reference=...` and refreshes `/api/tokens/balance` | Tokens are intended to be credited only after provider confirmation and server verification; test with payment sandbox/test account |
| **Buy Builder Booster** — 500,000 tokens / ₦12,000 | Start a separate token purchase | Same server payment/verification flow with `productId: builder` | Same verification requirement |
| **Buy Studio Booster** — 1,500,000 tokens / ₦30,000 | Start a separate token purchase | Same server payment/verification flow with `productId: studio` | Same verification requirement |
| Currency and payment route in purchase modal | Choose NGN/OPay or USD/Paystack route | Modal state; server request selects provider from currency | Must verify provider config and currency/route validation on server; don't infer production readiness from frontend wiring |

## Known overlaps / limits to carry into Stage 2

1. **Appearance has multiple implementations and keys.** The source contains Theme Lab state `ovyx.theme.lab.v1`, older appearance state `ovyx.appearance.v3`, and later canonical Theme Context key `ovyx-theme`. Capture-phase handlers intentionally supersede older listeners. Test Save, Cancel, Reset, custom theme CRUD, import/export, and reload before changing or removing any handler.
2. **Several preference handlers overlap.** Profile save has a legacy listener plus capture-phase server save; notifications are re-rendered from a legacy local-storage panel then intercepted by the account-backed runtime; Workspace state exists in both `ovyx.settings.toggles.v34` and `ovyx.settings.integrity.v83`. Preserve these until the effective browser path is proven.
3. **Email notification switches store preferences only.** Source explicitly says no email is sent without a configured delivery channel.
4. **The Data Layer is not a Postgres provisioning workflow.** The endpoint is saved locally; Test API calls only `<endpoint>/health`; schema download generates a static SQL file; cloud project sync remains the separate existing `ProjectCloudSync` service and is not replaced by this URL.
5. **Plan/billing and quota displays use different sources.** Billing history reads local browser storage; Usage has an authenticated server balance read; compare values before presenting any Plan figure as verified.
6. **Security has two separate account-deletion buttons/handlers** (Profile and Security). Both are intended to call server cleanup, but must be verified separately using safe test accounts.
7. **Two additional dynamic panels were found:** Brand Identity Lock and Universal Connections. They are not among the 13 entries in the current Settings sidebar, so they are recorded as out-of-scope for this 13-category checklist rather than silently counted as navigation categories.

## Test/evidence boundary

- Examined the latest source for the Settings shell, effective late renderers, reliability runtime, Settings regression test, and npm scripts.
- `scripts/ovyx-settings-actions.test.mjs` performs static source assertions and syntax checks and is included in `npm test`; it is not a live browser click-through of all Settings controls.
- The GitHub combined commit-status endpoint returned no status contexts for the frozen SHA. This is **not** evidence that the tests passed.
- A local repository checkout/browser run was not available in this Stage 1 session; no test result is claimed.

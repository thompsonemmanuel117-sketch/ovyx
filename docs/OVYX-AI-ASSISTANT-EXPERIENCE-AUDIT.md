# OVYX AI Assistant — experience audit and implementation record

## Scope

Give the existing OVYX AI Assistant its own full-width routed workspace. This is an experience and navigation upgrade, not a new AI engine and not a replacement for the current assistant. The existing Workspace repair tools route remains separate.

## 1. Scan — existing implementation

### Frontend and navigation
- The live application shell is index.html; functions/_middleware.js appends the versioned production assets to HTML responses.
- The existing Assistant UI is #kernel-brain-bot-panel, originally rendered as a floating aside outside the routed viewport.
- Desktop entry points are #desktop-ai-assistant and #header-ai-project-bot; the mobile account drawer exposes [data-v52-account="ai"]. They call the public WorkspaceBrainBot.toggle() API.
- The app has a separate #view-kernel-bot route for Workspace repair tools. It is not the Assistant and must not be renamed or repurposed.
- The shell contains an older full-screen CSS treatment keyed by data-ovyx-copilot-fullscreen, but it still styles the floating panel. The native Assistant runtime later injects panel geometry through assets/ovyx-assistant-workspace.js; the new page styles therefore need a more specific routed-page selector.
- The native Assistant runtime is loaded by the Pages middleware. Its open wrapper renders the native chrome, binds events, and refreshes project context. The page integration waits for __ovyxNativeOpen before wrapping navigation so it does not race the native lifecycle.

### Existing capabilities to preserve
- Native chat: POST /api/ai/ovyx, conversation ID, bounded message context and three response modes (fast, balanced, quality).
- Firebase-authenticated requests, server-side quota reservation/finalization and failure refunds.
- Cloudflare Workers AI-only inference boundary; the native route does not accept browser-selected external provider/model overrides.
- Firestore persistence under the signed-in user's aiConversations path.
- Workspace context scanning and authenticated project tools through POST /api/ai/workspace-tools.
- Read-only project inspection/search/diagnostics; source edits are previewed, require explicit confirmation, use revision preconditions, keep backups and verify the saved source by reading it back.
- Up to six staged attachments, bounded text extraction, secret-like text redaction, retry attachment retention, response copy/feedback/retry actions, export/new-chat menu actions and project navigation.
- The existing view-kernel-bot repair console, Web Studio, App Studio, Firebase authentication, dashboard navigation and bottom-navigation authority.

## 2. Find problems and gaps

1. There is no dedicated view-ai-assistant route in the shell. The existing Assistant is a floating panel.
2. The older full-screen CSS and later native runtime geometry have different layout owners. A full-screen data attribute alone does not establish a full-screen routed page.
3. The Assistant's saved Firestore turns have a write path, but the API tree has no conversation-list/read endpoint. The in-memory conversation history is bounded to the current browser session. Do not show a fake history sidebar or claim that persisted conversations can currently be browsed/resumed.
4. The existing Assistant route actions and panel are deeply referenced by IDs and public APIs. Cloning the panel would duplicate event handlers, state and chat surfaces.

## 3. Trace connections

| Area | Existing connection | Boundary |
|---|---|---|
| Identity | Firebase-authenticated user from middleware | No client-supplied owner identity |
| Ordinary chat | POST /api/ai/ovyx | Authenticated, bounded request |
| Model routing | Cloudflare Workers AI native helper | Keep Cloudflare-only boundary |
| Usage | beginAIQuota / finalizeAIQuota / refund | UI must not bypass quota |
| Conversation persistence | saveChatTurn in functions/_lib/chat-history.js | Writes user-scoped Firestore records |
| Workspace tools | POST /api/ai/workspace-tools | Owner-scoped reads and approved revision-checked writes |
| Feedback | POST /api/ai/feedback | Same-origin, authenticated metadata only |
| Navigation | WorkspaceBrainBot.open/close/toggle, Router.go | Preserve public entry points; route changes close the panel cleanly |

## 4. Research and product decisions

Research reviewed:
- Vercel AI SDK's Chatbot guide documents explicit submitted/streaming/ready/error states, message streaming, and tool-aware message parts. OVYX already has activity stages and tool outcomes; the page should expose those clearly rather than invent a second activity model.
- OpenAI's Conversation State guide describes durable conversation identifiers spanning sessions/devices and conversation items including messages and tool calls/results. OVYX currently writes turns but has no read/list endpoint, so a conversation history rail is deferred until that backend contract exists.
- OpenAI's UI guidelines recommend fullscreen for work that benefits from more space and keeping the conversational composer available during fullscreen work. This supports a dedicated Assistant workspace with the existing composer and context/actions retained.

Sources:
- https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/02-chatbot.mdx
- https://developers.openai.com/api/docs/guides/conversation-state?api-mode=responses
- https://developers.openai.com/plugins/concepts/ui-guidelines

Implementation decisions:
- Create a real view-ai-assistant route inside the existing routed viewport.
- Reparent the one existing Assistant panel into that route. Do not clone or rewrite the chat runtime.
- Route all current desktop/header/mobile Assistant entry points through the same public API.
- Closing returns to the route from which the user opened the Assistant. Navigating elsewhere while the Assistant is open closes it without stealing the new destination.
- Keep the current repair-tools page separate.
- Use a full-width black-glass surface with the existing OVYX gold/silver palette, responsive transcript/composer geometry, keyboard focus states, safe-area spacing and reduced-motion support.
- Do not change the AI model, provider boundary, Firebase auth, quota accounting, Firestore data, project tools, Web Studio or App Studio.

## 5. Verification plan

- Static contract: route exists, one panel is reused, middleware loads page assets, CSS overrides floating geometry, and native API boundaries remain untouched.
- Browser regression at desktop and mobile sizes: open from existing entry points, assert route and full-width/full-height geometry, verify mobile dashboard dock is hidden, close to the prior route and verify the dock returns.
- Existing Assistant workspace browser, menu, native AI, workspace tools, feedback, dashboard navigation and full test suite.
- Run build/static verification and all required GitHub Actions on the exact latest commit. Merge only after every required check passes; verify the merge on main.

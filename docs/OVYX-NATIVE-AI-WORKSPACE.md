# OVYX AI workspace: native assistant mode

The chat in the OVYX AI workspace uses the authenticated first-party endpoint at **/api/ai/ovyx**. It does not use the existing multi-provider callModel router, does not read a user's Universal Connection selection, and does not require Gemini, OpenAI, Anthropic, or DeepSeek API keys.

## What is native today

The route resolves supported workspace commands inside OVYX. It can answer questions from the current workspace snapshot, report the active project's pages/files/assets and known connection status, run the existing workspace diagnostics, open approved OVYX routes and project panels, and hand a website prompt to Web Studio for review. Actions are allowlisted, project access is checked against the current user's visible project list, and results are not described as successful unless OVYX confirms them.

The assistant-context helper limits context size, shares only connection metadata (never saved connection credentials), and redacts obvious private-key, API-key, password, token, and bearer-token patterns from project source snippets before they enter model context. Context is scoped to the authenticated workspace. This is a practical defensive filter, not a substitute for keeping secrets out of source files.

Web Studio's website-generation pipeline remains separate. That prevents changing the workspace assistant from accidentally breaking the existing website builder. The workspace chat itself does not send messages through Web Studio's external-provider route.

## Enable open-ended answers without provider API keys

Native workspace commands work without a model binding. For free-form reasoning and broader OVYX product questions, configure Cloudflare Workers AI for the Pages project:

1. Open **Cloudflare Dashboard → Workers & Pages → the OVYX Pages project**.
2. Open **Settings → Bindings** in the **Production** environment.
3. Choose **Add binding → Workers AI** and use the binding name **AI**.
4. Save and redeploy the Pages project.

The route calls the model through **context.env.AI.run(...)** and defaults to **@cf/meta/llama-3.3-70b-instruct-fp8-fast**. To change the model, set the **OVYX_NATIVE_AI_MODEL** Pages environment variable to a supported model identifier and redeploy.

A binding is not an API key, and the workspace assistant does not fall through to third-party provider keys when native inference is unavailable. Without the binding, deterministic workspace commands still work and unsupported questions receive an honest limited-mode response. Cloudflare Workers AI model use may incur charges to the Cloudflare account; “no provider API key” does not mean unlimited inference is free.

## Workspace controls

The assistant's secondary actions are grouped in the three-dot menu: new chat, workspace navigation, preview/history/assets/sections, context refresh, workspace scan, diagnostics, quick active-file review, dependency summary, and recovery availability. Conversation history is kept in session storage for the signed-in browser session. “New chat” clears this conversation only; it does not delete projects or files.

The assistant permits only known OVYX actions. Arbitrary browser clicks, destructive changes, account/billing operations, or deployments are not executed merely because a generated message asks for them. Add new operations by implementing and testing a specific allowlisted command with server-side permission checks, not by exposing a general-purpose click primitive.

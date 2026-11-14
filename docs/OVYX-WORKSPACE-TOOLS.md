# OVYX Workspace Tools — Stage 2

The native workspace assistant can now query the signed-in user's saved project data through `POST /api/ai/workspace-tools`. This endpoint is separate from Web Studio's site-generation and multi-page build endpoints.

## Available operations

- `read_file`: read the actual saved source for one exact existing file path, with secret-like values redacted and an explicit `contentComplete` flag; partial or redacted content is not eligible for automatic editing.
- `list_revisions`: list owner-scoped saved versions created by the assistant's source editor.
- `prepare_restore` and `restore_revision`: preview a saved version before restore, require explicit approval plus a current project revision, preserve the replaced file, and verify the restored source by reading it back.
- The native assistant may request bounded read-only tool calls (`inspect`, `read_file`, `search`, `diagnose`) and consumes the authenticated results before writing a final evidence-based answer. The browser limits repeated tools and total read-only calls per request.

- `snapshot`: read the authenticated account's project inventory and (when selected) a summary of its saved pages, source-file paths and bounded, redacted source snippets.
- `list_projects`: return the signed-in owner's saved project inventory.
- `inspect`: return an owned project's saved source/page summary and static diagnostics.
- `diagnose`: run non-destructive static checks for duplicate page slugs, malformed `package.json`, missing HTML roots/closing tags, repeated IDs and missing project source data.
- `search`: search readable text source files in the selected owned project.
- `prepare_patch`: preview one replacement for an existing source file. It does not write.
- `apply_patch`: apply the approved replacement only if the browser supplies explicit confirmation and the project revision still matches the preview. The server saves a separate copy of the original source, writes with a Firestore update-time precondition, reloads the project and verifies the stored content.

## Guardrails

Every request requires the current Firebase-authenticated account. The server derives the project document from the signed-in email and checks both stored owner UID and owner email before returning private data or writing a patch. Browser-supplied owner IDs do not establish ownership.

The endpoint will not create a guessed path or edit secret/config paths such as `.env`, private keys, or credentials. Read-only source inspection redacts detected secret-like values; the AI cannot mark redacted or truncated source as edit-ready. Replacement content is size-limited. Each write is tied to the project's update-time captured by the preview, preventing a stale proposal from overwriting a newer save. On conflict, the user must refresh and preview again.

A successful response verifies that Firestore reads back the requested file content. This is a storage-integrity check, not proof that the website executed in a browser or that its runtime behaviour was tested.

## Web Studio separation

Stage 2 does not change `functions/api/ai/assistant.js`, the site-generation prompts, multi-page build logic, `functions/api/generate.js`, or the website generation flow. The native assistant uses its own endpoint and only proposes an edit when it has a concrete existing source path. The user sees a change preview and must accept it; cancellation leaves the saved project unchanged.

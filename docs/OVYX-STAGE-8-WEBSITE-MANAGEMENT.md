# OVYX Stage 8 — Website Management

## Delivered scope

The Website Management panel is loaded by the existing Pages middleware and appears inside Web Studio for an active project. It reuses the existing authenticated project list, project media store, Web Studio source graph, and Publishing Centre instead of introducing a parallel project or deployment system.

- **My Websites:** searches the signed-in user's existing saved project list. Project opening remains in the existing Projects workspace.
- **Content:** lists the current project's HTML, Markdown and JSON files and hands editing to the existing visual editor / Code workspace.
- **Media:** lists, previews, uploads and copies links for images through the existing authenticated `OVYXAssetStore`.
- **Website Settings:** stores SEO title, description and language metadata on the owned project. The UI explicitly does not claim that stored metadata has been injected into published HTML.
- **Publishing:** opens the existing Publishing Centre for previews, releases, domain management and rollback.
- **Backups:** stores owner-isolated, versioned project snapshots in Firestore; creates an automatic snapshot before settings changes and restores; creates a safety snapshot before a restore; uses optimistic update-time checks; rejects oversized snapshots without changing the project; retains the newest 20 backups.
- **Analytics:** explicitly reports that verified visitor analytics are not connected. No traffic counts or performance scores are fabricated.

## Safety boundaries

All management API calls require the existing Firebase-authenticated identity and verify both UID and email ownership of the selected project. Backup reads and restores verify the same owner and project ID. Writes use Firestore update-time preconditions. The feature does not touch Cloudflare environment variables, publishing credentials, Firebase authentication configuration, AI routing, or existing production deployments.

A backup that exceeds the safe Firestore document budget is rejected before a change. Users are directed to export a project ZIP instead. This is safer than truncating a project snapshot or silently storing an incomplete backup.

## Acceptance

Run `npm test`, `npm run validate`, `npm run build` and `npm run check` in CI. Browser acceptance should verify the panel in Web Studio, project search, media upload/listing, settings save, manual backup, automatic backup before settings update, restore confirmation and post-restore project reload. Analytics must remain an explicit unavailable state until a real visitor event source is implemented and privacy-reviewed.

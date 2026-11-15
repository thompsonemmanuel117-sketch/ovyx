# OVYX App Studio experience audit

## Scope and safety boundary

This audit covers the existing App Studio journey and its visible copy, layout, theme behaviour, accessibility, browser integration and service boundaries. It is a presentation and workflow simplification: no generation provider, API contract, Firebase rule, project persistence path, publishing route, mobile-build pipeline or Web Studio editor is replaced.

The existing Web Studio-to-mobile conversion route remains available in its progressive-disclosure section. The OVYX logo and global navigation are not changed.

## Existing implementation scanned

| Area | Existing source | Responsibility |
| --- | --- | --- |
| Workspace overview | `assets/ovyx-app-studio-workspace.js` | Project state, section metadata, Projects navigation, copy summary and disclosure actions |
| Guided flow | `assets/ovyx-app-studio-premium-polish.js` | Analyze / Build / Verify / Release progress, Brand Identity and detailed-report disclosures |
| Appearance | `assets/ovyx-app-studio-visual-refresh.js` | Theme tokens, responsive layout, compact spacing and motion |
| Website analysis | `assets/ovyx-app-studio-url-analyzer.js` | Public URL form, report rendering and detected-brand transfer |
| Brand identity | `assets/ovyx-app-studio-brand-dna.js` | Per-app logo, colours, design rules and saved identity |
| App creation and release | `assets/ovyx-app-studio-link-builder.js` | Existing AI generation, sandboxed preview, Project Brain, project save, export, Cloudflare release and mobile builds |
| Dependency checks | `assets/ovyx-app-studio-project-brain.js` | Source graph, links, file dependencies, control evidence and live-preview probe |
| Server routes | `functions/api/app-studio/*`, `functions/api/ai/gateway.js`, `functions/api/projects.js`, `functions/api/deploy.js`, `functions/api/deployment-status.js`, `functions/api/mobile/build/*` | Authenticated analysis, identity, AI routing, project storage, deployment and EAS status |

The real HTML shell loads these feature runtimes through `functions/_middleware.js`. Their browser and source tests are wired into the repository's existing test workflow.

## Findings

1. **Duplicate navigation:** the workspace overview rendered its own Analyze / Build / Verify / Release section buttons while the hero already presented the same four-step flow. This created two competing navigation systems.
2. **Unequal action priority:** Expand, Collapse and Copy summary appeared alongside Open Projects as if they were equally important everyday actions.
3. **Release overload:** mobile build setup, platform selection, icon upload, status refresh and downloads were always visible beside the more common web export and publish actions.
4. **Copy density:** several labels and descriptions used long or technical phrasing where a short instruction would help users understand the next action. Some initial states also described implementation details before the user needed them.
5. **Theme precedence:** multiple runtime styles are layered over the shared theme. Primary actions need a deliberately controlled foreground/background pair; secondary controls and fields should follow the active Appearance tokens.
6. **Bottom spacing:** the previous 22px App Studio bottom inset was larger than needed for the page's final content and safe-area handling.
7. **Preserved advanced features:** Brand Identity, detailed scan evidence, Project Brain findings, source files and Web Studio conversion are useful but not required on every visit. They should stay available through clear disclosures, not be deleted.

## Connection trace — preserved

- **Analysis:** the signed-in Firebase user obtains an ID token; `POST /api/app-studio/url-analyzer` enforces same-origin, authentication and the server-side `appStudio` entitlement before calling the safe public-website analyzer.
- **Brand identity:** the Brand DNA runtime scopes the request to App Studio, uses the verified Firebase token and reads/writes the per-account Firestore profile through `/api/app-studio/brand-profile`. The server validates ownership and normalizes colours, rules and logo data.
- **Generation:** the builder consumes the analyzer's structured report and calls the existing `OVYXAIService.generate` App Studio mode through `/api/ai/gateway`. It does not introduce another provider or inference route.
- **Preview and checks:** generated files stay in a sandboxed iframe. The preview bridge uses a fixed read-only API allowlist and asks before account reads. Project Brain inspects the actual source and preview; generated arbitrary network calls remain restricted.
- **Project save:** the existing authenticated `POST /api/projects` route saves the project source to OVYX Projects. The UI reports cloud-save success only after the API confirms the saved project. Preview form data remains local and is not represented as cloud-synced.
- **Web release:** preview and production actions continue through `/api/deploy`, status through `/api/deployment-status`, and public health through `/api/app-studio/release-health`. Publishing still requires user confirmation and completed runtime checks.
- **Mobile release:** Android/iOS builds and refreshes continue through the existing `/api/mobile/build` and `/api/mobile/build/status` routes. EAS configuration and server-side entitlements remain authoritative.

No backend or authentication changes are part of this redesign.

## Improvement plan and implementation

- Keep one primary Analyze → Build → Verify → Release navigator in the hero.
- Turn the first workspace card into a compact project-status overview. Keep Open Projects visible; move Expand, Collapse and Copy summary into a native **More actions** disclosure.
- Keep the mobile build workflow and every existing control, but place its optional setup behind **Build for Android or iOS**.
- Keep Brand Identity, the detailed inspection report, source files and Project Brain details available through progressive disclosure.
- Clarify the copy for website analysis, app creation, saving, quality checks, publishing and mobile builds.
- Keep primary action text on a high-contrast gold/dark-ink pair even when a user switches Appearance themes. Let secondary controls, fields and panel surfaces follow theme tokens.
- Use clear focus indicators, readable control heights, responsive wrapping, safe-area-aware spacing and reduced-motion support.

## Accessibility and interaction references

- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) — text contrast, visible focus, focus not obscured and minimum target size.
- [GOV.UK Design System: Details](https://design-system.service.gov.uk/components/details/) — use disclosures for information and controls that only some users need; do not hide the primary path.
- [GOV.UK Accessibility Strategy](https://design-system.service.gov.uk/accessibility/accessibility-strategy/) — semantic HTML and progressive enhancement.

## Regression coverage

The change extends the existing App Studio source and browser tests. Verification covers the single guided navigator, retained Projects action, More actions disclosure, expand/collapse/copy behaviour, truthful saved/verified/release state, late-mounted sections, mobile overflow, reduced motion, theme contrast, mobile build disclosure and the existing analyzer/generator/project/release integration tests.

The broader OVYX UX-writing programme should continue feature by feature after this App Studio pass; this document records the App Studio copy surfaces changed here rather than claiming that every page in the platform has already been rewritten.

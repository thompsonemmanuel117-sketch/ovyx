# OVYX Premium Platform Experience

## Scope
A presentation-only upgrade to the OVYX platform shell and routed workspace pages. It intentionally excludes Web Studio and does not replace the shared design system or motion coordinator.

## Sign-in
The existing `#view-master-auth` page receives a wider editorial layout, refined glass card, more legible fields and polished responsive spacing. The existing OVYX sign-in lockup/diamond, Firebase authentication handlers, password controls, OAuth buttons, account activation and route guards remain owned by the existing application.

## Platform pages
Existing routed platform sections (except Web Studio and the dedicated sign-in view) receive full-width page foundations, improved component surfaces, consistent control transitions and visible keyboard focus. Existing page components continue to own their layout, state, data and interactions.

## Motion and navigation architecture

- The existing platform motion coordinator remains the single owner of routed-view entrance motion. It uses short opacity/transform transitions, listens to the existing `ovyx:view-changed` signal and disables entrance motion when the user requests reduced motion.
- Native View Transitions are intentionally not enabled by this presentation-only layer. The existing view-change signal is emitted as part of the current route lifecycle; a native transition needs a pre-change integration point around the actual `switchView()` mutation, feature detection, cancellation handling and fallback coverage. Adding a second transition path here would risk double animation or route-state timing regressions.
- Revisit native View Transitions in a dedicated router integration change after the existing navigation lifecycle has explicit before/after hooks and desktop/mobile navigation tests. Until then, the current coordinator provides the compatible fallback.

## Safety boundaries
- No edits to `index.html`, the OVYX brand mark, Web Studio assets or Web Studio runtime.
- No Firebase auth, profile schema, permissions, AI routing, provider keys, data models or backend behavior changes.
- No global element resets or new dependencies.
- Honors reduced-motion preferences.
- CSS is imported by the existing shared platform design-system stylesheet; the Cloudflare middleware remains unchanged.

## Verification
- `scripts/ovyx-premium-experience.test.mjs`: source contract for scope, brand/auth boundaries, middleware loading and npm test registration.
- `scripts/ovyx-premium-experience.browser.test.mjs`: desktop/mobile checks for page width, Web Studio exclusion boundary, sign-in layout and retained auth controls.

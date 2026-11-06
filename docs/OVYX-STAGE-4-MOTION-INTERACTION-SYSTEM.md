# OVYX Stage 4 — Motion and Interaction System

## Goal
A restrained, consistent interaction language for platform pages that feels responsive and premium without slowing work or changing existing product behavior.

## Motion language
- Instant: 80ms for immediate state acknowledgement.
- Micro: 140ms for press/focus feedback.
- Standard: 220ms for page and dialog entrances.
- Emphasis: 320ms for larger, intentional transitions.
- Shared easing: `cubic-bezier(.2,.75,.25,1)`; entrances use a gentle deceleration curve.
- Prefer opacity and transform; do not animate layout geometry or introduce perpetual decorative motion.

## Runtime
- The shared motion stylesheet and coordinator are installed through the existing Pages middleware.
- The coordinator observes existing view visibility and the existing `ovyx:view-changed` event; it does not replace or wrap `switchView()`.
- Only the newly active non-Web-Studio view receives the entrance class. The observer coalesces updates with requestAnimationFrame.
- Existing toast and account-notification implementations remain the source of truth; this stage does not create a second notification system.
- Dialog entrance styling is limited to visible native/dialog-role surfaces; no open/close state is changed by this layer.

## Accessibility and performance
- Reduced-motion preference disables entrance animation and reduces interaction transitions.
- Focus-visible rings use the Stage 3 focus token.
- No automatic focus stealing, delayed navigation, or synthetic success state.
- Animations use compositor-friendly opacity/transform only and are not run continuously.
- Touch users retain normal click/tap behavior; active feedback is subtle.

## Preservation boundaries
- `#view-webstudio` and body state `.ovyx-webstudio-active` are explicit no-touch boundaries.
- OVYX brand assets, logo, Firebase, auth, feature gates, route state, `switchView()`, backend, AI routing, and existing notification APIs are unchanged.
- Existing toast/notification stacks are preserved and continue to own their real operation feedback.

## Verification
The Stage 4 contract test checks tokens, reduced-motion handling, focus-visible support, route event coordination, Web Studio exclusion, middleware loading, and inclusion in the full npm test chain. A dedicated Chromium test exercises initial and subsequent page transitions, keyboard focus, reduced-motion behavior, and the Web Studio no-touch boundary. Existing desktop/mobile browser workflows continue to cover platform navigation and settings regressions.

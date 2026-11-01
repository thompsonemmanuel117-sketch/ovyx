# OVYX Stage 2 — Complete website experience

## Goal

Make multi-page website generation consistently deliver complete, coherent, responsive and polished websites with purposeful motion, shared components, clear navigation and working interactions. This stage upgrades the existing Website Engine and multi-page pipeline; it does not rebuild the OVYX dashboard or replace the existing page planner.

## Existing foundations retained

- Unified Website Engine and requirement manifest.
- Multi-page sitemap planning, explicit-route reconciliation and page ceilings.
- Per-page blueprints, shared design-system planning and component contracts.
- Bounded file-by-file generation batches with shared context.
- Route-collision detection, website integrity checks and generated-site acceptance tooling.
- Static quality checks and browser-quality workflows.

## Stage 2 improvements

- Expanded the design-system motion contract into a shared choreography covering page entry, section reveals, navigation transitions, micro-interactions, workflow feedback and one purpose-led signature moment.
- Added shared timing/easing guidance, performance constraints and accessibility requirements for every motion pattern.
- Added per-page motion choreography and shared motion timing tokens to the multi-page sitemap contract and normalized build context so later page batches can follow the same motion language.
- Updated the sitemap planning and page implementation prompts to request genuinely page-specific layouts, coherent route transitions, responsive reflow and non-blocking motion.
- Added regression tests to ensure motion choreography and timing tokens survive sitemap normalization and batch-context construction.

## Motion quality rules

- Use a coherent, brief-aware motion language rather than unrelated decorative effects.
- Prefer transform and opacity; avoid layout-thrashing and permanent will-change.
- Use one-shot, meaningful scroll reveals; essential content is visible even if JavaScript fails.
- Keep route transitions short, interruptible and consistent with browser history and focus.
- Use tactile feedback for hover, focus, press and selection without making hover essential.
- Honor prefers-reduced-motion with a complete static alternative.
- Avoid flashing, aggressive parallax, perpetual decoration and animation that delays first paint.

## Verification boundary

These changes improve planning instructions and the information passed to the generation model. They do not by themselves prove that every newly generated site renders correctly or that every model-generated interaction works. Generated websites still require isolated browser execution, responsive screenshot review and interaction testing. Live integrations remain separately verified.

## Automated checks

Run:
```sh
node scripts/ovyx-design-system-contract.test.mjs
node scripts/multi-page-build.test.mjs
node scripts/studio-multipage.test.mjs
node scripts/ovyx-website-engine.test.mjs
npm test
npm run validate
npm run build
```

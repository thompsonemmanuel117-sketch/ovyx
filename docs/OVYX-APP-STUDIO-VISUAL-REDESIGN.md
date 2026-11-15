# OVYX App Studio visual redesign

## Intent

Make the existing App Studio feel calm, premium and easy to understand without removing or replacing any capability. This is a presentation-only layer on top of the already audited App Studio runtimes.

## What changes visually

- A more compact hero with one clear headline and a single short explanation.
- Shorter stage hints: Website, Create, Quality and Launch.
- A cleaner four-step navigation with a strong current-stage state.
- A compact workspace overview with clearer project, quality, save and release status.
- Consistent surfaces, spacing, borders, buttons, fields, focus states and responsive layouts.
- A stable high-contrast gold primary action treatment while panel surfaces and text follow the active Appearance theme.
- Less bottom padding and no horizontal overflow on narrow mobile screens.
- Reduced-motion support.

## What remains

The existing Analyze, Build, Verify and Release sections remain mounted in their original order. Brand Identity, detailed analysis, source files, Project Brain, publishing, export, Android/iOS build controls, Web Studio conversion, and all existing buttons and service integrations remain untouched. The OVYX logo, Firebase authentication, AI gateway, project save route, deployment routes and Web Studio editor/preview are not modified.

The runtime does not hide or delete feature panels, rewrite saved theme values, or change API calls. It only adjusts visible copy in the hero and applies scoped presentation styles.

## Verification

- Static contract checks ensure the new layer loads after existing App Studio runtimes and is included in the main test suite.
- Browser checks cover all four stage links, all four primary panels, advanced disclosures, light-theme contrast, preserved colour input, responsive 360px layout, compact bottom spacing and no browser exceptions.
- The existing App Studio and platform regression workflows continue to run.

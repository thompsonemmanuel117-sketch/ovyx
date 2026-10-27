# OVYX Stage 6 — Website and coding capabilities

## What the repository already had

Stage 6 builds on the existing implementation rather than replacing it:

- Web Studio has a quality inspector in `assets/ovyx-webstudio-quality.js`. It runs source checks, local page/asset reference checks, multiple viewport checks (320, 390, 768, 1024 and 1440 px), isolated-browser runtime checks, accessibility signals, performance samples and conservative interaction probes.
- The quality inspector executes generated website scripts in an iframe sandbox with scripts allowed but network connections, form submissions, external frames and embedded objects blocked.
- The artifact evaluator in `scripts/ovyx-webstudio-evaluation-runner.mjs` checks generated website files, local links/fragments, resources, responsive source evidence, placeholders and likely secret exposure. Its own contract correctly labels runtime and integration behaviour as unverified unless actually tested.
- The authenticated workspace tools provide owner-scoped inspection/search/reads, source diagnostics, and approved edit/restore flows with backups and read-back verification.
- The Web Studio generation/build path already has source checks and a quality gate.

The main gap was the native assistant: it could inspect project files but had no registered tool to run the existing Web Studio quality inspector and use its real report.

## What this stage adds

- A project-scoped `workspace_quality_check` action to the native assistant's strict action allowlist.
- A bridge from the native assistant into the existing `window.OVYXWebStudioQuality.run()` inspector. It opens Web Studio if needed, waits a bounded period for the inspector, and does not silently test a different active project.
- Report identity verification: the report must name the exact requested project before it can be passed back to the model.
- A bounded, secret-redacted report containing status, source-check findings, viewport coverage, safe interaction samples, runtime errors, and limitations. Source file contents are not attached to this report.
- Editor dirty-state disclosure so the assistant can say whether it appears to have tested unsaved edits, saved state, or an unknown state.
- A bounded agent loop feeds the actual report back to the model, so the final answer can summarize evidence instead of just repeating model-generated claims.
- Regression tests for the action allowlist, project identity, inspector connection, sandbox boundaries, evaluator findings, and the distinction between static evidence and verified browser behaviour.

## Safety boundaries

- The quality action is read-only: it does not write, repair, publish, deploy, submit forms, purchase anything, or authenticate to third-party services.
- Existing source edits still require a reviewable preview and explicit user approval. Existing server-side ownership, revision checks, backups and read-back verification remain in place.
- Quality report text is bounded and credential-like strings are redacted before it is fed to the model. Raw project source is not included in the report.
- Browser checks run against the current active Web Studio project. If the active project does not match the requested project, or the report identity does not match, OVYX rejects the report rather than claiming it tested the requested project.
- A completed report is not necessarily a passing report. The report may contain failures or warnings. The assistant must report those honestly.
- Isolated browser testing cannot prove external link availability, external asset reachability, form delivery, payments, authentication, API integrations, or production deployment. Those remain explicitly unverified unless separately tested with a safe live integration test.

## Automated checks

Run with the repository's supported Node.js version (22 or newer):

```sh
npm test
npm run validate
npm run build
```

The Stage 6 contract test is registered in `npm test`. The existing artifact evaluator tests also remain part of the suite. Automated results should be read from the pull request's actual CI runs; do not infer a pass from the existence of this document or test code.

## Manual acceptance checklist

Use a disposable or non-production website project first. Avoid putting real credentials into test files.

1. **Create a real site:** Generate a small website in Web Studio with Home, About, and Contact pages, local CSS, one local image/SVG, and a navigation menu. Save it and confirm the project remains editable.
2. **Ask OVYX AI to verify it:** Ask, “Run a full quality check on my active Web Studio project. Tell me what passed, what failed, what was skipped, and what still needs live testing.” Confirm it opens/uses Web Studio's quality inspector and returns a real report.
3. **Responsive checks:** Confirm the report lists completed viewport checks at the supported widths and names any overflow, timeout, runtime error, or skipped viewport. An incomplete browser matrix must not be described as a pass.
4. **Broken local link:** In the disposable project, add a link to a missing page or fragment. Run the check and confirm the report identifies it. Fix it, rerun, and compare the actual report.
5. **Missing asset:** Change one local CSS/image/script reference to a nonexistent path. Confirm the source report flags it. Restore the correct path afterward.
6. **Interaction testing:** Add a harmless button or menu control with a local, non-destructive response. Confirm the report says how many safe interactions were tested/responded/skipped. If the inspector declines a control as unsafe or cannot verify it, that must be disclosed—not counted as passed.
7. **Runtime error:** On the disposable project only, introduce a harmless JavaScript error and rerun. Confirm the browser report records the runtime error. Remove it and rerun.
8. **Unsaved changes:** Make a visible edit without saving, then run the check. Confirm the result discloses the editor's dirty state when that state is available. Save and rerun to confirm the state is updated.
9. **Wrong project guard:** Open Project A, then request a check for Project B without opening B. Confirm the assistant refuses to use Project A's report as evidence for B.
10. **No surprise writes:** Request a quality check on a project with a known issue. Confirm the check does not modify source. If a repair is proposed afterward, it must still show a separate preview and wait for your approval.
11. **Secret protection:** If necessary, use a dummy credential-like string in a disposable source file. Confirm reports do not echo its value. Remove the dummy value immediately after testing.
12. **Live integrations:** Treat external URLs, remote assets, forms, login, payments, API calls and deployment as unverified by the sandbox. Verify those separately only in a safe test environment with test accounts and non-production credentials.

Mark each item passed only after actually performing it. Record the browser, device, project, report status and any skipped checks.

## Completion criteria

- `npm test`, `npm run validate`, and `npm run build` pass in CI.
- The native assistant invokes the actual Web Studio quality inspector for the exact active project and consumes its returned report.
- Static code checks, browser checks, safe interaction sampling, and live integrations are described as separate kinds of evidence.
- Broken local links/assets, responsive issues and runtime errors are detected in real generated project tests.
- The wrong-project guard, report redaction, read-only quality action and existing approval-protected repair path pass acceptance checks.
- Any unavailable external integration or incomplete browser coverage is reported as unverified, not passed.

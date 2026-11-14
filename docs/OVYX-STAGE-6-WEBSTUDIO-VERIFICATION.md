# OVYX Stage 6 — Website and coding verification

## Goal

Make Web Studio's actual saved/generated files—not a model's statement that a site is finished—the source of truth for readiness.

## Audit findings: existing functionality retained

OVYX already has significant Stage 6 infrastructure:

- Single-page and multi-page generation validate file paths, generated file structure, requested-page/feature contracts, and website integrity before returning output.
- The source integrity audit checks local navigation and fragment targets, local assets and responsive image sources, duplicate IDs, form labels, and invalid ARIA references.
- The Web Studio quality inspector reads the active project's real source graph, renders the supplied generated HTML and included local CSS/JavaScript in an isolated sandbox, checks responsive widths of 320, 390, 768, 1024 and 1440 pixels, collects runtime errors/overflow, measures selected accessibility/performance signals, and smoke-tests a bounded sample of safe interactive controls.
- The automatic post-build gate captures the last known project snapshot, runs the quality inspection, attempts at most one bounded targeted repair, and restores the previous state when the quality gate remains failed.
- Standalone evaluation and generated-site acceptance tools distinguish source-level checks from browser evidence, human visual/editorial review, and genuine external integration verification.

These existing components are deliberately reused. Stage 6 does not replace the website generator or weaken its existing checks.

## Stage 6 addition

The isolated Web Studio browser quality inspection now probes **native HTML form constraints** on a bounded sample of forms at the mobile interaction viewport.

- It temporarily introduces an invalid state into a required field or an email/URL field, calls the browser's form validity check, and restores the field state immediately.
- It never calls `form.submit()` or `form.requestSubmit()`, never dispatches a submit event, and never sends a test enquiry.
- The preview remains sandboxed, with external connections and form actions disabled by Content Security Policy.
- A report distinguishes native constraint checks from untested custom JavaScript validation and actual form delivery. No form-delivery success is inferred.
- The new Stage 6 contract test is registered in `npm test`.

## Automated checks

Run the project's normal commands in the existing Node.js environment (Node 22 or newer):

```sh
npm test
npm run validate
npm run build
```

The Stage 6 test is `scripts/ovyx-stage6-webstudio-verification.test.mjs`. Existing generated-site tools remain available:

```sh
node scripts/ovyx-webstudio-evaluation-runner.mjs --root <exported-site-artifact-folder> --out <report.json>
node scripts/ovyx-webstudio-acceptance-audit.mjs <generated-sites-folder> <browser-report.json> <acceptance-report.json>
```

Use real generated/exported artifacts in the acceptance run. Missing artifacts or missing browser reports are not a pass.

## Manual Stage 6 acceptance checklist

Test the deployed version containing the Stage 6 change. Use a disposable project for deliberate failures.

1. **Build a real site:** In Web Studio, generate a small multi-page site that has at least Home and Contact pages, a local CSS file, a local JavaScript file, a navigation menu, a required name/email form, and one safe tab or disclosure. Wait for the post-build verification to finish.
2. **Source validation:** Confirm OVYX reports checks from the saved project files. Introduce a deliberate syntax/structure issue in a disposable build and check that validation flags it instead of trusting the model's completion statement.
3. **Responsive layouts:** Run the Web Studio quality inspector. Confirm the report lists widths 320, 390, 768, 1024 and 1440 pixels and reports any overflow/runtime errors for the routes it actually tested.
4. **Links and assets:** In a disposable project, temporarily replace an internal route, fragment target, or local stylesheet/image path with a missing path. Run the inspection and confirm it reports the actual broken reference. Restore the path afterward.
5. **Safe controls:** Check that the inspector clicks an eligible menu/tab/disclosure/filter only in its isolated preview and reports whether the DOM/page state responded. This is a bounded smoke sample, not proof every control works.
6. **Form constraint test:** Use an HTML form with `required` and `type="email"`. Confirm the quality report shows a native form-validation smoke check and invalid required/email state is blocked. Confirm the fields are restored and that no form submit was triggered or real enquiry sent.
7. **Custom validation boundary:** If a form uses `novalidate` or only custom JavaScript validation, confirm the report says that path needs manual review instead of claiming it passed.
8. **Preview and repair rollback:** Open the actual generated preview and inspect the affected routes. For a disposable project, create a safe defect and let the one bounded repair run. If the gate still fails, verify that OVYX reports the failure and restores the previous project snapshot instead of promoting the unverified build.
9. **Targeted edit preservation:** Ask Web Studio to change one thing on an existing multi-page site. Confirm unrelated pages/routes and existing navigation remain intact, then rerun the quality inspector.
10. **Real integrations:** Test contact delivery, authentication, bookings, payments, and database persistence separately against authorized test endpoints/accounts. The isolated preview blocks network access, so a sandbox check cannot prove external delivery. Never use a live customer or payment flow as a QA submission.
11. **Evidence:** Save/export the quality report and any generated-site acceptance report. Note the tested project, date, tested routes/widths, failed checks, and whether each result came from static source analysis, the isolated browser, or a real integration. Do not include secrets or private form values.

## Completion rule

Stage 6 is ready for acceptance only when automated tests, validation, and build pass; the deployed Web Studio quality gate is exercised on real generated output; all relevant route, responsive, source, and interaction findings are resolved or explicitly recorded as not tested; and no report claims a real integration succeeded without real evidence.

A successful unit test proves the verifier contract exists. It does not, by itself, prove every user-generated site or every custom form works in production.

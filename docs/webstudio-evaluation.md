# OVYX Web Studio: evaluate exported website artifacts

The evaluation corpus in \`scripts/ovyx-webstudio-evaluation-cases.json\` defines nine site categories and nine failure scenarios. This runner evaluates **real exported files placed in a category folder**; it does not generate a website or claim that an AI provider has passed all nine prompts.

## Run it

Export a Web Studio project and place its generated HTML/CSS/JavaScript/assets inside a folder named for the category ID. Repeat for each category, for example:

\`\`\`text
evaluation-artifacts/
  luxury-real-estate/
    index.html
    properties/index.html
    assets/site.css
  fashion-brand/
    index.html
    assets/site.css
  restaurant/
    index.html
    menu/index.html
\`\`\`

The folder names must match the case IDs in the evaluation corpus. A category can include an optional \`run-metadata.json\` containing non-secret metadata such as provider, model, generation time, generation duration in milliseconds, and a prompt hash.

Run a report:

\`\`\`bash
node scripts/ovyx-webstudio-evaluation-runner.mjs --root ./evaluation-artifacts --out ./evaluation-report.json
\`\`\`

Use \`--strict\` in a release pipeline to return a non-zero exit code if any required category has no artifact or any evaluated category has blocking technical findings:

\`\`\`bash
node scripts/ovyx-webstudio-evaluation-runner.mjs --root ./evaluation-artifacts --out ./evaluation-report.json --strict
\`\`\`

## What the report proves

The static evaluator checks supplied files for HTML structure, page metadata, links, local resources, accessible names/labels, image alt attributes, duplicate IDs, common unfinished placeholder copy, secret-like values, reduced-motion support when animations are used, and declared form delivery. It reports unresolved internal routes that might be handled by a client-side router as warnings rather than making unsupported assumptions.

Each supplied category receives a **technical artifact readiness score**, blocking findings, warnings, file and content counts, and a list of category-specific interactions/integrations that remain unproven. Suspected secret values are never echoed. Files matching secret-store patterns such as \`.env\` and credential filenames are reported by path only and are not loaded into the report.

## What it does not prove

A high static score is not a visual-design rating and does not show that a site is worth a particular amount. The runner does not call an AI provider, click all possible controls, take performance measurements, verify contrast with an accessibility standards engine, check browser compatibility, or submit real payments/bookings/forms. Functional criteria and live integration status remain explicitly unverified unless the appropriate browser or safe service tests are run. Missing website artifacts are reported as \`not-evaluated\`, never as passing.

The inspector's adaptive browser plan runs the full five-width matrix on the first three core routes and mobile (390px) plus desktop (1440px) smoke checks on every additional HTML route. Every route is still source-audited. This widens browser-route coverage for agency-sized projects while keeping the default inspection cost bounded; it is not a full five-width test of every route, nor a production-device or live-network test.

On each route's 390px run, the inspector identifies clearly labelled safe semantic controls (excluding submit, payment, booking, account, destructive and similar actions) and samples up to eight per route. The report counts eligible, tested, state-changed and skipped controls; it flags skipped samples so the report cannot imply exhaustive interaction coverage. This remains a smoke test rather than a complete journey test.

The Quality Inspector now offers a **JSON QA report export** and a **copyable client-ready summary** after a completed inspection. The handoff describes route coverage and findings, excludes project IDs and source file contents, and states the limits of sandbox performance and live-integration verification. Findings can still contain project-specific paths or text, so review the report before sharing it externally.

The source audit and artifact evaluator check local image, media, icon, responsive `srcset`, and CSS `url()` references against the generated project file graph. They also validate same-page and cross-page fragment anchors, duplicate IDs, and image alternative-text attributes. Missing local files or broken destination fragments are reported; data-containing `srcset` attributes are skipped conservatively to avoid false positives from data-URL commas. Remote asset references are counted but not fetched, so their availability, licensing, latency, and rendering remain unverified.

Use the Web Studio Quality Inspector for isolated browser viewport/interaction checks, and verify real third-party services only against their safe test environments.


The artifact evaluator also checks that label `for` targets and `aria-labelledby` / `aria-describedby` references exist within the same HTML document; broken references are reported and do not count as valid form-control names.

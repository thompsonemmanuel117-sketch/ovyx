# OVYX Web Studio — Prompt Fidelity (Stage 3)

## What changed

Web Studio now carries a compact requirement contract alongside the original brief. It keeps explicit requirements, named pages, constraints, and common readiness needs available to the generation and implementation prompts.

### Build readiness
Before a fresh website build, Web Studio checks whether a brief depends on real public contact details or a live integration. When essential information is missing, it returns a user-facing question instead of burning generation quota or inventing an address, email, phone number, or connected payment/backend service. A user can provide details or explicitly choose editable placeholders / a UI-only build. Recent user replies are considered so Web Studio does not keep asking the same question after the user answers.

Existing-site edit requests are allowed to proceed without being stopped by the new-build readiness check when existing HTML is present and the request is phrased as an edit.

### Explicit-page recovery
The multi-page pipeline includes the prompt contract in the planning and implementation prompts. If the planned sitemap omitted a page explicitly named by the user, Web Studio adds that route to the plan before batching. It does not silently drop the requirement or exceed the configured page ceiling to do so.

### Final requirement checks
Before the multi-page result is marked ready, deterministic checks inspect the staged output for:
- every explicitly requested page,
- a real HTML form when the prompt explicitly asks for a contact/enquiry form,
- newsletter/subscription content when requested,
- login/register UI when authentication is requested,
- checkout/payment UI when payments are requested.

A failed check makes the build fail explicitly; an incomplete result is not returned as ready. These are source-level checks and are not a substitute for interactive browser testing or confirming that external services are connected.

### Safety and scope
Web Studio must preserve unrelated website content when editing, avoid fabricated business facts, never describe unconnected payment/email/backend features as live, and ask for public details only. Users must not paste passwords, API keys, or secret credentials into chat.

## Verification

The standard `npm test` suite now includes `scripts/prompt-contract.test.mjs`, alongside a regression test that makes the sitemap planner omit a required page and verifies that the route is recovered. `npm run validate` also checks that the prompt-contract service and regression tests remain wired into the authenticated Web Studio gateway and multi-page generator.

These changes improve prompt fidelity, but they do not promise perfect generation for every possible brief. Browser-level end-to-end tests are still required before treating the full Web Studio experience as production-verified.

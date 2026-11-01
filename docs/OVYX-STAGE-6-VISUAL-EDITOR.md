# OVYX Stage 6 — Visual Editor

## Existing platform capabilities retained

The visual editor builds on the existing Web Studio and does not create a second code editor or project store.

- The sidebar Code Workspace remains the source editor and continues to use the shared project file graph.
- The preview three-dot menu retains its existing Code, Files, Visual Select, Pages, Sections, Assets & Media, Viewport and History actions.
- Visual Select continues to use the existing preview-to-parent selection message and the existing selection inspector.
- Section ordering continues to use the existing drag-and-drop section manager.
- Assets & Media continues to use `OVYXAssetStore` and its existing project-scoped storage.
- Desktop, tablet and mobile preview presets continue to use the existing Web Studio viewport manager.
- The existing 50-entry project history and Code Workspace undo/redo remain authoritative.

## Stage 6 visual editing extension

The supplemental runtime `assets/ovyx-webstudio-visual-editor.js` enhances the existing inspector and Web Studio API.

- Adds component-level drag-and-drop reordering for safe block elements. Moves are limited to siblings under the same parent and are committed to the active page source.
- Adds component movement controls, text-only editing, image replacement, and reuse of stored project images.
- Adds visual controls for backgrounds, border colour, font family and weight, text alignment, display, flex direction, alignment, dimensions, spacing, shadow and opacity.
- Stores tablet and mobile overrides in a managed style block in the selected page source. Desktop styling remains the default base style.
- Connects every visual source edit to the shared graph, project persistence, preview refresh, project checkpoints and the existing 50-step undo/redo stack.
- Preserves the Open Code and Ask OVYX actions for complex or nested component edits that should remain code/AI-assisted.

## Safety boundaries

- Only allow-listed CSS properties and constrained values can be written by the visual controls.
- Responsive selectors are limited to stable generated node identifiers or the preview's generated element path.
- Component moves are restricted to siblings; form controls, scripts, styles, tables and document roots are not draggable targets.
- Image replacement accepts secure HTTPS or project-local URLs and uses the existing project asset store. Uploads are size/type bounded.
- Text replacement is limited to leaf elements. Nested components are routed back to Code Workspace or Ask OVYX rather than flattening their markup.
- No project files outside the active page source are rewritten by a visual edit.
- The runtime is injected through Cloudflare Pages middleware and receives no secrets or server credentials.

## Verification

- `scripts/ovyx-webstudio-visual-editor.test.mjs` protects the visual editor contract and asserts that the existing Code Workspace, preview menu, section drag-and-drop, asset store, viewport and history features remain present.
- `scripts/ovyx-webstudio-visual-editor.browser.test.mjs` exercises text edits, style edits, responsive overrides, undo/redo, component movement and visual drag mode in Chromium.
- The new static test is included in `npm test`; the browser test is included in the Web Studio Chromium quality workflow.

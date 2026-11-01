import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePath = path.join(root, 'assets/ovyx-webstudio-visual-editor.js');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><html><head></head><body><section id="view-webstudio"><div id="ws-select-inspector"><b id="ws-selected-title"></b><small id="ws-selected-meta"></small><div class="ovyx-ws-select-actions"></div><div id="ws-selected-controls"></div></div><iframe id="ws-canvas-iframe"></iframe><iframe id="ws-mobile-preview-frame"></iframe></section></body></html>');
  await page.evaluate(() => {
    const source = '<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title></head><body><main><section data-ov-node="hero-1"><h1>Hero Title</h1></section><section data-ov-node="feature-1"><p>Feature copy</p></section></main></body></html>';
    const project = { id: 'visual-fixture', name: 'Visual fixture', pages: [], ovyxGraph: null };
    window.KernelState = { activeView: 'webstudio', activeProject: project };
    window.WebStudio = {
      graph: { version: 2, entry: 'index.html', files: { 'index.html': { type: 'text/html', content: source } } },
      selectedElement: null, historyStack: [], historyPointer: -1, previewPreset: 'desktop',
      ensureProjectGraph() { return this.graph; },
      entryFile() { return 'index.html'; },
      snapshotGraph() { return JSON.parse(JSON.stringify(this.graph)); },
      syncGraphToProject() { project.ovyxGraph = JSON.parse(JSON.stringify(this.graph)); },
      recordHistory() { this.ensureProjectGraph(); this.historyStack.push(JSON.stringify(this.graph)); if (this.historyStack.length > 50) this.historyStack.shift(); this.historyPointer = this.historyStack.length - 1; },
      render() { this.renderPreview(); },
      commitHistory(label, before, after) { project.lastHistory = { label, before, after }; },
      buildPreviewDocument() { return this.graph.files['index.html'].content; },
      renderPreview() { document.getElementById('ws-canvas-iframe').srcdoc = this.buildPreviewDocument(); },
      selectPreviewElement(info) { this.selectedElement = info; document.getElementById('ws-select-inspector').classList.add('show'); },
      setPreviewPreset(preset) { this.previewPreset = preset; document.documentElement.setAttribute('data-ovyx-ws-preview-preset', preset); this.renderPreview(); },
      undo() { if (this.historyPointer <= 0) return; this.historyPointer--; this.graph = JSON.parse(this.historyStack[this.historyPointer]); this.syncGraphToProject(); this.renderPreview(); },
      redo() { if (this.historyPointer >= this.historyStack.length - 1) return; this.historyPointer++; this.graph = JSON.parse(this.historyStack[this.historyPointer]); this.syncGraphToProject(); this.renderPreview(); },
      handlePreviewMenu(action) { if (action === 'visual') this.renderPreview(); }
    };
    window.showToast = function () {};
  });
  await page.addScriptTag({ path: runtimePath });
  await page.evaluate(() => window.WebStudio.renderPreview());
  await page.waitForFunction(() => !!document.getElementById('ws-canvas-iframe').contentDocument?.querySelector('h1'));
  await page.evaluate(() => window.WebStudio.selectPreviewElement({
    id: 'h1:Hero Title',
    selector: 'html:nth-of-type(1) > body:nth-of-type(1) > main:nth-of-type(1) > section:nth-of-type(1) > h1:nth-of-type(1)',
    title: 'Hero Title',
    file: 'index.html'
  }));
  await page.waitForSelector('[data-ovyx-visual-advanced]');
  assert.equal(await page.locator('[data-ovyx-visual-advanced]').count(), 1, 'The advanced inspector must attach to the existing selection inspector.');

  const textSaved = await page.evaluate(() => window.OVYXVisualEditor.applyText('OVYX visual copy'));
  assert.equal(textSaved, true);
  assert.match(await page.evaluate(() => window.WebStudio.graph.files['index.html'].content), /OVYX visual copy/);

  await page.evaluate(() => window.WebStudio.selectPreviewElement({
    id: 'hero-1', selector: 'html:nth-of-type(1) > body:nth-of-type(1) > main:nth-of-type(1) > section:nth-of-type(1)',
    title: 'Hero Title', file: 'index.html'
  }));
  assert.equal(await page.evaluate(() => window.OVYXVisualEditor.applyStyle('background-color', '#123456')), true);
  assert.match(await page.evaluate(() => window.WebStudio.graph.files['index.html'].content), /background-color:\s*rgb\(18, 52, 86\)/i);

  await page.evaluate(() => { window.WebStudio.setPreviewPreset('mobile'); });
  assert.equal(await page.evaluate(() => window.OVYXVisualEditor.applyStyle('color', '#ff0000')), true);
  const responsive = await page.evaluate(() => {
    const html = window.WebStudio.graph.files['index.html'].content;
    return { hasMobile: html.includes('@media (max-width: 600px)'), hasState: html.includes('data-ovyx-responsive-state'), hasColor: html.includes('#ff0000') };
  });
  assert.deepEqual(responsive, { hasMobile: true, hasState: true, hasColor: true });

  await page.evaluate(() => window.WebStudio.undo());
  const afterUndo = await page.evaluate(() => window.WebStudio.graph.files['index.html'].content);
  assert.doesNotMatch(afterUndo, /#ff0000/, 'Undo must revert the most recent responsive visual edit.');
  await page.evaluate(() => window.WebStudio.redo());
  assert.match(await page.evaluate(() => window.WebStudio.graph.files['index.html'].content), /#ff0000/, 'Redo must restore the responsive visual edit.');

  const moved = await page.evaluate(() => window.OVYXVisualEditor.move('[data-ov-node="hero-1"]', '[data-ov-node="feature-1"]', 'after'));
  assert.equal(moved, true);
  const order = await page.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.WebStudio.graph.files['index.html'].content, 'text/html');
    return Array.from(doc.querySelector('main').children).map(node => node.getAttribute('data-ov-node'));
  });
  assert.deepEqual(order, ['feature-1', 'hero-1'], 'Visual component movement must persist to the shared project source.');

  await page.evaluate(() => {
    const w = window.WebStudio;
    w.recordHistory();
    w.graph.files['index.html'].content = w.graph.files['index.html'].content.replace('Feature copy', 'Section history fixture');
    w.render();
  });
  assert.match(await page.evaluate(() => window.WebStudio.graph.files['index.html'].content), /Section history fixture/);
  await page.evaluate(() => window.WebStudio.undo());
  assert.doesNotMatch(await page.evaluate(() => window.WebStudio.graph.files['index.html'].content), /Section history fixture/,
    'The existing section-management history entry must be reversible.');
  await page.evaluate(() => window.WebStudio.redo());
  assert.match(await page.evaluate(() => window.WebStudio.graph.files['index.html'].content), /Section history fixture/,
    'The existing section-management history entry must be redoable.');

  await page.evaluate(() => window.WebStudio.handlePreviewMenu('visual'));
  await page.waitForTimeout(180);
  const dragReady = await page.locator('#ws-canvas-iframe').evaluate(frame => {
    const node = frame.contentDocument.querySelector('[data-ov-node="hero-1"]');
    return !!node && node.draggable === true;
  });
  assert.equal(dragReady, true, 'Visual Select must enable drag-and-drop for safe block components.');

  assert.deepEqual(errors, [], 'The visual editor must not produce browser runtime errors.');
  console.log('OVYX Stage 6 visual editor browser interactions passed: text/style edits, responsive overrides, undo/redo, component reorder and drag mode.');
} finally {
  await browser.close();
}
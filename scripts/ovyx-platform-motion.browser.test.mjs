import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'assets/css/ovyx-platform-motion.css');
const jsPath = path.join(root, 'assets/ovyx-platform-motion.js');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent('<!doctype html><html><head></head><body><main id="view-home"><button id="home-action">Home action</button></main><main id="view-projects" style="display:none"><button id="projects-action">Projects action</button></main><main id="view-webstudio" style="display:none"><button>Editor action</button></main></body></html>');
  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: jsPath });
  await page.waitForFunction(() => document.getElementById('view-home').classList.contains('ovyx-motion-scope'));
  const initial = await page.locator('#view-home').evaluate(node => ({
    scoped: node.classList.contains('ovyx-motion-scope'),
    animation: getComputedStyle(node).animationName
  }));
  assert.equal(initial.scoped, true, 'Initial platform view should receive the motion scope.');
  assert.equal(initial.animation, 'ovyxMotionPageEnter', 'Initial platform view should use the page entrance animation.');

  await page.keyboard.press('Tab');
  const focus = await page.locator('#home-action').evaluate(node => ({
    focused: document.activeElement === node,
    outlineStyle: getComputedStyle(node).outlineStyle
  }));
  assert.equal(focus.focused, true, 'Keyboard navigation should reach the page action.');
  assert.equal(focus.outlineStyle, 'solid', 'Keyboard focus should receive a visible focus ring.');

  await page.evaluate(() => {
    document.getElementById('view-home').style.display = 'none';
    document.getElementById('view-projects').style.display = 'block';
    document.dispatchEvent(new Event('ovyx:view-changed'));
  });
  await page.waitForFunction(() => document.getElementById('view-projects').classList.contains('ovyx-motion-enter'));
  assert.equal(await page.locator('#view-projects').evaluate(node => getComputedStyle(node).animationName), 'ovyxMotionPageEnter');

  const reduced = await browser.newPage();
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.setContent('<!doctype html><html><body><main id="view-home"><button>Action</button></main><main id="view-projects" style="display:none"></main></body></html>');
  await reduced.addStyleTag({ path: cssPath });
  await reduced.addScriptTag({ path: jsPath });
  await reduced.waitForFunction(() => document.getElementById('view-home').classList.contains('ovyx-motion-scope'));
  const reducedState = await reduced.locator('#view-home').evaluate(node => ({
    enters: node.classList.contains('ovyx-motion-enter'),
    animation: getComputedStyle(node).animationName
  }));
  assert.equal(reducedState.enters, false, 'Reduced-motion users must not receive page entrance animation.');
  assert.equal(reducedState.animation, 'none');

  const editor = await browser.newPage();
  await editor.setContent('<!doctype html><html><body class="ovyx-webstudio-active"><main id="view-home"></main><main id="view-webstudio"></main></body></html>');
  await editor.addStyleTag({ path: cssPath });
  await editor.addScriptTag({ path: jsPath });
  await editor.waitForTimeout(80);
  const editorState = await editor.evaluate(() => ({
    homeScoped: document.getElementById('view-home').classList.contains('ovyx-motion-scope'),
    studioScoped: document.getElementById('view-webstudio').classList.contains('ovyx-motion-scope')
  }));
  assert.deepEqual(editorState, { homeScoped: false, studioScoped: false }, 'Web Studio active mode must remain outside the motion system.');

  await reduced.close();
  await editor.close();
  await page.close();
  console.log('OVYX platform motion browser contract: all checks passed.');
} finally {
  await browser.close();
}

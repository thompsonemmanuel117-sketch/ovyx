import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport, isMobile: !!target.isMobile, hasTouch: !!target.hasTouch });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => {
      if (/OVYXWorkspacePicker|project-workspace-picker/i.test(String(error?.stack || error?.message || error))) errors.push(String(error));
    });
    await installOwnerBrowserApiFixtures(page, {
      initialUser: { uid: 'ovyx-project-picker-user', email: 'project-picker@example.test', displayName: 'Project Picker User', token: 'ovyx-project-picker-token' },
    });
    const workspaceFixtures = [
      { id: 'personal', name: 'Personal workspace', description: 'Private projects', status: 'active', isDefault: true, collaboration: { supported: false } },
      { id: 'ws-studio', name: 'Studio workspace', description: 'Client work', status: 'active', isDefault: false, collaboration: { supported: false } },
    ];
    await page.route('**/api/workspaces', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, workspaces: workspaceFixtures }) });
      }
      const body = request.postDataJSON();
      if (body.action === 'create') {
        const workspace = { id: 'ws-created', name: body.name, description: body.description, status: 'active', isDefault: false, collaboration: { supported: false } };
        workspaceFixtures.push(workspace);
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, workspace }) });
      }
      const index = workspaceFixtures.findIndex(item => item.id === body.workspaceId);
      if (index < 0) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Workspace not found.' }) });
      const current = workspaceFixtures[index];
      const workspace = body.action === 'update'
        ? { ...current, name: body.name, description: body.description }
        : body.action === 'archive'
          ? { ...current, status: 'archived' }
          : { ...current, status: 'active' };
      workspaceFixtures[index] = workspace;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, workspace }) });
    });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof window.ProjectStore?.showWorkspacePicker === 'function'
      && window.OVYXWorkspacePicker?.version === 1, null, { timeout: 45000 });

    await page.evaluate(() => {
      const now = Date.now();
      const first = { id: 'picker-project-aurora', name: 'Aurora Commerce', description: 'Commerce project', status: 'draft', workspaceId: 'personal', updatedAt: now, pages: [{ name: 'Home' }, { name: 'Products' }] };
      const second = { id: 'picker-project-northstar', name: 'Northstar Studio', description: 'Studio website', status: 'published', workspaceId: 'ws-studio', updatedAt: now - 60000, pages: [{ name: 'Home' }] };
      const third = { id: 'picker-project-meridian', name: 'Meridian Portfolio', description: 'Portfolio website', status: 'draft', workspaceId: 'personal', updatedAt: now - 120000, pages: [{ name: 'Home' }] };
      window.KernelState.projects = [third, second, first];
      window.KernelState.activeProject = first;
      window.__workspaceRenderCalls = [];
      let projectInventory = window.KernelState.projects;
      Object.defineProperty(window.KernelState, 'projects', {
        configurable: true,
        enumerable: true,
        get() { return projectInventory; },
        set(nextProjects) {
          if (Array.isArray(nextProjects)) {
            window.__workspaceRenderCalls.push(nextProjects.map(project => project.id));
          }
          projectInventory = nextProjects;
        }
      });
      window.ProjectStore.renderHome();
      window.ProjectStore.renderProjects();
    });

    await page.evaluate(() => window.ProjectStore.showWorkspacePicker());
    const dialog = page.locator('#ovyx-project-workspace-picker');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getAttribute('open') !== null, true, '[' + target.name + '] picker must use a real modal dialog.');
    assert.equal(await dialog.locator('[data-project-id]').count(), 2, '[' + target.name + '] picker must initially show every project in the personal workspace.');
    assert.equal(await dialog.locator('[data-project-id="picker-project-aurora"]').getAttribute('aria-current'), 'true');
    assert.equal(await dialog.locator('[data-project-id]').first().getAttribute('data-project-id'), 'picker-project-aurora',
      '[' + target.name + '] workspace projects must be ordered by most recent activity.');
    assert.match(await dialog.locator('[data-project-id="picker-project-aurora"] .ovx-picker-meta').innerText(), /DRAFT.*2 PAGES.*UPDATED/);
    assert.equal(await dialog.locator('[data-project-id="picker-project-aurora"] .ovx-picker-project-description').innerText(), 'Commerce project');
    await page.waitForFunction(() => {
      const search = document.querySelector('#ovyx-project-workspace-picker .ovx-picker-search');
      return Boolean(search && document.activeElement === search);
    }, null, { timeout: 3000 });
    assert.equal(await dialog.locator('.ovx-picker-search').evaluate(el => document.activeElement === el), true,
      '[' + target.name + '] opening the picker must move focus to search.');
    await dialog.locator('#ovx-picker-workspace-select').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('#ovx-picker-workspace-select option').length === 2);
    await dialog.locator('#ovx-picker-workspace-select').selectOption('ws-studio');
    await page.waitForFunction(() => window.__workspaceRenderCalls?.some(ids => ids.length === 1 && ids[0] === 'picker-project-northstar'));
    assert.equal(await dialog.locator('[data-project-id]').count(), 1, '[' + target.name + '] switching workspaces must filter the project inventory.');
    assert.equal(await page.evaluate(() => window.__workspaceRenderCalls.some(ids => ids.length === 1 && ids[0] === 'picker-project-northstar')), true,
      '[' + target.name + '] the existing Projects page renderer must receive only projects from the selected workspace.');
    assert.equal(await page.evaluate(() => window.KernelState.projects.length), 3,
      '[' + target.name + '] filtered rendering must restore the complete project store after rendering.');
    assert.equal(await dialog.locator('[data-project-id]').first().getAttribute('data-project-id'), 'picker-project-northstar');
    await dialog.locator('[data-workspace-rename]').click();
    await dialog.locator('[data-workspace-rename-form] [name="name"]').fill('Studio HQ');
    await dialog.locator('[data-workspace-rename-form] [type="submit"]').click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#ovx-picker-workspace-select option')).some(option => option.textContent === 'Studio HQ'));
    await dialog.locator('[data-workspace-archive]').click();
    await page.waitForFunction(() => document.querySelector('#ovx-picker-workspace-select')?.value === 'personal');
    await dialog.locator('#ovx-picker-workspace-select').selectOption('ws-studio');
    assert.equal(await dialog.locator('[data-project-id="picker-project-northstar"]').isDisabled(), true,
      '[' + target.name + '] archived workspace projects must remain visible but cannot be opened before restore.');
    assert.match(await dialog.locator('[data-workspace-note]').innerText(), /Restore it before opening or editing/);
    const blockedOpenResult = await page.evaluate(() => window.ProjectStore.open('picker-project-northstar'));
    assert.equal(blockedOpenResult, false,
      '[' + target.name + '] opening an archived project from the main Projects page must be blocked synchronously.');
    assert.equal(await page.evaluate(() => window.KernelState.activeProject.id), 'picker-project-aurora',
      '[' + target.name + '] blocking an archived project must preserve the current active project.');
    assert.match(await dialog.locator('[data-workspace-note]').innerText(), /archived.*Restore it before opening or editing/i,
      '[' + target.name + '] blocked opening must explain that the workspace needs restoration.');
    await dialog.locator('[data-workspace-restore]').click();
    await page.waitForFunction(() => document.querySelector('[data-workspace-restore]')?.hidden === true);
    assert.equal(await dialog.locator('[data-project-id="picker-project-northstar"]').isDisabled(), false,
      '[' + target.name + '] restoring a workspace must re-enable project access.');
    await dialog.locator('.ovx-picker-search').fill('northstar');
    assert.equal(await dialog.locator('[data-project-id]').count(), 1, '[' + target.name + '] search must filter the project list.');
    assert.equal(await dialog.locator('[data-project-id]').first().getAttribute('data-project-id'), 'picker-project-northstar');
    await dialog.locator('.ovx-picker-search').fill('no-such-project');
    assert.equal(await dialog.locator('.ovx-picker-empty').innerText().then(text => text.includes('No matching projects')), true,
      '[' + target.name + '] no-result state must explain the empty search.');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('ovyx-project-workspace-picker')?.open);
    await page.evaluate(() => window.ProjectStore.showWorkspacePicker());
    await dialog.locator('#ovx-picker-workspace-select').selectOption('ws-studio');
    await dialog.locator('[data-project-id="picker-project-northstar"]').click();
    await page.waitForFunction(() => window.KernelState?.activeProject?.id === 'picker-project-northstar');
    await page.waitForFunction(() => !document.getElementById('ovyx-project-workspace-picker')?.open);

    await page.evaluate(() => window.ProjectStore.showWorkspacePicker());
    assert.equal(await dialog.locator('[data-workspace-archive]').isDisabled(), true,
      '[' + target.name + '] an active project must prevent archiving its workspace.');
    await dialog.locator('.ovx-picker-search').fill('');
    await dialog.locator('[data-workspace-new]').click();
    await dialog.locator('[data-workspace-create-form] [name="name"]').fill('Campaign workspace');
    await dialog.locator('[data-workspace-create-form] [name="description"]').fill('Campaign projects');
    await dialog.locator('[data-workspace-create-form] [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#ovx-picker-workspace-select')?.value === 'ws-created');
    await page.evaluate(() => {
      const project = { id: 'picker-created-project', name: 'Campaign landing page', status: 'draft', pages: [{ name: 'Home' }], updatedAt: Date.now() };
      window.KernelState.projects.push(project);
      window.KernelState.activeProject = project;
      window.ProjectStore.save();
    });
    await page.waitForFunction(() => window.KernelState.projects.some(project => project.id === 'picker-created-project' && project.workspaceId === 'ws-created'));
    await page.evaluate(() => window.OVYXWorkspacePicker.render());
    await dialog.locator('.ovx-picker-search').fill('');
    assert.equal(await dialog.locator('[data-project-id="picker-created-project"]').count(), 1,
      '[' + target.name + '] newly saved projects must inherit the selected workspace.');
    await page.evaluate(() => window.ProjectStore.showWorkspacePicker());
    await dialog.locator('[data-picker-create]').click();
    const createDialog = page.locator('#ovyx-project-create-modal');
    await createDialog.waitFor({ state: 'visible' });
    assert.equal(await createDialog.getAttribute('aria-hidden'), 'false',
      '[' + target.name + '] Create project must hand off to the existing project creation flow.');
    await page.keyboard.press('Escape');

    const layout = await dialog.evaluate(node => ({ width: node.getBoundingClientRect().width, viewport: window.innerWidth, scrollWidth: node.scrollWidth }));
    assert.ok(layout.width <= layout.viewport, '[' + target.name + '] picker must fit inside the viewport.');
    assert.ok(layout.scrollWidth <= layout.width + 1, '[' + target.name + '] picker must not overflow horizontally.');
    assert.deepEqual(errors, [], '[' + target.name + '] project picker must not throw browser errors.');
    console.log('OVYX project workspace picker passed on ' + target.name + '.');
    await context.close();
  }
} finally {
  await browser.close();
}

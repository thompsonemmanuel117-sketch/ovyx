import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isOwnedOvyxPagesProjectName as isDeployProjectName } from '../functions/api/deploy.js';
import { isOwnedOvyxPagesProjectName as isStatusProjectName } from '../functions/api/deployment-status.js';
import {
  normalizePublishedSiteUrl,
  resolvePublishedSiteFromProjects,
} from '../functions/api/publishing.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [client, middleware, api, packageSource, deploySource, indexSource] = await Promise.all([
  read('assets/ovyx-live-site-updater.js'),
  read('functions/_middleware.js'),
  read('functions/api/publishing.js'),
  read('package.json'),
  read('functions/api/deploy.js'),
  read('index.html'),
]);

// Compile the browser asset without executing it in Node's non-browser environment.
new vm.Script(client, { filename: 'ovyx-live-site-updater.js' });

assert.deepEqual(normalizePublishedSiteUrl('https://www.example.com/shop/products?utm_source=test'), {
  host: 'www.example.com',
  canonicalUrl: 'https://www.example.com/shop/products',
});
assert.equal(normalizePublishedSiteUrl('https://sample-project.pages.dev/').host, 'sample-project.pages.dev');
assert.equal(isDeployProjectName('ovyx-1234567890-storefront', 'ovyx-1234567890-'), true);
assert.equal(isDeployProjectName('ovyx-1234567890-other', 'ovyx-1234567890-'), true);
assert.equal(isDeployProjectName('ovyx-aaaaaaaaaa-storefront', 'ovyx-1234567890-'), false);
assert.equal(isStatusProjectName('ovyx-1234567890-storefront', 'ovyx-1234567890-'), true);
assert.equal(isStatusProjectName('somebody-elses-pages-project', 'ovyx-1234567890-'), false);
for (const invalid of [
  '', 'example.com', 'http://example.com', 'https://user:pass@example.com',
  'https://example.com:8443', 'https://localhost', 'https://127.0.0.1',
  'https://internal.example.test', 'https://service.workers.dev',
]) {
  assert.throws(() => normalizePublishedSiteUrl(invalid), Error, invalid + ' must not be accepted as a live website URL');
}

const owner = { uid: 'owner-1', email: 'owner@example.com' };
const production = [{ id: 'deploy-1', environment: 'production', latest_stage: { name: 'deploy', status: 'success' } }];
const pagesProject = {
  id: 'project-1',
  data: {
    id: 'project-1',
    name: 'Storefront',
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    ovyxDeployments: [{ status: 'published', url: 'https://ovyx-1234567890-storefront.pages.dev' }],
  },
};
const resolvePagesProject = async () => ({
  pagesName: 'ovyx-1234567890-storefront',
  project: { subdomain: 'ovyx-1234567890-storefront.pages.dev' },
  domains: [],
  deployments: production,
});
const resolvedPages = await resolvePublishedSiteFromProjects({
  ...owner, host: 'ovyx-1234567890-storefront.pages.dev', projects: [pagesProject], resolvePagesProject,
});
assert.equal(resolvedPages.projectId, 'project-1');
assert.equal(resolvedPages.pagesProjectName, 'ovyx-1234567890-storefront');
assert.equal(resolvedPages.sameProject, true);
assert.equal(resolvedPages.deploymentTarget, 'existing-pages-project');
assert.equal(resolvedPages.matchedBy, 'pages-hostname');

const stableNameProject = {
  id: 'project-stable',
  data: { name: 'Renamed project', ownerUid: owner.uid, ownerEmail: owner.email, ovyxPagesProjectName: 'ovyx-abcdef1234-renamed' },
};
const resolvedStableName = await resolvePublishedSiteFromProjects({
  ...owner,
  host: 'ovyx-abcdef1234-renamed.pages.dev',
  projects: [stableNameProject],
  resolvePagesProject: async () => ({ pagesName: 'ovyx-abcdef1234-renamed', project: { subdomain: 'ovyx-abcdef1234-renamed.pages.dev' }, domains: [], deployments: production }),
});
assert.equal(resolvedStableName.projectId, 'project-stable');
assert.equal(resolvedStableName.pagesProjectName, 'ovyx-abcdef1234-renamed');
const customDomainProject = {
  id: 'project-2',
  data: {
    name: 'International shop',
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    ovyxDeploymentDomain: 'shop.example.co.uk',
    ovyxDeployments: [{ status: 'published', url: 'https://shop.example.co.uk' }],
  },
};
const resolvedCustom = await resolvePublishedSiteFromProjects({
  ...owner,
  host: 'shop.example.co.uk',
  projects: [customDomainProject],
  resolvePagesProject: async () => ({
    pagesName: 'ovyx-0987654321-international-shop',
    project: { subdomain: 'international-shop.pages.dev' },
    domains: [{ name: 'shop.example.co.uk', status: 'active' }],
    deployments: production,
  }),
});
assert.equal(resolvedCustom.matchedBy, 'connected-custom-domain');
assert.equal(resolvedCustom.domainStatus, 'active');
await assert.rejects(
  resolvePublishedSiteFromProjects({
    ...owner,
    host: 'shop.example.co.uk',
    projects: [customDomainProject],
    resolvePagesProject: async () => ({ pagesName: 'ovyx-0987654321-international-shop', project: { subdomain: 'international-shop.pages.dev' }, domains: [{ name: 'shop.example.co.uk', status: 'pending' }], deployments: production }),
  }),
  error => error.code === 'PUBLISHED_SITE_NOT_VERIFIED',
  'A pending custom domain must not be treated as a live website.',
);

await assert.rejects(
  resolvePublishedSiteFromProjects({
    ...owner,
    host: 'ovyx-1234567890-storefront.pages.dev',
    projects: [{ ...pagesProject, data: { ...pagesProject.data, ownerUid: 'another-user' } }],
    resolvePagesProject,
  }),
  error => error.code === 'PUBLISHED_SITE_NOT_FOUND',
  'A link saved under another account must never resolve.',
);
await assert.rejects(
  resolvePublishedSiteFromProjects({
    ...owner,
    host: 'ovyx-1234567890-storefront.pages.dev',
    projects: [pagesProject],
    resolvePagesProject: async () => ({ pagesName: 'other-project', project: { subdomain: 'other.pages.dev' }, domains: [], deployments: [] }),
  }),
  error => error.code === 'PUBLISHED_SITE_NOT_VERIFIED',
  'A hostname without a confirmed production release must not be updated.',
);
await assert.rejects(
  resolvePublishedSiteFromProjects({
    ...owner,
    host: 'ovyx-1234567890-storefront.pages.dev',
    projects: [pagesProject, { ...pagesProject, id: 'project-duplicate' }],
    resolvePagesProject,
  }),
  error => error.code === 'PUBLISHED_SITE_AMBIGUOUS',
  'Ambiguous ownership must stop before any source edit.',
);

assert.match(api, /listFirestoreSubcollectionDocumentsAtPath/);
assert.match(api, /handleResolvePublishedSite/);
assert.match(api, /findExistingPagesProject/);
assert.match(deploySource, /if\(requestedPagesProjectName\)await ovyxGetExistingPagesProject/);
assert.match(deploySource, /async function ovyxGetExistingPagesProject/);
assert.match(api, /resolveEntitlements/);
assert.match(api, /emailVerified/);
assert.match(client, /Update an existing live website/);
assert.match(client, /Find my website/);
assert.match(client, /Update this live website/);
assert.match(client, /api\/publishing\?resolveUrl=/);
assert.match(client, /api\/site-management/);
assert.match(client, /async function persistProject/);
assert.match(client, /await persistProject\(active\)/);
assert.match(client, /DEPLOYMENT_PENDING/);
assert.match(client, /DEPLOYMENT_FAILED/);
assert.match(client, /await restoreProject/);
assert.match(client, /Before AI live website update/);
assert.match(client, /runBuildAgent/);
assert.match(client, /runTests\(true\)/);
assert.match(client, /api\/deploy/);
assert.match(client, /api\/deployment-status/);
assert.match(client, /pagesProjectName: String\(resolution\.pagesProjectName \|\| ''\)/);
assert.match(client, /environment === 'production'/);
assert.match(client, /existing production Pages project/);
assert.match(client, /functions\//);
assert.match(client, /previous saved project snapshot was restored/);
assert.match(client, /Do not assume Nigeria, NGN, USD, one language/);
assert.match(middleware, /ovyx-live-site-updater\.js/);
assert.match(packageSource, /ovyx-live-site-updater\.test\.mjs/);
assert.match(indexSource, /Browser locale is only a display fallback/);
assert.match(indexSource, /typeof Intl\.Locale === 'function'/);
assert.doesNotMatch(indexSource, /tz\.includes\(['"]africa['"]\)/, 'An African timezone must not be mistaken for Nigeria.');

console.log('OVYX authenticated same-domain live website updater tests passed.');

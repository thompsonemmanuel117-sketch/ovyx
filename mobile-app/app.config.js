import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRuntime() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'build-runtime.json'),
        'utf8'
      )
    ) || {};
  } catch {
    return {};
  }
}

const runtime = readRuntime();
const clean = value => String(value || '').trim();
const safeSlug = value =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34) || 'mobile-app';

export default function appConfig({ config }) {
  const displayName =
    clean(runtime.displayName || process.env.OVYX_APP_DISPLAY_NAME) ||
    'OVYX Mobile App';

  const slug = safeSlug(
    runtime.appSlug ||
    process.env.OVYX_APP_SLUG ||
    'ovyx-mobile-app'
  );

  const projectId =
    clean(
      runtime.easProjectId ||
      process.env.EXPO_PROJECT_ID ||
      process.env.OVYX_EAS_PROJECT_ID
    );

  const identifierSlug = slug.replace(/-/g, '');

  return {
    ...config,
    name: displayName,
    slug,
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    android: {
      ...(config.android || {}),
      package: `com.ovyx.${identifierSlug}`,
      adaptiveIcon: {
        ...(config.android?.adaptiveIcon || {}),
        foregroundImage: './assets/icon.png',
        backgroundColor: '#050505'
      }
    },
    ios: {
      ...(config.ios || {}),
      bundleIdentifier: `com.ovyx.${identifierSlug}`,
      supportsTablet: true
    },
    extra: {
      ...(config.extra || {}),
      ovyx: {
        sourceProjectId: clean(runtime.sourceProjectId),
        buildJobId: clean(runtime.jobId)
      },
      eas: projectId
        ? { projectId }
        : config.extra?.eas
    }
  };
}

'use strict';

const CACHE_NAME = 'ovyx-shell-v1';
const SAFE_DEFAULT_PATH = '/';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  try {
    const value = event.data ? event.data.json() : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    try {
      return { body: event.data ? event.data.text() : '' };
    } catch (_) {
      return {};
    }
  }
}

function safeNavigationTarget(raw) {
  const origin = self.location.origin;
  try {
    const url = new URL(String(raw || SAFE_DEFAULT_PATH), origin);
    if (url.origin !== origin || !/^https?:$/.test(url.protocol)) return origin + SAFE_DEFAULT_PATH;
    if (url.username || url.password) return origin + SAFE_DEFAULT_PATH;
    return url.href;
  } catch (_) {
    return origin + SAFE_DEFAULT_PATH;
  }
}

self.addEventListener('push', event => {
  const payload = parsePushPayload(event);
  const title = String(payload.title || payload.notification?.title || 'OVYX Alert').slice(0, 120);
  const body = String(payload.body || payload.message || payload.notification?.body || 'You have a new OVYX notification.').slice(0, 2000);
  const target = safeNavigationTarget(payload.url || payload.path || '/');
  const tag = String(payload.tag || payload.id || 'ovyx-notification').slice(0, 160);
  const icon = safeNavigationTarget(payload.icon || '/assets/ovyx-mark.svg');
  const badge = safeNavigationTarget(payload.badge || '/assets/ovyx-mark.svg');
  const options = {
    body,
    icon,
    badge,
    tag,
    renotify: false,
    data: {
      url: target,
      notificationId: String(payload.id || payload.notificationId || '').slice(0, 160)
    }
  };
  if (typeof payload.requireInteraction === 'boolean') options.requireInteraction = payload.requireInteraction;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = safeNavigationTarget(event.notification?.data?.url || '/');
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== self.location.origin) continue;
        if (typeof client.navigate === 'function') await client.navigate(destination);
        if (typeof client.focus === 'function') return client.focus();
      } catch (_) {
        // A stale or non-window client should not prevent opening the target below.
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(destination);
    return undefined;
  })());
});

self.addEventListener('notificationclose', event => {
  // Closing a notification does not mark it as read; the authenticated app owns that state.
  const notificationId = String(event.notification?.data?.notificationId || '');
  if (notificationId) {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          client.postMessage({ type: 'ovyx:notification-dismissed', notificationId });
        }
      }
    })());
  }
});

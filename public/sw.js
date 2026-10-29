/*
 * WebCoder service worker (competitive roadmap OPS-6 — PWA).
 *
 * Hand-rolled, dependency-free, ~120 reviewed lines instead of a
 * next-pwa/workbox dependency: no major judge ships an official PWA, and
 * the roadmap's ask is precisely scoped — offline problem browsing plus
 * notification deep links.
 *
 * Strategies (per request kind):
 *  - HTML navigations: network-first. On success, cache the page into
 *    PAGES (offline problem browsing = reopening a problem you already
 *    visited). On failure, serve PAGES if we have it, else /offline.html.
 *  - Same-origin static build assets (_next/static, icons, the manifest):
 *    stale-while-revalidate — instant from cache, refreshed in background.
 *  - EVERYTHING else (the API above all): network only, never cached —
 *    verdicts and standings must never go stale.
 *
 * Notification deep links: `notificationclick` focuses an existing window
 * and postMessages the deep-link URL when the app is already open, or
 * opens it directly — notifications never dead-end.
 */

const VERSION = 'v1';
const STATIC_CACHE = `wc-static-${VERSION}`;
const PAGES_CACHE = `wc-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Same-origin, GET, and not an API/auth call — everything the SW touches. */
function cacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith('/_next/static/')
  );
}

function isBuildAssetRequest(request) {
  const url = new URL(request.url);
  return (
    cacheableAsset(url) ||
    url.origin === self.location.origin &&
      (url.pathname.startsWith('/icons/') ||
        url.pathname === '/manifest.webmanifest')
  );
}

async function handleNavigation(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const statics = await caches.open(STATIC_CACHE);
    const offline = await statics.match(OFFLINE_URL);
    if (offline) return offline;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The API is NEVER cached — a stale verdict is worse than no verdict.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isBuildAssetRequest(request)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function focusOrOpen(url) {
  const clientList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    if ('focus' in client) {
      await client.focus();
      if ('postMessage' in client) client.postMessage({ type: 'wc-navigate', url });
      return;
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(focusOrOpen(url));
});

// Web-push landed? Not yet — the handler below is the forward hook the
// roadmap's "notification deep links" ask for; without a push
// subscription it is dormant and costs nothing.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'WebCoder', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'WebCoder', {
      body: payload.body || '',
      tag: payload.tag || 'webcoder',
      data: { url: payload.url || '/' },
    })
  );
});

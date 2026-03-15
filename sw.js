// ═══════════════════════════════════════════════════════════════
// MoliseAvvisi21-27 — Service Worker PWA
// Cache-first per asset statici, network-first per API
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'moliseavvisi-v7';
const STATIC_ASSETS = [
  './',
  './moliseavvisi-v7.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700;900&family=Roboto+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => {
          return new Request(url, { mode: 'cors' });
        })).catch(err => {
          console.log('[SW] Some assets failed to cache:', err);
          // Cache what we can, skip failures
          return Promise.allSettled(
            STATIC_ASSETS.map(url => 
              cache.add(new Request(url, { mode: 'cors' })).catch(() => {})
            )
          );
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls (PEC, SPID, URBI, REGIS, Google)
  if (url.pathname.startsWith('/api/') || 
      url.pathname.startsWith('/spid/') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('accounts.google.com') ||
      url.hostname.includes('aruba.it') ||
      url.hostname.includes('regis.') ||
      url.hostname.includes('urbi.')) {
    return; // Let browser handle normally (network only)
  }

  // CDN assets: cache-first (they have version in URL)
  if (url.hostname === 'cdnjs.cloudflare.com' || 
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
      })
    );
    return;
  }

  // HTML and local files: network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback to main page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./moliseavvisi-v7.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Background sync placeholder (for future PEC queue)
self.addEventListener('sync', event => {
  if (event.tag === 'pec-queue') {
    console.log('[SW] Background sync: PEC queue');
  }
});

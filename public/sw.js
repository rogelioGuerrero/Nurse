const SW_VERSION = 'biencuidar-v13-patient-20260714';
const CACHE_NAME = `biencuidar-cache-${SW_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

let _pendingSpeak = null;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION) && k.startsWith('biencuidar-'))
          .map((k) => caches.delete(k))
      )
    )
  );
  // Notify all clients that a new SW is active
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
  });
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Client ready — send pending speak text if any
  if (event.data && event.data.type === 'READY') {
    if (_pendingSpeak) {
      event.source.postMessage({ type: 'SPEAK', text: _pendingSpeak });
      _pendingSpeak = null;
    }
  }
});

// --- Web Push support ---
self.addEventListener('push', (event) => {
  let data = { title: 'BienCuidar', body: '', tag: 'biencuidar' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    if (event.data) data.body = event.data.text();
  }

  // Store speak text
  if (data.benni && data.speak) {
    _pendingSpeak = data.speak;
  }

  // Escalation notifications route to Benni (family responds)
  // Morning briefings route to Benni with a briefing flag
  const notifData = data.escalate
    ? { url: '/?benni=escalate', escalate: true }
    : data.morningBriefing
    ? { url: '/?benni=briefing', morningBriefing: true }
    : data.benni
    ? { url: '/?benni=true', speak: data.speak || '' }
    : { url: '/' };

  event.waitUntil(
    (async () => {
      // For patient mode: if the patient screen is already open, auto-send SPEAK without waiting for click
      if (data.benni && data.speak) {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.searchParams.get('patient')) {
            client.postMessage({ type: 'SPEAK', text: data.speak });
            _pendingSpeak = null;
            break;
          }
        }
      }

      await self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag || 'biencuidar',
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: notifData,
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const speakText = (event.notification.data && event.notification.data.speak) || null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Look for an existing client matching the target URL
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetPath = new URL(targetUrl, self.location.origin);
        if (clientUrl.pathname === targetPath.pathname && 'focus' in client) {
 client.focus();
          if (speakText) client.postMessage({ type: 'SPEAK', text: speakText });
          return;
        }
      }
      // No existing client — open new one
      return self.clients.openWindow(targetUrl).then((client) => {
        // _pendingSpeak will be sent when the client sends READY
        if (speakText) _pendingSpeak = speakText;
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return res;
        })
      );
    })
  );
});

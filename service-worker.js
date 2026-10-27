const CACHE_NAME = 'planejador-estudos-v10-6-sem-dados-nativos';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './supabase-config.js', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('planejador-estudos-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache OAuth callback URLs, which can temporarily contain an authorization code.
  const isAuthReturn = url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('type') || url.searchParams.has('access_token');
  if (isAuthReturn) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response && response.ok && !url.search) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});

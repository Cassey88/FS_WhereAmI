const CACHE = 'web-shortcut-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

function idbGet(key) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('webShortcut', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => {
      try {
        const q = r.result.transaction('kv').objectStore('kv').get(key);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      } catch (e) { rej(e); }
    };
    r.onerror = () => rej(r.error);
  });
}

// Per-slot manifest so each shortcut installs as its own named icon
async function customManifest(req) {
  const url = new URL(req.url);
  const slot = (url.searchParams.get('slot') || '1').replace(/[^0-9]/g, '') || '1';
  const nameKey = slot === '1' ? 'appName' : 's' + slot + ':appName';
  const base = (await caches.match('./manifest.json')) || (await fetch('./manifest.json'));
  const json = await base.clone().json();
  json.start_url = './index.html?slot=' + slot;
  json.id = './index.html?slot=' + slot;
  try {
    const name = await idbGet(nameKey);
    if (name) { json.name = name; json.short_name = name; }
    else if (slot !== '1') { json.name = 'Web Shortcut ' + slot; json.short_name = 'Shortcut ' + slot; }
  } catch (e) { /* default names */ }
  return new Response(JSON.stringify(json), {
    headers: { 'Content-Type': 'application/manifest+json' }
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch the target sites
  if (url.pathname.endsWith('manifest.json')) {
    e.respondWith(customManifest(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request))
  );
});

/* Pneuma service worker: app shell cache, CDN libraries cache and private photos at ./_blob/<name>. */
const VERSION = 'pneuma-v1';
const SB_URL = 'https://blaxggluwkppowdsjmhi.supabase.co';
const SB_KEY = 'sb_publishable_mqfeERxVZCWzzJ6Vclnp6w_jVVOauXR';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const LIBS = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pneuma-v') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function token() {
  const c = await caches.open('pneuma-auth');
  const r = await c.match(new URL('__token', self.registration.scope).href);
  return r ? r.text() : '';
}

async function blob(req, name) {
  const cache = await caches.open('pneuma-fotos');
  const hit = await cache.match(req);
  if (hit) return hit;
  const t = await token();
  if (!t) return new Response('Sin sesión', { status: 401 });
  const res = await fetch(`${SB_URL}/storage/v1/object/authenticated/fotos/${name}`, { headers: { Authorization: 'Bearer ' + t, apikey: SB_KEY } });
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

/* Network first for the page so updates arrive; cached copy when offline. */
async function shell(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match('./index.html'));
  }
}

async function lib(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname + '_blob/')) {
    e.respondWith(blob(req, decodeURIComponent(url.pathname.slice(scope.pathname.length + 6))));
    return;
  }
  if (LIBS.test(req.url)) { e.respondWith(lib(req)); return; }
  if (url.origin === scope.origin) e.respondWith(shell(req));
});

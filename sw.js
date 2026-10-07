/* Apex Hunter — service worker
   - Guarda la app para usarla sin internet.
   - Avisos locales (cuando no está activado el push).
   - Recibe las notificaciones push del servidor. */

importScripts('./reminders.js');

const VERSION = 'apex-hunter-v6';
const FONTS = 'apex-hunter-fonts';
const SHELL = [
  './',
  './index.html',
  './reminders.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './badge-96.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // siempre a la red

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

/* ---------- Avisos locales ---------- */
const pad = n => String(n).padStart(2, '0');

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('apex-hunter', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idbOpen();
  const v = await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  db.close(); return v;
}
async function idbPut(k, v) {
  const db = await idbOpen();
  await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}

function show(n) {
  return self.registration.showNotification(n.title, {
    body: n.body, tag: n.tag, data: { url: n.url || './' },
    icon: './icon-192.png', badge: './badge-96.png'
  });
}

let checking = null;
function check() {
  if (!checking) checking = runCheck().catch(() => {}).finally(() => { checking = null; });
  return checking;
}
async function runCheck() {
  const st = await idbGet('estado');
  if (!st || !st.data || st.pushActivo) return; // con push activo, avisa el servidor
  const d = new Date();
  const now = { fecha: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), hm: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
  const log = (await idbGet('avisados')) || {};
  const out = self.ApexReminders.compute(st.data, now, log);
  for (const n of out.notifs) await show(n);
  if (out.changed) await idbPut('avisados', out.log);
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'check') e.waitUntil(check());
});
self.addEventListener('periodicsync', e => {
  if (e.tag === 'apex-recordatorios') e.waitUntil(check());
});

/* ---------- Push del servidor ---------- */
self.addEventListener('push', e => {
  let n = { title: 'Apex Hunter', body: 'Tenés un aviso nuevo.', tag: 'apex', url: './' };
  try { if (e.data) n = Object.assign(n, e.data.json()); } catch (_) {}
  e.waitUntil(show(n));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus().then(w => (w && w.navigate ? w.navigate(url) : w)).catch(() => {});
      }
      return self.clients.openWindow(url);
    })
  );
});

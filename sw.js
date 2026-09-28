/* Apex Hunter — service worker
   - Guarda la app para usarla sin internet.
   - Revisa los recordatorios y muestra las notificaciones. */

const VERSION = 'apex-hunter-v3';
const FONTS = 'apex-hunter-fonts';
const SHELL = [
  './',
  './index.html',
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

  // Tipografías de Google: se guardan para usarlas sin conexión
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // La página: primero internet (para recibir actualizaciones), si no hay, la copia guardada
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

/* ---------- Recordatorios ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const weekStart = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const money = new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0});

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

function notify(title, body, tag, url) {
  return self.registration.showNotification(title, {
    body, tag, data: {url},
    icon: './icon-192.png',
    badge: './badge-96.png'
  });
}

let checking = null;
function check() {
  if (!checking) checking = runCheck().catch(() => {}).finally(() => { checking = null; });
  return checking;
}

async function runCheck() {
  const st = await idbGet('estado');
  if (!st || !st.rec) return;
  const log = (await idbGet('avisados')) || {};
  const now = new Date();
  const hoy = iso(now);
  const hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  let changed = false;

  // Entrenamiento
  const ent = st.rec.entreno;
  if (ent && ent.on && hm >= ent.hora && log.entreno !== hoy) {
    const fechas = st.fechasEntreno || [];
    const ws = weekStart(hoy);
    const dias = new Set(fechas.filter(f => f >= ws)).size;
    const meta = st.meta || 4;
    const falta = meta - dias;
    const quedan = 7 - ((now.getDay() + 6) % 7); // días que quedan en la semana, contando hoy
    if (!fechas.includes(hoy) && falta > 0) {
      let body;
      if (falta > quedan) body = 'Esta semana ya no llegás a la meta, pero cada sesión cuenta. Hoy sumá una.';
      else if (falta === quedan) body = 'Te faltan ' + falta + (falta === 1 ? ' día' : ' días') + ' y queda' + (quedan === 1 ? '' : 'n') + ' ' + quedan + '. Hoy no se puede fallar.';
      else body = 'Llevás ' + dias + ' de ' + meta + ' días esta semana. ¿Entrenás hoy?';
      await notify('Hora de entrenar', body, 'entreno', './#entreno');
    }
    log.entreno = hoy; changed = true;
  }

  // Finanzas
  const fin = st.rec.finanzas;
  if (fin && fin.on && hm >= fin.hora && log.finanzas !== hoy) {
    const prev = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
    const t = st.totales && st.totales[prev];
    if (now.getDate() === 1 && t && log.resumen !== prev) {
      const bal = t.ing - t.gas;
      const mes = MESES[+prev.slice(5) - 1];
      await notify('Cerró ' + mes,
        'Ingresos ' + money.format(t.ing) + ' · Gastos ' + money.format(t.gas) + ' · Balance ' + (bal < 0 ? '−' : '') + money.format(Math.abs(bal)),
        'resumen', './#finanzas');
      log.resumen = prev;
    } else if (!(st.fechasMov || []).includes(hoy)) {
      await notify('Anotá tus movimientos', '¿Cobraste o gastaste algo hoy? Cargalo ahora y mantené tus números al día.', 'finanzas', './#finanzas');
    }
    log.finanzas = hoy; changed = true;
  }

  if (changed) await idbPut('avisados', log);
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'check') e.waitUntil(check());
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'apex-recordatorios') e.waitUntil(check());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus().then(w => (w && w.navigate ? w.navigate(url) : w)).catch(() => {});
      }
      return self.clients.openWindow(url);
    })
  );
});

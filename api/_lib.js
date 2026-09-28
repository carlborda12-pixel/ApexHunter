// Apex Hunter — utilidades compartidas de las funciones (no es una ruta: empieza con "_")
const crypto = require('crypto');

let _redis = null;
function redis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  _redis = new Redis({ url, token });
  return _redis;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Autorización con la clave de la app (APP_SECRET)
function auth(req) {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) return false;
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return !!m && safeEqual(m[1].trim(), secret);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) { return {}; }
}

// ---- Unión de datos entre dispositivos (misma lógica que en la app)
const COLS = ['movs', 'sesiones', 'fijos', 'cobros', 'objetivos'];
function mergeArr(a, b) {
  const m = new Map();
  [].concat(a || [], b || []).forEach(x => {
    if (!x || typeof x !== 'object' || !x.id) return;
    const p = m.get(x.id);
    if (!p || (x.upd || 0) > (p.upd || 0)) m.set(x.id, x);
  });
  return [...m.values()];
}
function merge(A, B) {
  if (!A || typeof A !== 'object') return B;
  if (!B || typeof B !== 'object') return A;
  const out = { v: 2 };
  COLS.forEach(k => { out[k] = mergeArr(A[k], B[k]); });
  const ca = A.cfg || {}, cb = B.cfg || {};
  out.cfg = (cb.upd || 0) > (ca.upd || 0) ? cb : ca;
  return out;
}

// Fecha y hora actual en Argentina
function nowAR() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TZ || 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

function webpush() {
  const wp = require('web-push');
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  wp.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  return wp;
}

const subId = endpoint => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

module.exports = { redis, auth, send, body, merge, nowAR, webpush, subId, safeEqual };

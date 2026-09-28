// Apex Hunter — suscripciones a notificaciones push
// GET: clave pública · POST {subscription}: guardar · POST {subscription, test:true}: aviso de prueba · DELETE {endpoint}: borrar
const { redis, auth, send, body, webpush, subId } = require('./_lib');

const SUBS = 'apex:subs';

module.exports = async (req, res) => {
  if (!auth(req)) return send(res, 401, { error: 'clave' });
  if (req.method === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY || null;
    return send(res, publicKey ? 200 : 503, publicKey ? { publicKey } : { error: 'sin-vapid' });
  }
  const r = redis();
  if (!r) return send(res, 503, { error: 'sin-base' });
  try {
    const b = await body(req);
    if (req.method === 'POST') {
      const sub = b.subscription;
      if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys) return send(res, 400, { error: 'suscripcion' });
      await r.hset(SUBS, { [subId(sub.endpoint)]: JSON.stringify(sub) });
      if (b.test) {
        const wp = webpush();
        if (!wp) return send(res, 503, { error: 'sin-vapid' });
        await wp.sendNotification(sub, JSON.stringify({ title: 'Apex Hunter', body: 'Push activado. Así te llegan los avisos con la app cerrada.', tag: 'prueba', url: './' }));
      }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (typeof b.endpoint === 'string') await r.hdel(SUBS, subId(b.endpoint));
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'metodo' });
  } catch (e) {
    return send(res, 500, { error: 'servidor' });
  }
};

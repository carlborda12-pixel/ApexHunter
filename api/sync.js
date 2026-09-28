// Apex Hunter — sincronización entre dispositivos
// PUT {data}: une lo que manda el dispositivo con lo guardado y devuelve el resultado.
const { redis, auth, send, body, merge } = require('./_lib');

const KEY = 'apex:data';

module.exports = async (req, res) => {
  if (!auth(req)) return send(res, 401, { error: 'clave' });
  const r = redis();
  if (!r) return send(res, 503, { error: 'sin-base' });
  try {
    if (req.method === 'GET') {
      const data = await r.get(KEY);
      return send(res, 200, { data: data || null });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const b = await body(req);
      if (!b || typeof b.data !== 'object') return send(res, 400, { error: 'datos' });
      const actual = await r.get(KEY);
      const unido = merge(actual, b.data);
      unido.syncedAt = Date.now();
      await r.set(KEY, unido);
      return send(res, 200, { data: unido });
    }
    return send(res, 405, { error: 'metodo' });
  } catch (e) {
    return send(res, 500, { error: 'servidor' });
  }
};

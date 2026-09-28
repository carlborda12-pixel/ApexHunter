// Apex Hunter — revisa los recordatorios y manda los push.
// Llamalo cada 5 minutos desde cron-job.org:  https://TU-APP.vercel.app/api/cron?key=TU_CRON_SECRET
const { redis, send, nowAR, webpush, safeEqual } = require('./_lib');
const reminders = require('../reminders.js');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://x');
  const given = url.searchParams.get('key') || ((req.headers.authorization || '').match(/^Bearer\s+(.+)$/i) || [])[1] || '';
  if (!secret || !given || !safeEqual(given, secret)) return send(res, 401, { error: 'clave' });

  const r = redis();
  if (!r) return send(res, 503, { error: 'sin-base' });
  const wp = webpush();
  if (!wp) return send(res, 503, { error: 'sin-vapid' });

  try {
    const [data, log, subsRaw] = await Promise.all([r.get('apex:data'), r.get('apex:avisados'), r.hgetall('apex:subs')]);
    if (!data) return send(res, 200, { ok: true, enviados: 0, motivo: 'sin-datos' });
    const now = nowAR();
    const out = reminders.compute(data, now, log || {});
    if (out.changed) await r.set('apex:avisados', out.log);

    const subs = Object.entries(subsRaw || {}).map(([id, v]) => {
      try { return { id, sub: typeof v === 'string' ? JSON.parse(v) : v }; } catch (_) { return null; }
    }).filter(Boolean);

    let enviados = 0;
    for (const n of out.notifs) {
      for (const s of subs) {
        try { await wp.sendNotification(s.sub, JSON.stringify(n), { TTL: 3600 }); enviados++; }
        catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await r.hdel('apex:subs', s.id); }
      }
    }
    return send(res, 200, { ok: true, hora: now.hm, avisos: out.notifs.length, enviados });
  } catch (e) {
    return send(res, 500, { error: 'servidor' });
  }
};

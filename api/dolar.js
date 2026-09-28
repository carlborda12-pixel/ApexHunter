// Apex Hunter — cotización del dólar (hoy + promedio mensual)
// GET /api/dolar?casa=blue|oficial|bolsa
const { send } = require('./_lib');

const CASAS = ['blue', 'oficial', 'bolsa'];

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  const casa = new URL(req.url, 'http://x').searchParams.get('casa') || 'blue';
  if (!CASAS.includes(casa)) return send(res, 400, { error: 'casa' });
  try {
    const [hoy, hist] = await Promise.all([
      getJson('https://dolarapi.com/v1/dolares/' + casa),
      getJson('https://api.argentinadatos.com/v1/cotizaciones/dolares/' + casa).catch(() => [])
    ]);
    const acc = {};
    (Array.isArray(hist) ? hist : []).forEach(x => {
      if (!x || !x.fecha || !(x.venta > 0)) return;
      const m = String(x.fecha).slice(0, 7);
      (acc[m] = acc[m] || [0, 0]);
      acc[m][0] += x.venta; acc[m][1]++;
    });
    const meses = {};
    Object.keys(acc).sort().slice(-48).forEach(m => { meses[m] = Math.round(acc[m][0] / acc[m][1] * 100) / 100; });
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ casa, hoy: { compra: hoy.compra, venta: hoy.venta, fecha: hoy.fechaActualizacion }, meses }));
  } catch (e) {
    return send(res, 502, { error: 'cotizacion' });
  }
};

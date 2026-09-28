/* Apex Hunter — lógica de recordatorios compartida
   La usan el service worker (avisos locales) y la función /api/cron (push). */
(function (root) {
  'use strict';

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var TIPOS = {kick: 'Kickboxing', box: 'Boxeo / sparring', func: 'Funcional', run: 'Correr', fuerza: 'Fuerza', otro: 'Otro'};
  var money = new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0});

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function parse(s) { var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function addDays(s, k) { var d = parse(s); d.setUTCDate(d.getUTCDate() + k); return iso(d); }
  function dowMon(s) { return (parse(s).getUTCDay() + 6) % 7; }
  function weekStart(s) { return addDays(s, -dowMon(s)); }
  function daysIn(m) { var p = m.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); }
  function prevMonth(m) { var p = m.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 2, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }
  function live(a) { return (a || []).filter(function (x) { return x && !x.del; }); }

  /* now: {fecha:'YYYY-MM-DD', hm:'HH:MM'} en la hora local del usuario */
  function compute(data, now, log) {
    log = Object.assign({}, log || {});
    var out = [];
    if (!data || !data.cfg || !data.cfg.rec) return {notifs: out, log: log, changed: false};
    var cfg = data.cfg, rec = cfg.rec, hoy = now.fecha, hm = now.hm, changed = false;
    var mes = hoy.slice(0, 7), dia = +hoy.slice(8, 10);

    // ---- Entrenamiento
    var ent = rec.entreno;
    if (ent && ent.on && hm >= ent.hora && log.entreno !== hoy) {
      var ses = live(data.sesiones);
      var ws = weekStart(hoy), we = addDays(ws, 6);
      var set = {};
      ses.forEach(function (x) { if (x.fecha >= ws && x.fecha <= we) set[x.fecha] = 1; });
      var dias = Object.keys(set).length;
      var meta = cfg.metaSemanal || 4;
      var falta = meta - dias;
      var quedan = 7 - dowMon(hoy);
      var hecho = !!set[hoy];
      var plan = ((cfg.plan || {})[dowMon(hoy)] || []).map(function (k) { return TIPOS[k] || k; });
      if (!hecho && (falta > 0 || plan.length)) {
        var body = plan.length ? 'Hoy toca ' + plan.join(' + ') + '. ' : '';
        if (falta <= 0) body += 'Ya cumpliste la meta: esto suma a la racha.';
        else if (falta > quedan) body += 'Esta semana ya no llegás a la meta, pero cada sesión cuenta.';
        else if (falta === quedan) body += 'Te faltan ' + falta + (falta === 1 ? ' día' : ' días') + ' y queda' + (quedan === 1 ? '' : 'n') + ' ' + quedan + '. Hoy no se puede fallar.';
        else body += 'Llevás ' + dias + ' de ' + meta + ' días esta semana.';
        out.push({title: 'Hora de entrenar', body: body, tag: 'entreno', url: './#entreno'});
      }
      log.entreno = hoy; changed = true;
    }

    // ---- Finanzas
    var fin = rec.finanzas;
    if (fin && fin.on && hm >= fin.hora && log.finanzas !== hoy) {
      var movs = live(data.movs);
      var prev = prevMonth(mes);
      if (dia === 1 && log.resumen !== prev) {
        var ing = 0, gas = 0;
        movs.forEach(function (x) { if (x.fecha.slice(0, 7) === prev) { if (x.tipo === 'ingreso') ing += +x.monto || 0; else gas += +x.monto || 0; } });
        if (ing || gas) {
          var bal = ing - gas;
          out.push({title: 'Cerró ' + MESES[+prev.slice(5) - 1],
            body: 'Ingresos ' + money.format(ing) + ' · Gastos ' + money.format(gas) + ' · Balance ' + (bal < 0 ? '−' : '') + money.format(Math.abs(bal)),
            tag: 'resumen', url: './#finanzas'});
        }
        log.resumen = prev;
      }
      var dim = daysIn(mes);
      var fijosPend = live(data.fijos).filter(function (f) {
        var fecha = mes + '-' + pad(Math.min(+f.dia || 1, dim));
        if (fecha > hoy) return false;
        if ((f.omitidos || []).indexOf(mes) >= 0) return false;
        return !movs.some(function (x) { return x.fijoId === f.id && x.fecha.slice(0, 7) === mes; });
      }).length;
      var vencidos = live(data.cobros).filter(function (c) { return !c.cobrado && c.fecha && c.fecha < hoy; }).length;
      var hoyMov = movs.some(function (x) { return x.fecha === hoy; });
      var partes = [];
      if (fijosPend) partes.push(fijosPend + (fijosPend === 1 ? ' gasto fijo por confirmar' : ' gastos fijos por confirmar'));
      if (vencidos) partes.push(vencidos + (vencidos === 1 ? ' cobro vencido' : ' cobros vencidos'));
      if (partes.length) out.push({title: 'Finanzas pendientes', body: 'Tenés ' + partes.join(' y ') + '.', tag: 'finanzas', url: './#finanzas'});
      else if (!hoyMov) out.push({title: 'Anotá tus movimientos', body: '¿Cobraste o gastaste algo hoy? Cargalo ahora y mantené tus números al día.', tag: 'finanzas', url: './#finanzas'});
      log.finanzas = hoy; changed = true;
    }
    return {notifs: out, log: log, changed: changed};
  }

  var api = {compute: compute};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ApexReminders = api;
})(typeof self !== 'undefined' ? self : this);

/* Apex Hunter — motor de avisos
   Analiza tus datos y solo avisa cuando hay un motivo concreto, con tus números.
   Lo usan la app (avisos en pantalla), el service worker (notificaciones locales)
   y la función /api/cron (push con la app cerrada). */
(function (root) {
  'use strict';

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var DIAS_PL = ['lunes','martes','miércoles','jueves','viernes','sábados','domingos'];
  var TIPOS = {kick: 'Kickboxing', box: 'Boxeo', func: 'Funcional', run: 'Correr', fuerza: 'Fuerza', otro: 'Otro'};
  var moneyF = new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0});
  function money(v) { return moneyF.format(Math.round(v)); }
  function kg(v) { return (Math.round(v * 10) / 10).toLocaleString('es-AR', {minimumFractionDigits: 1, maximumFractionDigits: 1}); }

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function parse(s) { var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function addDays(s, k) { var d = parse(s); d.setUTCDate(d.getUTCDate() + k); return iso(d); }
  function diff(a, b) { return Math.round((parse(a) - parse(b)) / 864e5); }
  function dowMon(s) { return (parse(s).getUTCDay() + 6) % 7; }
  function weekStart(s) { return addDays(s, -dowMon(s)); }
  function daysIn(m) { var p = m.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); }
  function prevMonth(m) { var p = m.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 2, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }
  function live(a) { return (a || []).filter(function (x) { return x && !x.del; }); }
  function sum(a, f) { return a.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function mesN(m) { return MESES[+m.slice(5, 7) - 1]; }

  /* ================= Entrenamiento ================= */
  function entreno(d, hoy) {
    var out = [], cfg = d.cfg || {}, meta = cfg.metaSemanal || 4;
    var ses = live(d.sesiones).filter(function (x) { return x.fecha <= hoy; });
    var pesos = live(d.pesos).filter(function (x) { return x.fecha <= hoy; }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    var ws = weekStart(hoy), dow = dowMon(hoy);
    var plan = ((cfg.plan || {})[dow] || []).map(function (k) { return TIPOS[k] || k; });

    var porDia = {};
    ses.forEach(function (x) { porDia[x.fecha] = 1; });
    var fechas = Object.keys(porDia).sort();
    function diasEnSemana(w, hasta) { var e = hasta || addDays(w, 6); return fechas.filter(function (f) { return f >= w && f <= e; }).length; }
    function carga(w, hasta) { var e = hasta || addDays(w, 6); return sum(ses.filter(function (x) { return x.fecha >= w && x.fecha <= e; }), function (x) { return (+x.min || 0) * (+x.rpe || 0); }); }

    if (fechas.length) {
      var hechoHoy = !!porDia[hoy];
      var dias = diasEnSemana(ws, hoy), falta = meta - dias, quedan = 7 - dow;
      var racha = 0, w = addDays(ws, -7);
      while (diasEnSemana(w) >= meta) { racha++; w = addDays(w, -7); }

      // Carga: esta semana contra el promedio de las 4 anteriores (con al menos 3 con datos)
      var cur = carga(ws, hoy), prev = [1, 2, 3, 4].map(function (k) { return carga(addDays(ws, -7 * k)); });
      var conDatos = prev.filter(function (v) { return v > 0; });
      var avg = conDatos.length >= 3 ? sum(conDatos) / conDatos.length : null;
      var ratio = avg ? cur / avg : null;

      // Hábito: qué tan seguido entrenás este día de la semana (últimas 6 semanas desde que empezaste)
      var primera = fechas[0], semanas = 0, veces = 0;
      for (var k = 1; k <= 6; k++) {
        var w0 = addDays(ws, -7 * k);
        if (addDays(w0, 6) < primera) break;
        semanas++;
        if (porDia[addDays(w0, dow)]) veces++;
      }
      var habitual = semanas >= 3 && veces >= 2 && veces / semanas >= 0.6;

      // Pausa: días desde el último entrenamiento contra tu frecuencia normal
      var antes = fechas.filter(function (f) { return f < hoy; }), ult = antes[antes.length - 1];
      var gap = ult ? diff(hoy, ult) : null;
      var recientes = fechas.filter(function (f) { return f >= addDays(hoy, -60) && f < hoy; }), gaps = [];
      for (var i = 1; i < recientes.length; i++) gaps.push(diff(recientes[i], recientes[i - 1]));
      var gapProm = gaps.length >= 3 ? sum(gaps) / gaps.length : null;

      if (ratio !== null && ratio >= 1.3 && cur > 0) {
        var pct = Math.round((ratio - 1) * 100);
        out.push({k: 'carga', key: 'carga:' + ws + ':' + (ratio >= 1.5 ? 2 : 1), p: ratio >= 1.5 ? 92 : 50, push: !hechoHoy && ratio >= 1.5,
          title: ratio >= 1.5 ? 'Hoy conviene ir suave' : 'Semana más cargada de lo normal',
          body: 'Llevás ' + pct + '% más carga que tu promedio de las últimas semanas (' + Math.round(cur).toLocaleString('es-AR') + ' contra ' + Math.round(avg).toLocaleString('es-AR') + ' puntos). ' +
            (ratio >= 1.5 ? 'Si entrenás, que sea técnica o liviano; si no, descansá.' : 'Si sentís cansancio o dolores, bajá la intensidad.')});
      }
      if (!hechoHoy && !(ratio !== null && ratio >= 1.5)) {
        if (falta > 0 && falta === quedan) {
          out.push({k: 'racha', key: 'racha:' + hoy, p: 100,
            title: racha ? 'Tu racha de ' + plural(racha, 'semana', 'semanas') + ' está en juego' : 'Hoy define la semana',
            body: 'Llevás ' + dias + ' de ' + meta + ' días y ' + (quedan === 1 ? 'queda solo hoy' : 'quedan ' + quedan + ' días contando hoy') + '. Si hoy no entrenás, no llegás a la meta.'});
        } else if (falta > 0 && habitual) {
          out.push({k: 'habito', key: 'habito:' + hoy, p: 70,
            title: 'Los ' + DIAS_PL[dow] + ' solés entrenar',
            body: 'Entrenaste ' + veces + ' de los últimos ' + semanas + ' ' + DIAS_PL[dow] + (plan.length ? ' y tu plan dice ' + plan.join(' + ') : '') + '. Hoy todavía no cargaste nada.'});
        } else if (falta > 0 && gap !== null && gap >= 3 && gapProm !== null && gap >= gapProm * 1.8) {
          out.push({k: 'pausa', key: 'pausa:' + ult, p: 65,
            title: 'Van ' + gap + ' días sin entrenar',
            body: 'Normalmente entrenás cada ' + (Math.round(gapProm * 10) / 10).toLocaleString('es-AR') + ' días. Volver hoy, aunque sean 30 minutos, corta la pausa.'});
        } else if (falta > 0 && plan.length) {
          out.push({k: 'plan', key: 'plan:' + hoy, p: 55,
            title: 'Hoy toca ' + plan.join(' + '),
            body: 'Llevás ' + dias + ' de ' + meta + ' días esta semana. ' + (falta === 1 ? 'Con hoy cumplís la meta.' : 'Te faltan ' + falta + '.')});
        }
      }
    }

    // Peso: si nunca lo cargaste, solo una sugerencia en la app; si ya lo seguís, el pesaje semanal
    if (!pesos.length && cfg.pesoSkip !== ws) out.push({k: 'peso', key: 'peso0:' + ws, p: 20, push: false, title: 'Empezá a seguir tu peso', body: 'Cargalo una vez por semana y te muestro cómo cambia mes a mes.'});
    if (pesos.length && cfg.pesoSkip !== ws) {
      var u = pesos[pesos.length - 1], hace = diff(hoy, u.fecha);
      if (u.fecha < ws && hace >= 7) {
        var mesAtras = pesos.filter(function (x) { return x.fecha <= addDays(hoy, -28); }).pop();
        out.push({k: 'peso', key: 'peso:' + ws, p: 30, push: dow >= 5 || hace >= 9,
          title: 'Pesaje de la semana',
          body: 'La última vez marcaste ' + kg(u.kg) + ' kg, hace ' + hace + ' días' +
            (mesAtras && mesAtras !== u ? ' (' + (u.kg - mesAtras.kg >= 0 ? '+' : '−') + kg(Math.abs(u.kg - mesAtras.kg)) + ' kg en el mes)' : '') + '. Pesate en ayunas para comparar igual.'});
      }
    }
    return out.sort(function (a, b) { return b.p - a.p; });
  }

  /* ================= Finanzas ================= */
  function finanzas(d, hoy) {
    var out = [], cfg = d.cfg || {};
    var movs = live(d.movs), mes = hoy.slice(0, 7), dia = +hoy.slice(8, 10), dim = daysIn(mes), pm = prevMonth(mes);
    if (!movs.length && !live(d.fijos).length && !live(d.cobros).length) return out;

    // Cierre del mes anterior (día 1)
    if (dia === 1) {
      var tot = function (m) { var r = {ing: 0, gas: 0, cat: {}}; movs.forEach(function (x) { if (x.fecha.slice(0, 7) !== m) return; var v = +x.monto || 0; if (x.tipo === 'ingreso') r.ing += v; else { r.gas += v; r.cat[x.categoria] = (r.cat[x.categoria] || 0) + v; } }); return r; };
      var a = tot(pm), b = tot(prevMonth(pm));
      if (a.ing || a.gas) {
        var bal = a.ing - a.gas, extra = '';
        var subas = Object.keys(a.cat).map(function (c) { return [c, a.cat[c] - (b.cat[c] || 0)]; }).sort(function (x, y) { return y[1] - x[1]; });
        if ((b.ing || b.gas) && subas.length && subas[0][1] > 0) extra = ' Lo que más subió: ' + subas[0][0] + ' (+' + money(subas[0][1]) + ').';
        out.push({k: 'cierre', key: 'cierre:' + pm, p: 100,
          title: 'Cerró ' + mesN(pm) + ': ' + (bal < 0 ? '−' : '+') + money(Math.abs(bal)),
          body: 'Entraron ' + money(a.ing) + ' y salieron ' + money(a.gas) + (a.ing > 0 ? ' (ahorraste ' + Math.round(bal / a.ing * 100) + '%)' : '') + '.' + extra});
      }
    }

    // Fijos que vencen hoy o ya vencieron sin confirmar
    var fijosPend = live(d.fijos).map(function (f) {
      var fecha = mes + '-' + pad(Math.min(+f.dia || 1, dim));
      var ok = movs.some(function (x) { return x.fijoId === f.id && x.fecha.slice(0, 7) === mes; }) || (f.omitidos || []).indexOf(mes) >= 0;
      return {f: f, fecha: fecha, ok: ok};
    }).filter(function (e) { return !e.ok && e.fecha <= hoy; });
    if (fijosPend.length) {
      var hoyV = fijosPend.filter(function (e) { return e.fecha === hoy; });
      var lista = fijosPend.slice(0, 3).map(function (e) { return e.f.desc + ' (' + money(e.f.monto) + ')'; }).join(', ') + (fijosPend.length > 3 ? ' y ' + (fijosPend.length - 3) + ' más' : '');
      var atraso = Math.max.apply(null, fijosPend.map(function (e) { return diff(hoy, e.fecha); }));
      out.push({k: 'fijos', key: 'fijos:' + hoy, p: hoyV.length ? 95 : 80, push: hoyV.length > 0 || atraso === 3 || atraso === 7,
        title: hoyV.length ? 'Hoy vence ' + hoyV.map(function (e) { return e.f.desc; }).join(' y ') : plural(fijosPend.length, 'fijo sin confirmar', 'fijos sin confirmar'),
        body: 'Pendiente: ' + lista + '. Confirmalo en la app cuando lo pagues.'});
    }

    // Cobros: mañana, hoy y atrasados (avisa a 1, 3, 7 días y después cada semana)
    live(d.cobros).filter(function (c) { return !c.cobrado && c.fecha; }).forEach(function (c) {
      var dd = diff(hoy, c.fecha), quien = c.cliente + (c.concepto ? ' (' + c.concepto + ')' : '');
      if (dd === -1) out.push({k: 'cobro', key: 'cobro:' + c.id + ':-1', p: 60, title: 'Mañana te tendría que pagar ' + c.cliente, body: quien + ': ' + money(c.monto) + '. Si no llega, ya sabés a quién escribirle.'});
      else if (dd === 0) out.push({k: 'cobro', key: 'cobro:' + c.id + ':0', p: 85, title: 'Hoy vence el cobro de ' + c.cliente, body: quien + ': ' + money(c.monto) + '. Marcalo como cobrado cuando entre.'});
      else if (dd > 0) {
        var marca = dd === 1 || dd === 3 || dd === 7 || (dd > 7 && dd % 7 === 0);
        out.push({k: 'cobro', key: 'cobro:' + c.id + ':' + dd, p: 88, push: marca, title: c.cliente + ' lleva ' + plural(dd, 'día', 'días') + ' de atraso', body: quien + ': ' + money(c.monto) + ' sin cobrar desde el ' + +c.fecha.slice(8) + '/' + +c.fecha.slice(5, 7) + '.'});
      }
    });

    // Presupuestos: pasados, o que a este ritmo se pasan
    var pres = cfg.presupuestos || {};
    Object.keys(pres).forEach(function (cat) {
      var b = +pres[cat]; if (!(b > 0)) return;
      var gastado = sum(movs.filter(function (x) { return x.tipo === 'gasto' && x.categoria === cat && x.fecha.slice(0, 7) === mes && x.fecha <= hoy; }), function (x) { return +x.monto || 0; });
      if (!gastado) return;
      var proy = gastado / dia * dim, quedanD = dim - dia;
      if (gastado >= b) out.push({k: 'presupuesto', key: 'pres:' + cat + ':' + mes + ':100', p: 75, title: 'Te pasaste en ' + cat, body: 'Llevás ' + money(gastado) + ' de ' + money(b) + ' (' + money(gastado - b) + ' de más)' + (quedanD ? ' y quedan ' + plural(quedanD, 'día', 'días') + ' del mes.' : '.')});
      else if (dia >= 7 && quedanD > 0 && proy >= b * 1.1) out.push({k: 'presupuesto', key: 'pres:' + cat + ':' + mes + ':proy', p: 70, title: cat + ': a este ritmo te pasás', body: 'Llevás ' + money(gastado) + ' de ' + money(b) + ' y faltan ' + plural(quedanD, 'día', 'días') + '. Siguiendo así cerrás cerca de ' + money(proy) + '.'});
      else if (gastado >= b * 0.8) out.push({k: 'presupuesto', key: 'pres:' + cat + ':' + mes + ':80', p: 62, title: cat + ': usaste el ' + Math.round(gastado / b * 100) + '%', body: 'Te quedan ' + money(b - gastado) + ' para ' + plural(quedanD, 'día', 'días') + '.'});
    });

    // Ritmo de gasto contra el mes anterior al mismo día
    if (dia >= 7) {
      var corte = pm + '-' + pad(Math.min(dia, daysIn(pm)));
      var gA = movs.filter(function (x) { return x.tipo === 'gasto' && x.fecha.slice(0, 7) === mes && x.fecha <= hoy; });
      var gB = movs.filter(function (x) { return x.tipo === 'gasto' && x.fecha.slice(0, 7) === pm && x.fecha <= corte; });
      var tA = sum(gA, function (x) { return +x.monto || 0; }), tB = sum(gB, function (x) { return +x.monto || 0; });
      var totPm = sum(movs.filter(function (x) { return x.tipo === 'gasto' && x.fecha.slice(0, 7) === pm; }), function (x) { return +x.monto || 0; });
      if (tB > 0 && tA >= tB * 1.25 && (tA - tB) >= totPm * 0.05) {
        var porCat = {};
        gA.forEach(function (x) { porCat[x.categoria] = (porCat[x.categoria] || 0) + (+x.monto || 0); });
        gB.forEach(function (x) { porCat[x.categoria] = (porCat[x.categoria] || 0) - (+x.monto || 0); });
        var top = Object.keys(porCat).sort(function (x, y) { return porCat[y] - porCat[x]; })[0];
        out.push({k: 'ritmo', key: 'ritmo:' + weekStart(hoy), p: 58,
          title: 'Estás gastando más que en ' + mesN(pm),
          body: 'Llevás ' + money(tA) + '; a esta altura de ' + mesN(pm) + ' eran ' + money(tB) + ' (+' + Math.round((tA / tB - 1) * 100) + '%).' + (top && porCat[top] > 0 ? ' Lo que más subió: ' + top + ' (+' + money(porCat[top]) + ').' : '')});
      }
    }

    // Registro: si solés cargar seguido y hace días que no cargás nada
    var fM = movs.map(function (x) { return x.fecha; }).filter(function (f) { return f <= hoy; }).sort();
    var rec60 = fM.filter(function (f) { return f >= addDays(hoy, -60); });
    var distintos = rec60.filter(function (f, i) { return rec60.indexOf(f) === i; });
    if (distintos.length >= 8) {
      var ultM = fM[fM.length - 1], sin = diff(hoy, ultM), cada = 60 / distintos.length;
      if (sin >= 4 && sin >= cada * 2.5) out.push({k: 'registro', key: 'registro:' + ultM, p: 40,
        title: 'Hace ' + sin + ' días que no cargás movimientos',
        body: 'Solés anotar algo cada ' + Math.max(1, Math.round(cada)) + ' días. Si gastaste o cobraste algo, cargalo antes de olvidarte.'});
    }
    return out.sort(function (a, b) { return b.p - a.p; });
  }

  function insights(data, hoy) {
    if (!data) return {entreno: [], finanzas: []};
    return {entreno: entreno(data, hoy), finanzas: finanzas(data, hoy)};
  }

  /* Elige qué notificar: a la hora que configuraste, como mucho un aviso por área por día,
     el más importante, y nunca el mismo dos veces. Si no hay nada que valga la pena, no manda nada.
     now: {fecha:'YYYY-MM-DD', hm:'HH:MM'} en tu hora local. */
  function compute(data, now, log) {
    log = Object.assign({}, log || {});
    log.sent = Object.assign({}, log.sent || {});
    var notifs = [], changed = false;
    if (!data || !data.cfg || !data.cfg.rec) return {notifs: notifs, log: log, changed: false};
    var rec = data.cfg.rec, hoy = now.fecha, hm = now.hm, ins = insights(data, hoy);
    [['entreno', 'entreno', './#entreno'], ['finanzas', 'finanzas', './#finanzas']].forEach(function (a) {
      var r = rec[a[0]];
      if (!r || !r.on || hm < r.hora || log[a[0]] === hoy) return;
      var cand = ins[a[1]].filter(function (x) { return x.push !== false && !log.sent[x.key]; });
      if (cand.length) {
        var n = cand[0];
        notifs.push({title: n.title, body: n.body, tag: a[0] + ':' + n.k, url: a[2]});
        log.sent[n.key] = hoy;
      }
      log[a[0]] = hoy; changed = true;
    });
    if (changed) { var lim = addDays(hoy, -60); Object.keys(log.sent).forEach(function (k) { if (log.sent[k] < lim) delete log.sent[k]; }); }
    return {notifs: notifs, log: log, changed: changed};
  }

  var api = {compute: compute, insights: insights};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ApexReminders = api;
})(typeof self !== 'undefined' ? self : this);

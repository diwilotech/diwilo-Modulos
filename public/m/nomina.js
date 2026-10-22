// Página del módulo Nómina (Colombia): resumen, empleados, novedades, corridas de nómina (con pago a Finanzas), liquidaciones y parámetros.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud, { money, num, day, chip } = C;
  const B = '/api/nomina', RO = me.business.readOnly;
  const $ = (s, el = document) => el.querySelector(s);
  const hoy = C.todayCo(), mesHoy = hoy.slice(0, 7);
  const VIEWS = [['resumen', 'Resumen', 'bi-graph-up'], ['calendario', 'Calendario de pagos', 'bi-calendar3'], ['empleados', 'Empleados', 'bi-people'], ['contratistas', 'Contratistas', 'bi-person-badge'], ['prestaciones', 'Prestaciones', 'bi-piggy-bank'], ['novedades', 'Novedades', 'bi-lightning-charge'], ['corridas', 'Nómina', 'bi-cash-stack'], ['liquidaciones', 'Liquidaciones', 'bi-door-open'], ['parametros', 'Parámetros', 'bi-sliders']];
  let view = (location.hash || '#resumen').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'resumen';
  const ESTADO = { borrador: ['soon', 'Borrador'], aprobada: ['ok', 'Aprobada'], pagada: ['free', 'Pagada'] };
  const TIPO = { nomina: 'Nómina', prima: 'Prima de servicios', cesantias: 'Cesantías' };
  const HALF = { M: 'Mes completo', 1: 'Primera quincena', 2: 'Segunda quincena' };
  const MOTIVO = [['renuncia', 'Renuncia'], ['sin_justa_causa', 'Despido sin justa causa'], ['con_justa_causa', 'Despido con justa causa'], ['mutuo_acuerdo', 'Mutuo acuerdo'], ['terminacion_contrato', 'Terminación del contrato']];

  if (!document.getElementById('nom-css')) document.head.insertAdjacentHTML('beforeend', `<style id="nom-css">
    .nom-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))}
    .nom-card{border:1px solid var(--dw-borde,rgba(128,128,128,.25));border-radius:16px;background:var(--dw-tarjeta,var(--bs-body-bg));padding:16px;display:flex;flex-direction:column;gap:10px}
    .nom-av{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;background:var(--dw-p,#6d3fd6);flex:none}
    .nom-av--c{background:#0d9488}.nom-big{font-size:1.5rem;font-weight:700;line-height:1.1}
    .nom-line{display:flex;gap:8px;justify-content:space-between;font-size:.9rem;padding:3px 0;border-bottom:1px dashed var(--dw-borde,rgba(128,128,128,.25))}
    .nom-line:last-child{border-bottom:0}.nom-line span:first-child{min-width:0;overflow-wrap:anywhere}.nom-neg{color:var(--bs-danger,#dc3545)}
    .nom-auto{border-radius:16px;padding:14px 16px;background:linear-gradient(135deg,rgba(var(--dw-p-rgb,109,63,214),.14),rgba(var(--dw-p-rgb,109,63,214),.03));border:1px solid rgba(var(--dw-p-rgb,109,63,214),.25)}
    .nom-tot{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}.nom-tot>div{background:rgba(128,128,128,.08);border-radius:12px;padding:8px 4px}
    .nom-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.nom-cal .h{font-size:.7rem;text-align:center;color:var(--bs-secondary-color);text-transform:uppercase}
    .nom-day{min-height:92px;border:1px solid var(--dw-borde,rgba(128,128,128,.25));border-radius:10px;padding:4px;display:flex;flex-direction:column;gap:3px;background:var(--dw-tarjeta,var(--bs-body-bg));overflow:hidden}
    .nom-day.off{opacity:.35;border-style:dashed}.nom-day .n{font-size:.75rem;font-weight:600;color:var(--bs-secondary-color)}.nom-day.hoy{outline:2px solid var(--dw-p,#6d3fd6)}
    .nom-ev{font-size:.68rem;line-height:1.15;border-radius:6px;padding:2px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .nom-ev.pago{background:rgba(13,148,136,.18);color:var(--bs-body-color)}.nom-ev.obligacion{background:rgba(234,88,12,.18)}.nom-ev.prestacion{background:rgba(var(--dw-p-rgb,109,63,214),.2)}
    .nom-agenda{display:none}.nom-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:rgba(128,128,128,.12)}.nom-bar i{display:block;height:100%}
    .nom-part{display:flex;align-items:center;gap:8px;font-size:.9rem;padding:4px 0}.nom-part .dot{width:10px;height:10px;border-radius:3px;flex:none}
    @media (max-width:700px){.nom-cal{display:none}.nom-agenda{display:block}}
    .nom-tot small{display:block;color:var(--bs-secondary-color);font-size:.7rem}.nom-click{cursor:pointer;transition:box-shadow .15s}.nom-click:hover{box-shadow:0 4px 18px rgba(0,0,0,.12)}
  </style>`);
  const iniciales = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');
  let KINDS = {};

  const seg = $('[data-seg]');
  C.seg(seg, VIEWS, (k) => { view = k; render(); }, view);
  function render() {
    history.replaceState(null, '', `#${view}`);
    $('[data-acciones]').innerHTML = '';
    const old = $('[data-view]'), el = old.cloneNode(false); old.replaceWith(el);
    ({ resumen, calendario, empleados, contratistas, prestaciones, novedades, corridas, liquidaciones, parametros })[view](el).catch((x) => { el.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; });
  }
  const cuentas = async () => (await api('/api/finanzas/accounts?limit=200').catch(() => ({ rows: [] }))).rows;

  /* ---------------- resumen ---------------- */
  async function resumen(el) {
    el.innerHTML = `<div class="nom-auto d-flex flex-wrap align-items-center gap-3 mb-3"><i class="bi bi-magic fs-3"></i><div class="flex-grow-1"><b>La nómina se mantiene sola.</b>
        <div class="small text-body-secondary">Cada día deja al día el borrador del mes y la cuenta de cobro de cada contratista (cada clase y cada cargo por separado). Tú solo revisas, apruebas y pagas.</div></div>
        <label class="small text-body-secondary mb-0">Mes <input class="form-control form-control-sm d-inline-block w-auto" type="month" data-mes value="${mesHoy}"></label>${RO ? '' : '<button class="btn btn-primary btn-sm" data-gen><i class="bi bi-arrow-repeat me-1"></i>Actualizar ahora</button>'}</div>
      <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div class="row g-3"><div class="col-lg-7"><div class="nom-card h-100"><h2 class="h6 mb-0">Nóminas del mes</h2><div data-runs></div></div></div>
      <div class="col-lg-5"><div class="nom-card h-100"><h2 class="h6 mb-0">Próximas obligaciones</h2><div data-obl></div><p class="small text-body-secondary mb-0">Los aportes (PILA) y la retención en la fuente se pagan cada mes según el último dígito del NIT.</p></div></div></div>`;
    const load = async () => {
      const s = await api(`${B}/summary?period=${$('[data-mes]', el).value || mesHoy}`);
      C.kpis($('[data-kpis]', el), [['Personas activas', num(s.empleados), '', 'bi-people'], ['Devengado estimado', money(s.devengado), `neto ${money(s.neto)}`, 'bi-cash-stack'], ['Aportes del empleador', money(s.aportes), 'salud, pensión, ARL, caja, SENA, ICBF', 'bi-shield-check'],
        ['Provisiones', money(s.provisiones), 'cesantías, intereses, prima, vacaciones', 'bi-piggy-bank'], ['Costo total del mes', money(s.costo), s.parametros_estimados ? 'con parámetros estimados' : `SMMLV ${money(s.smmlv)}`, 'bi-calculator']]);
      $('[data-runs]', el).innerHTML = s.corridas.length ? s.corridas.map((r) => `<div class="d-flex align-items-center gap-2 py-1"><i class="bi bi-cash-stack"></i><span class="flex-grow-1">${esc(TIPO[r.tipo])}${r.tipo === 'nomina' && r.half !== 'M' ? ` · ${esc(HALF[r.half])}` : ''}</span><b>${money(r.neto)}</b>${chip(...ESTADO[r.status])}<button class="btn btn-sm btn-outline-primary" data-run="${r.id}">Abrir</button></div>`).join('') : '<div class="small text-body-secondary">Todavía no hay empleados: regístralos y la nómina del mes aparece aquí sola.</div>';
      $('[data-obl]', el).innerHTML = s.obligaciones.map((o) => `<div class="d-flex gap-2 py-1"><i class="bi bi-calendar-event"></i><span><b>${day(o.fecha)}</b> · ${esc(o.que)}</span></div>`).join('') || '<div class="small text-body-secondary">Sin fechas próximas.</div>';
    };
    $('[data-mes]', el).addEventListener('change', load);
    $('[data-gen]', el)?.addEventListener('click', async () => { try { const r = await api(`${B}/servicios/generar`, { method: 'POST', body: { period: $('[data-mes]', el).value || mesHoy } }); toast(`Al día: ${r.cuentas_de_cobro || 0} cuentas de cobro de contratistas`); load(); } catch (x) { toast(x.message, false); } });
    el.onclick = (e) => { const b = e.target.closest('[data-run]'); if (b) detalle(+b.dataset.run); };
    await load();
  }

  /* ---------------- calendario de pagos: del negocio y por empleado ---------------- */
  const PARTES = [['empleado', 'Empleado (neto)', '#0d9488'], ['eps', 'Salud (EPS)', '#2563eb'], ['afp', 'Pensión (AFP)', '#7c3aed'], ['arl', 'ARL', '#db2777'], ['caja', 'Caja de compensación', '#ea580c'], ['sena', 'SENA', '#ca8a04'], ['icbf', 'ICBF', '#65a30d'],
    ['dian', 'DIAN (retención)', '#64748b'], ['cesantias', 'Cesantías', '#0891b2'], ['intereses', 'Intereses de cesantías', '#06b6d4'], ['prima', 'Prima de servicios', '#9333ea'], ['vacaciones', 'Vacaciones', '#16a34a']];
  const FREQ = { mensual: 'Mensual · último día del mes', quincenal: 'Quincenal · el 15 y el último día', semanal: 'Semanal · cada viernes' };
  let calMes = mesHoy, calEmp = '';
  async function calendario(el) {
    const emps = (await api(`${B}/employees?limit=1000`)).rows.filter((e) => e.status === 'activo');
    if (calEmp && !emps.some((e) => String(e.id) === String(calEmp))) calEmp = '';
    const mover = (n) => { const [y, m] = calMes.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1)); calMes = d.toISOString().slice(0, 7); render(); };
    const d = await api(`${B}/calendario?period=${calMes}${calEmp ? `&employee_id=${calEmp}` : ''}`);
    const t = d.totales, uno = d.empleados.length === 1 && calEmp ? d.empleados[0] : null;
    const [y, m] = calMes.split('-').map(Number), primero = new Date(Date.UTC(y, m - 1, 1)), dias = +d.ultimo_dia.slice(8), lead = (primero.getUTCDay() + 6) % 7;
    const evDe = (f) => d.eventos.filter((e) => e.fecha === f);
    const celdas = [...Array(lead).fill(null), ...Array.from({ length: dias }, (_, i) => `${calMes}-${String(i + 1).padStart(2, '0')}`)];
    while (celdas.length % 7) celdas.push(null);
    const nombreMes = primero.toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const partesTot = PARTES.map(([k, l, c]) => [k, l, c, uno ? uno.partes[k] : t[k === 'empleado' ? 'empleados' : k]]).filter((x) => x[3] > 0);
    const suma = partesTot.reduce((a, x) => a + x[3], 0) || 1;
    el.innerHTML = `<div class="alert alert-info py-2 small d-flex gap-2"><i class="bi bi-info-circle fs-5"></i><div><b>Calendario administrativo de 360 días.</b> Para la nómina todos los meses valen 30 días (febrero también): un mes completo siempre paga lo mismo, y el sueldo se divide en 30. Las fechas de pago son las de cada mes calendario (si cae en fin de semana o festivo, se paga el día hábil anterior) y puedes cambiarlas pactándolo con cada persona.</div></div>
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3"><div class="btn-group"><button class="btn btn-outline-secondary" data-mv="-1" aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button><button class="btn btn-outline-secondary text-capitalize" style="min-width:160px" data-hoy>${esc(nombreMes)}</button><button class="btn btn-outline-secondary" data-mv="1" aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button></div>
        <select class="form-select w-auto" data-emp aria-label="Ver"><option value="">Todo el negocio · ${emps.length} personas</option>${emps.map((e) => `<option value="${e.id}" ${String(e.id) === String(calEmp) ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
        <span class="small text-body-secondary">${uno ? esc(FREQ[uno.pay_freq]) : 'Cada color es un tipo de fecha: pagos, obligaciones y prestaciones'}</span></div>
      <div class="dw-grid dw-grid--kpi mb-3" data-k></div>
      <div class="row g-3 mb-3"><div class="col-lg-8"><div class="nom-card h-100"><div class="d-flex flex-wrap gap-3 small"><span><i class="bi bi-square-fill" style="color:#0d9488"></i> Pago a la persona</span><span><i class="bi bi-square-fill" style="color:#ea580c"></i> Obligación (aportes, retención)</span><span><i class="bi bi-square-fill" style="color:#9333ea"></i> Prestación social</span></div>
          <div class="nom-cal">${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((x) => `<div class="h">${x}</div>`).join('')}${celdas.map((f) => !f ? '<div class="nom-day off"></div>' : `<div class="nom-day ${f === hoy ? 'hoy' : ''}"><span class="n">${+f.slice(8)}${+f.slice(8) === 30 && dias !== 30 ? '<span title="Cierre comercial: el día 30 del mes de 360 días" class="text-body-secondary"> · c30</span>' : ''}</span>${evDe(f).map((e) => `<div class="nom-ev ${e.tipo}" title="${esc(`${e.titulo}${e.detalle ? ` · ${e.detalle}` : ''}${e.valor ? ` · ${money(e.valor)}` : ''}`)}">${e.tipo === 'pago' ? `${esc(e.titulo.split(' ')[0])} ${money(e.valor)}` : esc(e.titulo)}</div>`).join('')}</div>`).join('')}</div>
          <div class="nom-agenda">${d.eventos.map((e) => `<div class="nom-line"><span><b>${day(e.fecha)}${e.hasta ? ` a ${day(e.hasta)}` : ''}</b> · ${esc(e.titulo)}${e.detalle ? `<span class="text-body-secondary"> · ${esc(e.detalle)}</span>` : ''}</span>${e.valor ? `<b>${money(e.valor)}</b>` : ''}</div>`).join('') || '<div class="small text-body-secondary">Sin fechas este mes.</div>'}</div></div></div>
        <div class="col-lg-4"><div class="nom-card h-100"><h2 class="h6 mb-0">${uno ? `¿A quién va lo de ${esc(uno.name.split(' ')[0])}?` : '¿A quién se le paga este mes?'}</h2>
          <div class="nom-bar">${partesTot.map(([, l, c, v]) => `<i style="width:${(v / suma) * 100}%;background:${c}" title="${esc(l)} ${money(v)}"></i>`).join('')}</div>
          <div>${partesTot.map(([, l, c, v]) => `<div class="nom-part"><span class="dot" style="background:${c}"></span><span class="flex-grow-1">${esc(l)}</span><b>${money(v)}</b><span class="small text-body-secondary" style="width:38px;text-align:right">${Math.round((v / suma) * 100)}%</span></div>`).join('') || '<div class="small text-body-secondary">No hay personas vinculadas este mes.</div>'}</div></div></div></div>
      <div data-detalle></div>`;
    C.kpis($('[data-k]', el), [['A pagar a las personas', money(uno ? uno.neto : t.empleados), 'neto después de descuentos', 'bi-wallet2'], ['Seguridad social y parafiscales', money(uno ? uno.aportes : t.aportes), 'a cargo del empleador', 'bi-shield-check'], ['Retención (DIAN)', money(uno ? uno.partes.dian : t.dian), 'se paga el mes siguiente', 'bi-bank'],
      ['Provisiones', money(uno ? uno.provisiones : t.provisiones), 'cesantías, intereses, prima y vacaciones', 'bi-piggy-bank'], [uno ? `Cuánto cuesta ${uno.name.split(' ')[0]}` : 'Costo total del mes', money(uno ? uno.costo : t.costo), 'devengado + aportes + provisiones', 'bi-calculator']]);
    const det = $('[data-detalle]', el);
    if (uno) {
      const lin = (a, v, neg) => (v ? `<div class="nom-line"><span>${esc(a)}</span><b class="${neg ? 'nom-neg' : ''}">${neg ? '−' : ''}${money(v)}</b></div>` : '');
      const x = uno.desglose;
      det.innerHTML = `<div class="row g-3"><div class="col-lg-6"><div class="nom-card h-100"><h2 class="h6 mb-0">Lo que se le paga a ${esc(uno.name.split(' ')[0])}</h2>
          ${uno.conceptos.filter((c) => c.tipo === 'dev').map((c) => lin(c.c, c.valor)).join('')}<div class="nom-line"><span><b>Devengado</b></span><b>${money(uno.devengado)}</b></div>
          ${uno.conceptos.filter((c) => c.tipo === 'ded').map((c) => lin(c.c, c.valor, true)).join('')}<div class="nom-line"><span><b>Neto a pagar</b></span><b>${money(uno.neto)}</b></div>
          <h3 class="h6 mt-2 mb-0">Fechas de pago</h3>${uno.pagos.map((g) => `<div class="nom-line"><span><i class="bi bi-calendar-check me-1"></i>${day(g.fecha)} · ${esc(g.etiqueta)}</span><b>${money(g.valor)}</b></div>`).join('')}</div></div>
        <div class="col-lg-6"><div class="nom-card h-100"><h2 class="h6 mb-0">Cuánto cuesta al mes</h2>${lin('Devengado', uno.devengado)}${lin('Salud del empleador', x.aportes.salud)}${lin('Pensión del empleador', x.aportes.pension)}${lin('ARL', x.aportes.arl)}${lin('Caja de compensación', x.aportes.caja)}${lin('SENA', x.aportes.sena)}${lin('ICBF', x.aportes.icbf)}
          ${lin('Cesantías (provisión)', x.provisiones.cesantias)}${lin('Intereses de cesantías (provisión)', x.provisiones.intereses)}${lin('Prima (provisión)', x.provisiones.prima)}${lin('Vacaciones (provisión)', x.provisiones.vacaciones)}
          <div class="nom-line"><span><b>Costo total</b></span><b>${money(uno.costo)}</b></div>${x.aportes.exonerado ? '<div class="small text-body-secondary">Exonerado de salud, SENA e ICBF (art. 114-1 E.T.).</div>' : ''}</div></div></div>`;
    } else {
      det.innerHTML = `<div class="nom-card"><h2 class="h6 mb-0">Cada empleado: cuándo se le paga y cuánto cuesta</h2><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Empleado</th><th>Fechas de pago</th><th class="text-end">Neto</th><th class="text-end">Aportes</th><th class="text-end">Provisiones</th><th class="text-end">Costo</th></tr></thead>
        <tbody>${d.empleados.map((e) => `<tr class="nom-click" data-emp="${e.id}"><td><b>${esc(e.name)}</b>${sub(`${FREQ[e.pay_freq].split(' · ')[0]}${e.contract_type === 'prestacion' ? ' · contratista' : ''}`)}</td>
          <td>${e.pagos.map((g) => `<span class="badge text-bg-light me-1" title="${esc(`${g.etiqueta}: ${money(g.valor)}`)}">${+g.fecha.slice(8)}</span>`).join('')}<span class="small text-body-secondary">de ${esc(nombreMes.split(' ')[0])}</span></td>
          <td class="text-end">${money(e.neto)}</td><td class="text-end">${money(e.aportes)}</td><td class="text-end">${money(e.provisiones)}</td><td class="text-end"><b>${money(e.costo)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="text-body-secondary">No hay personas vinculadas este mes.</td></tr>'}</tbody></table></div><div class="small text-body-secondary">Toca una persona para ver su calendario y cuánto cuesta.</div></div>`;
    }
    el.onclick = (e) => {
      const mv = e.target.closest('[data-mv]'); if (mv) return mover(+mv.dataset.mv);
      if (e.target.closest('[data-hoy]')) { calMes = mesHoy; return render(); }
      const r = e.target.closest('tr[data-emp]'); if (r) { calEmp = r.dataset.emp; render(); }
    };
    $('[data-emp]', el).addEventListener('change', (e) => { calEmp = e.target.value; render(); });
  }

  /* ---------------- prestaciones sociales ---------------- */
  async function prestaciones(el) {
    const d = await api(`${B}/prestaciones?year=${mesHoy.slice(0, 4)}`), t = d.totales, mesN = +mesHoy.slice(5, 7);
    const estadoChip = (h) => (h.estado ? chip(h.estado.status === 'pagada' ? 'ok' : h.estado.status === 'aprobada' ? 'soon' : 'free', h.estado.status === 'pagada' ? 'Pagada' : h.estado.status === 'aprobada' ? 'Aprobada: falta pagar' : 'Borrador') : h.vencida ? chip('bad', 'Fecha pasada') : chip('free', 'Pendiente'));
    const hito = (h) => `<div class="nom-card"><div class="d-flex align-items-center gap-2"><i class="bi bi-calendar-event fs-4"></i><div class="flex-grow-1"><b>${esc(h.que)}</b><div class="small text-body-secondary">Hasta el ${day(h.fecha)}</div></div>${estadoChip(h)}</div>
      ${h.valor != null ? `<div class="nom-big">${money(h.valor)}</div>` : '<div class="small text-body-secondary">Se consigna lo liquidado con las cesantías del año.</div>'}
      ${h.tipo && !RO ? (h.estado ? `<button class="btn btn-sm btn-outline-primary" data-run="${h.estado.run_id}">Abrir la liquidación</button>` : `<button class="btn btn-sm btn-primary" data-liq="${h.tipo}|${h.period}" ${+h.period.slice(5) === 6 ? (mesN >= 6 ? '' : 'disabled title="Se liquida desde junio"') : (mesN >= 12 ? '' : 'disabled title="Se liquida en diciembre"')}>Liquidar la prima</button>`) : ''}</div>`;
    const ces = d.cesantias_anio;
    el.innerHTML = `<div class="alert alert-info py-2 small d-flex gap-2"><i class="bi bi-info-circle fs-5"></i><div><b>Qué se causa.</b> Cesantías: un mes de sueldo por año (1/12). Intereses: 12 % anual de las cesantías. Prima: medio mes por semestre. Vacaciones: 15 días hábiles por año trabajado. Todo con el calendario de 360 días y sobre el sueldo más el auxilio de transporte. No aplica a salario integral, aprendices ni contratistas por prestación de servicios.${d.parametros_estimados ? ' <b>Parámetros del año estimados: revísalos en Parámetros.</b>' : ''}</div></div>
      <div class="dw-grid dw-grid--kpi mb-3" data-k></div>
      <h2 class="h6">Fechas y pagos del año</h2><div class="nom-grid mb-4">${d.hitos.map(hito).join('')}
        <div class="nom-card"><div class="d-flex align-items-center gap-2"><i class="bi bi-bank fs-4"></i><div class="flex-grow-1"><b>Cesantías e intereses ${d.year}</b><div class="small text-body-secondary">Se consignan al fondo hasta el ${day(ces.fecha)}</div></div>${ces.estado ? chip(ces.estado.status === 'pagada' ? 'ok' : 'soon', ces.estado.status === 'pagada' ? 'Pagada' : 'En proceso') : chip('free', 'Causándose')}</div>
          <div class="nom-big">${money(ces.valor + ces.intereses)}</div><div class="small text-body-secondary">${money(ces.valor)} cesantías + ${money(ces.intereses)} intereses, causado hasta hoy</div>
          ${RO ? '' : ces.estado ? `<button class="btn btn-sm btn-outline-primary" data-run="${ces.estado.run_id}">Abrir la liquidación</button>` : `<button class="btn btn-sm btn-primary" data-liq="cesantias|${d.year}-12" ${mesN >= 12 ? '' : 'disabled title="Se liquida en diciembre"'}>Liquidar cesantías e intereses</button>`}</div></div>
      <h2 class="h6">Por persona (causado hasta hoy)</h2><div class="nom-grid">${d.personas.map((x) => `<div class="nom-card"><div class="d-flex align-items-center gap-2"><span class="nom-av">${esc(iniciales(x.name))}</span><div class="flex-grow-1" style="min-width:0"><b class="d-block text-truncate">${esc(x.name)}</b><span class="small text-body-secondary">${esc(x.position || 'Empleado')} · desde ${day(x.start_date)}</span></div></div>
        ${x.motivo ? `<div class="small text-body-secondary">${esc(x.motivo)}.</div>` : `<div>${[['Cesantías', x.cesantias], ['Intereses de cesantías', x.intereses], [`Prima del ${d.semestre === '06' ? '1.er' : '2.º'} semestre`, x.prima]].map(([l, v]) => `<div class="nom-line"><span>${l}</span><b>${money(v)}</b></div>`).join('')}</div>`}
        <div><div class="nom-line"><span>Vacaciones pendientes</span><b>${money(x.vacaciones.valor)}</b></div><div class="progress mt-1" style="height:6px" role="progressbar" aria-label="Vacaciones pendientes" aria-valuenow="${Math.min(100, Math.round((x.vacaciones.pendientes / 15) * 100))}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${Math.min(100, Math.round((x.vacaciones.pendientes / 15) * 100))}%"></div></div>
          <div class="small text-body-secondary">${x.vacaciones.pendientes} días pendientes · ${x.vacaciones.tomadas} tomados · ${x.vacaciones.causadas} causados</div></div>
        <div class="nom-tot" style="grid-template-columns:1fr"><div><small>Se le debe en total</small><b>${money(x.total)}</b></div></div></div>`).join('') || '<div class="dw-card text-body-secondary">Aún no hay empleados con prestaciones.</div>'}</div>`;
    C.kpis($('[data-k]', el), [['Cesantías causadas', money(t.cesantias), `del ${d.year}`, 'bi-bank'], ['Intereses de cesantías', money(t.intereses), '12 % anual', 'bi-percent'], ['Prima del semestre', money(t.prima), d.semestre === '06' ? 'se paga hasta el 30 de junio' : 'se paga hasta el 20 de diciembre', 'bi-gift'], ['Vacaciones pendientes', money(t.vacaciones), `${Math.round(t.vacaciones_dias * 100) / 100} días en total`, 'bi-umbrella'], ['Se debe en total', money(t.total), 'a hoy, por prestaciones', 'bi-piggy-bank']]);
    el.onclick = async (e) => {
      const r = e.target.closest('[data-run]'); if (r) return detalle(+r.dataset.run);
      const b = e.target.closest('[data-liq]'); if (!b) return;
      const [tipo, period] = b.dataset.liq.split('|');
      try { const x = await api(`${B}/runs`, { method: 'POST', body: { tipo, period } }); toast(`Liquidada: ${x.empleados} personas, ${money(x.neto)}`); detalle(x.id); } catch (x) { toast(x.message, false); }
    };
  }

  /* ---------------- empleados ---------------- */
  const FE = [
    { k: 'name', label: 'Nombre completo', required: true, full: true }, { k: 'doc_type', label: 'Tipo de documento', type: 'select', options: ['CC', 'NIT', 'CE', 'PPT', 'PEP', 'PA', 'TI'].map((x) => [x, x]) }, { k: 'doc_number', label: 'Número de documento' },
    { k: 'position', label: 'Cargo' }, { k: 'email', label: 'Correo', type: 'email' }, { k: 'phone', label: 'Celular' },
    { k: 'contract_type', label: 'Contrato', type: 'select', options: [['indefinido', 'Término indefinido'], ['fijo', 'Término fijo'], ['obra_labor', 'Obra o labor'], ['aprendizaje', 'Aprendizaje (SENA)'], ['prestacion', 'Prestación de servicios (contratista)']] },
    { k: 'salary_type', label: 'Tipo de salario', type: 'select', options: [['ordinario', 'Ordinario'], ['integral', 'Integral (≥ 13 SMMLV)']] },
    { k: 'salary', label: 'Salario mensual', type: 'money', required: true }, { k: 'pay_freq', label: 'Se paga', type: 'select', options: [['mensual', 'Mensual (último día del mes)'], ['quincenal', 'Quincenal (15 y último día)'], ['semanal', 'Semanal (cada viernes)']] },
    { k: 'start_date', label: 'Fecha de ingreso', type: 'date', required: true }, { k: 'contract_end', label: 'Fin del contrato (si es fijo)', type: 'date' },
    { k: 'arl_risk', label: 'Riesgo ARL (1 a 5)', type: 'int', hint: '1 oficina · 2 · 3 · 4 · 5 alto riesgo' }, { k: 'aux_transporte', label: 'Auxilio de transporte', type: 'bool', check: 'Lo recibe (si gana hasta 2 SMMLV)', default: true },
    { k: 'cost_center', label: 'Centro de costo en Finanzas', placeholder: 'Administración, Ventas…' },
    { k: 'eps', label: 'EPS' }, { k: 'afp', label: 'Fondo de pensión' }, { k: 'arl', label: 'ARL' }, { k: 'caja', label: 'Caja de compensación' }, { k: 'cesantias_fund', label: 'Fondo de cesantías' },
    { k: 'bank', label: 'Banco' }, { k: 'account_type', label: 'Tipo de cuenta', placeholder: 'Ahorros, Corriente…' }, { k: 'account_number', label: 'Número de cuenta' },
    { k: 'retencion_pct', label: 'Retención de honorarios % (contratistas)', hint: 'Vacío = 10 %' }, { k: 'dependientes', label: 'Retención', type: 'bool', check: 'Tiene dependientes (deducción)' }, { k: 'deduc_vivienda', label: 'Intereses de vivienda al mes', type: 'money' }, { k: 'deduc_prepagada', label: 'Medicina prepagada al mes', type: 'money' },
    { k: 'notes', label: 'Notas', type: 'long' }];
  async function empleados(el) {
    if (!RO) $('[data-acciones]').innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-person-plus me-1"></i>Nuevo empleado</button>';
    const CONTRATO = { indefinido: 'Indefinido', fijo: 'Fijo', obra_labor: 'Obra o labor', aprendizaje: 'Aprendizaje', prestacion: 'Prestación de servicios' };
    el.innerHTML = '<div class="d-flex gap-2 mb-3"><input class="form-control" style="max-width:260px" data-q placeholder="Buscar…" aria-label="Buscar"><select class="form-select w-auto" data-st aria-label="Estado"><option value="activo">Activos</option><option value="retirado">Retirados</option><option value="">Todos</option></select></div><div class="nom-grid" data-g></div>';
    let rows = [];
    const pinta = () => {
      const q = $('[data-q]', el).value.trim().toLowerCase(), st = $('[data-st]', el).value;
      const v = rows.filter((r) => (!st || r.status === st) && (!q || `${r.name} ${r.position || ''} ${r.doc_number || ''}`.toLowerCase().includes(q)));
      $('[data-g]', el).innerHTML = v.map((r) => `<div class="nom-card nom-click" data-id="${r.id}"><div class="d-flex align-items-center gap-2"><span class="nom-av ${r.contract_type === 'prestacion' ? 'nom-av--c' : ''}">${esc(iniciales(r.name))}</span>
          <div class="flex-grow-1" style="min-width:0"><b class="d-block text-truncate">${esc(r.name)}</b><span class="small text-body-secondary">${esc(r.position || '—')}${r.doc_number ? ` · ${esc(r.doc_type)} ${esc(r.doc_number)}` : ''}</span></div>${r.status === 'activo' ? '' : chip('free', 'Retirado')}</div>
        <div><div class="nom-big">${r.contract_type === 'prestacion' && !r.salary ? '<span class="fs-6 text-body-secondary fw-normal">Por clases o servicios</span>' : money(r.salary)}</div><div class="small text-body-secondary">${r.contract_type === 'prestacion' ? 'honorarios' : r.salary_type === 'integral' ? 'salario integral' : `al mes · ${esc(r.pay_freq)}`}</div></div>
        <div class="d-flex flex-wrap gap-1">${chip(r.contract_type === 'prestacion' ? 'soon' : 'ok', CONTRATO[r.contract_type])}<span class="small text-body-secondary align-self-center">desde ${day(r.start_date)}</span></div>
        ${!RO && r.status === 'activo' ? '<div class="d-flex gap-1 justify-content-end"><button class="btn btn-sm btn-outline-secondary" data-liq title="Liquidar contrato" aria-label="Liquidar contrato"><i class="bi bi-door-open"></i></button></div>' : ''}</div>`).join('') || '<div class="dw-card text-body-secondary">Sin personas con este filtro. Se traen solas desde Equipo.</div>';
    };
    const cargar = async () => { rows = (await api(`${B}/employees?limit=1000`)).rows; pinta(); };
    const guardar = async (r) => {
      const v = await C.form({ title: r ? `Editar a ${r.name}` : 'Nuevo empleado', base: B, fields: FE, values: r || { start_date: hoy, arl_risk: 1, doc_type: 'CC', contract_type: 'indefinido', salary_type: 'ordinario', pay_freq: 'mensual', aux_transporte: true }, onDelete: r && !RO ? () => api(`${B}/employees/${r.id}`, { method: 'DELETE' }) : undefined });
      if (!v) return;
      if (v === 'deleted') { toast('Empleado borrado'); return cargar(); }
      try { await api(r ? `${B}/employees/${r.id}` : `${B}/employees`, { method: r ? 'PATCH' : 'POST', body: v }); toast('Guardado'); cargar(); } catch (x) { toast(x.message, false); }
    };
    $('[data-q]', el).addEventListener('input', pinta); $('[data-st]', el).addEventListener('change', pinta);
    $('[data-nuevo]')?.addEventListener('click', () => guardar(null));
    $('[data-g]', el).addEventListener('click', (e) => { const c = e.target.closest('[data-id]'); if (!c) return; const r = rows.find((x) => x.id === +c.dataset.id); if (e.target.closest('[data-liq]')) liquidarContrato(r, cargar); else if (!RO) guardar(r); });
    await cargar();
  }
  /* ---------------- contratistas: cuenta de cobro del mes, cada cargo por separado ---------------- */
  async function contratistas(el) {
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><label class="small text-body-secondary mb-0">Mes <input class="form-control form-control-sm d-inline-block w-auto" type="month" data-mes value="${mesHoy}"></label>
      ${RO ? '' : '<button class="btn btn-primary btn-sm" data-gen><i class="bi bi-receipt me-1"></i>Generar o actualizar las cuentas de cobro</button>'}<span class="small text-body-secondary">Se hacen solas cada día con lo entregado (clases dictadas, honorarios). Una vez pagadas ya no cambian.</span></div><div class="nom-grid" data-g></div>`;
    const load = async () => {
      const d = await api(`${B}/servicios?period=${$('[data-mes]', el).value || mesHoy}`);
      $('[data-g]', el).innerHTML = d.contratistas.map((c) => `<div class="nom-card"><div class="d-flex align-items-center gap-2"><span class="nom-av nom-av--c">${esc(iniciales(c.empleado.name))}</span>
          <div class="flex-grow-1" style="min-width:0"><b class="d-block text-truncate">${esc(c.empleado.name)}</b><span class="small text-body-secondary">${esc(c.empleado.doc_number ? `${c.empleado.doc_type} ${c.empleado.doc_number}` : 'Sin documento')}</span></div>
          ${c.factura ? chip(c.factura.status === 'pagada' ? 'ok' : 'soon', c.factura.status === 'pagada' ? 'Pagada' : 'Por pagar') : chip('free', 'Sin cuenta')}</div>
        <div>${c.lineas.length ? c.lineas.map((l) => `<div class="nom-line"><span>${esc(l.concepto)}${l.detalle ? `<span class="text-body-secondary"> · ${esc(l.detalle)}</span>` : ''}</span><b class="${l.valor < 0 ? 'nom-neg' : ''}">${l.valor < 0 ? '−' : ''}${money(Math.abs(l.valor))}</b></div>`).join('') : '<div class="small text-body-secondary">Aún no hay clases ni servicios entregados este mes.</div>'}</div>
        <div class="nom-tot"><div><small>Bruto</small><b>${money(c.bruto)}</b></div><div><small>Retención</small><b class="${c.retencion ? 'nom-neg' : ''}">${money(c.retencion)}</b></div><div><small>A pagar</small><b>${money(c.neto)}</b></div></div>
        ${c.factura && d.finanzas ? `<a class="btn btn-sm btn-outline-secondary" target="_blank" rel="noopener" href="/api/finanzas/invoices/${c.factura.id}/pdf"><i class="bi bi-file-earmark-text me-1"></i>Cuenta de cobro ${esc(c.factura.number || '')}</a>` : ''}</div>`).join('')
        || '<div class="dw-card text-body-secondary">No hay contratistas este mes. Los docentes que cobran por clases entran solos desde Equipo.</div>';
    };
    $('[data-mes]', el).addEventListener('change', load);
    $('[data-gen]', el)?.addEventListener('click', async () => { try { const r = await api(`${B}/servicios/generar`, { method: 'POST', body: { period: $('[data-mes]', el).value || mesHoy } }); toast(`${r.cuentas_de_cobro || 0} cuentas de cobro al día`); load(); } catch (x) { toast(x.message, false); } });
    await load();
  }
  async function liquidarContrato(emp, done) {
    const cs = await cuentas();
    const v = await C.form({ title: `Liquidar el contrato de ${emp.name}`, base: B, okText: 'Calcular', values: { fin: hoy, motivo: 'renuncia', promedio_variable: 0 },
      fields: [{ k: 'fin', label: 'Fecha de retiro', type: 'date', required: true }, { k: 'motivo', label: 'Motivo', type: 'select', options: MOTIVO },
        { k: 'promedio_variable', label: 'Promedio mensual de comisiones/extras (salarial)', type: 'money', full: true, hint: 'Entra en la base de cesantías, prima e indemnización' }] });
    if (!v) return;
    let liq; try { liq = await api(`${B}/employees/${emp.id}/liquidacion?fin=${v.fin}&motivo=${v.motivo}&promedio_variable=${v.promedio_variable || 0}`); } catch (x) { toast(x.message, false); return; }
    const { el, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Liquidación de ${esc(emp.name)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="small text-body-secondary mb-2">Retiro ${day(liq.fin)} · ${liq.dias_trabajados} días desde el ingreso · base ${money(liq.base)}</div>
        ${liq.items.map((x) => `<div class="d-flex"><span class="flex-grow-1">${esc(x.c)}${sub(x.nota)}</span><b>${money(x.valor)}</b></div>`).join('') || '<div class="text-body-secondary">No hay valores por liquidar.</div>'}
        <hr><div class="d-flex fs-5"><span class="flex-grow-1">Total a pagar</span><b>${money(liq.total)}</b></div><p class="small text-body-secondary mt-2">${esc(liq.nota)}</p>
        <div class="row g-2"><div class="col-sm-6"><label class="form-label small mb-1">Pagar con la cuenta</label><select class="form-select" data-cta><option value="">No registrar el pago en Finanzas todavía</option>${cs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div></div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" data-ok>Guardar liquidación y retirar</button></div>`, { size: 'modal-lg' });
    $('[data-ok]', el).onclick = async () => {
      const cta = $('[data-cta]', el).value;
      try { await api(`${B}/employees/${emp.id}/liquidacion`, { method: 'POST', body: { fin: v.fin, motivo: v.motivo, promedio_variable: v.promedio_variable || 0, pagar: !!cta, account_id: cta || undefined, date: hoy } }); m.hide(); toast('Contrato liquidado'); done(); }
      catch (x) { $('[data-err]', el).textContent = x.message; }
    };
  }

  /* ---------------- novedades ---------------- */
  async function novedades(el) {
    const p = await api(`${B}/parametros`); KINDS = p.kinds;
    const kindOpts = Object.entries(KINDS).map(([k, v]) => [k, `${v.label} (${v.unidad})`]);
    el.innerHTML = '<p class="small text-body-secondary">Todo lo que cambia el pago de un periodo: horas extras y recargos, comisiones, bonos, incapacidades, vacaciones, licencias y descuentos. Las horas y los días van en «Cantidad»; los pesos en «Valor».</p><div data-t></div>';
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'novedades', title: 'novedad', newText: 'Nueva novedad', refs: ['employees'], readOnly: RO, canDelete: true, emptyIcon: 'bi-lightning-charge', empty: 'Sin novedades registradas.',
      defaults: () => ({ period: mesHoy, half: 'M' }),
      fields: [{ k: 'employee_id', label: 'Empleado', ref: 'employees', required: true }, { k: 'period', label: 'Mes', type: 'month', required: true },
        { k: 'half', label: 'Aplica a', type: 'select', options: Object.entries(HALF) }, { k: 'kind', label: 'Tipo', type: 'select', options: kindOpts },
        { k: 'quantity', label: 'Cantidad (horas o días)' }, { k: 'amount', label: 'Valor en pesos', type: 'money' }, { k: 'note', label: 'Nota', full: true }],
      columns: [{ label: 'Mes', html: (r) => `${esc(r.period)}${sub(HALF[r.half])}` }, { label: 'Empleado', main: true, html: (r, R) => C.refName(R, 'employees', r.employee_id) },
        { label: 'Novedad', html: (r) => esc(KINDS[r.kind]?.label || r.kind) }, { label: 'Cantidad / valor', html: (r) => (KINDS[r.kind]?.unidad === 'pesos' ? money(r.amount) : `${r.quantity} ${KINDS[r.kind]?.unidad || ''}`) }, { label: 'Nota', html: (r) => esc(r.note || '') }] });
    t.load();
  }

  /* ---------------- corridas ---------------- */
  async function corridas(el) {
    if (!RO) $('[data-acciones]').innerHTML = '<button class="btn btn-primary" data-nueva><i class="bi bi-calculator me-1"></i>Liquidar nómina</button>';
    $('[data-nueva]')?.addEventListener('click', async () => {
      const v = await C.form({ title: 'Liquidar', okText: 'Liquidar', base: B, values: { tipo: 'nomina', period: mesHoy, half: 'M' },
        fields: [{ k: 'tipo', label: 'Qué liquidar', type: 'select', options: Object.entries(TIPO) }, { k: 'period', label: 'Mes', type: 'month', required: true, hint: 'Prima: junio o diciembre · Cesantías: diciembre' }, { k: 'half', label: 'Periodo de pago (nómina)', type: 'select', options: Object.entries(HALF) }] });
      if (!v) return;
      try { const r = await api(`${B}/runs`, { method: 'POST', body: v }); toast(`Liquidada: ${r.empleados} personas, neto ${money(r.neto)}`); detalle(r.id); } catch (x) { toast(x.message, false); }
    });
    const d = await api(`${B}/runs`);
    el.innerHTML = d.rows.length ? `<div class="dw-card p-0 p-md-2">${window.App.table([
      { label: 'Corrida', main: true, html: (r) => `${esc(TIPO[r.tipo])}${sub(`${r.period}${r.tipo === 'nomina' ? ` · ${HALF[r.half]}` : ''} · ${r.empleados} personas`)}` },
      { label: 'Devengado', cls: 'text-end', html: (r) => money(r.devengado) }, { label: 'Neto', cls: 'text-end', html: (r) => `<b>${money(r.neto)}</b>` },
      { label: 'Costo (aportes + provisiones)', cls: 'text-end', html: (r) => money(r.devengado + r.aportes + r.provisiones) },
      { label: 'Estado', html: (r) => chip(...ESTADO[r.status]) }, { label: '', cls: 'text-end', html: (r) => `<button class="btn btn-sm btn-outline-primary" data-run="${r.id}">Abrir</button>` }], d.rows)}</div>`
      : '<div class="dw-card text-body-secondary">Aún no hay nóminas. Registra tus empleados y pulsa «Liquidar nómina».</div>';
    el.onclick = (e) => { const b = e.target.closest('[data-run]'); if (b) detalle(+b.dataset.run); };
  }
  async function detalle(id) {
    const d = await api(`${B}/runs/${id}`), run = d.run;
    const { el, m } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">${esc(TIPO[run.tipo])} · ${esc(run.period)}${run.tipo === 'nomina' ? ` · ${esc(HALF[run.half])}` : ''}</h2></div> <span class="ms-2">${chip(...ESTADO[run.status])}</span><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="dw-grid dw-grid--kpi mb-3" data-k></div>
        <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Empleado</th><th class="text-end">Devengado</th><th class="text-end">Deducciones</th><th class="text-end">Neto</th><th class="text-end">Aportes</th><th></th></tr></thead>
        <tbody>${d.lineas.map((l) => `<tr><td>${esc(l.name)}${sub(l.position)}${(l.detalle.alertas || []).map((a) => `<div class="small text-warning-emphasis"><i class="bi bi-exclamation-triangle me-1"></i>${esc(a)}</div>`).join('')}</td>
          <td class="text-end">${money(l.devengado)}</td><td class="text-end">${money(l.deducciones)}</td><td class="text-end"><b>${money(l.neto)}</b></td><td class="text-end">${money(l.aportes)}</td>
          <td class="text-end"><a class="btn btn-sm btn-light" target="_blank" rel="noopener" href="${B}/runs/${run.id}/desprendible/${l.employee_id}" title="Desprendible" aria-label="Desprendible"><i class="bi bi-receipt"></i></a></td></tr>`).join('') || '<tr><td colspan="6" class="text-body-secondary">Sin personas en este periodo.</td></tr>'}</tbody></table></div>
        <div class="d-flex flex-wrap gap-2"><a class="btn btn-sm btn-outline-secondary" href="${B}/runs/${run.id}/export?kind=pago"><i class="bi bi-bank me-1"></i>Archivo de pago (CSV)</a>${run.tipo === 'nomina' ? `<a class="btn btn-sm btn-outline-secondary" href="${B}/runs/${run.id}/export?kind=aportes"><i class="bi bi-shield-check me-1"></i>Resumen de aportes (CSV)</a>` : ''}</div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${!RO && run.status !== 'pagada' ? '<button class="btn btn-outline-danger btn-sm" data-borrar><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span>${RO ? '' : run.status === 'borrador' ? '<button class="btn btn-outline-secondary" data-recalc>Recalcular</button> <button class="btn btn-primary" data-aprobar>Aprobar</button>' : run.status === 'aprobada' ? '<button class="btn btn-light" data-reabrir>Reabrir</button> <button class="btn btn-primary" data-pagar><i class="bi bi-cash-coin me-1"></i>Pagar y enviar a Finanzas</button>' : ''}</span></div>`, { size: 'modal-xl modal-dialog-scrollable' });
    C.kpis($('[data-k]', el), [['Devengado', money(run.devengado), '', 'bi-cash'], ['Deducciones', money(run.deducciones), run.retencion ? `retención ${money(run.retencion)}` : '', 'bi-dash-circle'], ['Neto a pagar', money(run.neto), '', 'bi-wallet2'], ['Aportes del empleador', money(run.aportes), '', 'bi-shield-check'], ['Provisiones', money(run.provisiones), '', 'bi-piggy-bank']]);
    const err = $('[data-err]', el), fin = (msg) => { m.hide(); if (msg) toast(msg); render(); };
    const act = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = async () => { try { await fn(); } catch (x) { err.textContent = x.message; } }; };
    act('[data-recalc]', async () => { await api(`${B}/runs`, { method: 'POST', body: { tipo: run.tipo, period: run.period, half: run.half } }); m.hide(); detalle(id); });
    act('[data-aprobar]', async () => { await api(`${B}/runs/${id}/aprobar`, { method: 'POST' }); fin('Nómina aprobada'); });
    act('[data-reabrir]', async () => { await api(`${B}/runs/${id}/reabrir`, { method: 'POST' }); fin('Nómina en borrador'); });
    act('[data-borrar]', async () => { if (await confirm({ title: '¿Borrar esta nómina?', text: 'Se borra la liquidación; no se puede deshacer.' })) { await api(`${B}/runs/${id}`, { method: 'DELETE' }); fin('Nómina borrada'); } });
    act('[data-pagar]', async () => {
      const cs = await cuentas();
      const v = await C.form({ title: 'Pagar la nómina', okText: 'Pagar', base: B, values: { date: hoy, account_id: '' }, fields: [{ k: 'date', label: 'Fecha de pago', type: 'date', required: true },
        { k: 'account_id', label: 'Cuenta de Finanzas', type: 'select', options: [['', 'Sin cuenta'], ...cs.map((c) => [c.id, c.name])], hint: 'Se registran los egresos: pago a empleados, seguridad social y parafiscales, y retención.' }] });
      if (!v) return;
      const r = await api(`${B}/runs/${id}/pagar`, { method: 'POST', body: { date: v.date, account_id: v.account_id || undefined } });
      fin(r.finanzas ? `Pagada: ${r.egresos_en_finanzas} egresos registrados en Finanzas` : 'Pagada (Finanzas no está activo: no se registraron egresos)');
    });
  }

  /* ---------------- liquidaciones ---------------- */
  async function liquidaciones(el) {
    const d = await api(`${B}/liquidaciones`);
    el.innerHTML = d.rows.length ? `<div class="dw-card p-0 p-md-2">${window.App.table([
      { label: 'Empleado', main: true, html: (s) => `${esc(s.name)}${sub(`retiro ${day(s.end_date)} · ${esc((MOTIVO.find((m) => m[0] === s.reason) || [])[1] || s.reason)}`)}` },
      { label: 'Conceptos', html: (s) => (s.detalle.items || []).map((x) => `<div class="small">${esc(x.c)}: ${money(x.valor)}</div>`).join('') }, { label: 'Total', cls: 'text-end', html: (s) => `<b>${money(s.total)}</b>` },
      { label: 'Estado', html: (s) => chip(s.status === 'pagada' ? 'ok' : 'soon', s.status === 'pagada' ? 'Pagada' : 'Por pagar') }], d.rows)}</div>`
      : '<div class="dw-card text-body-secondary">Aún no hay liquidaciones de contrato. Se hacen desde «Empleados» con el botón de la puerta.</div>';
  }

  /* ---------------- parámetros ---------------- */
  async function parametros(el) {
    const year = +mesHoy.slice(0, 4), cur = await api(`${B}/parametros?year=${year}`);
    el.innerHTML = `<div class="dw-card mb-3"><h2 class="h6">Valores de ${year}${cur.estimado ? ' <span class="text-warning-emphasis">(estimados: confírmalos)</span>' : ''}</h2>
      <div class="row g-2"><div class="col-sm-3"><div class="small text-body-secondary">Salario mínimo</div><b>${money(cur.smmlv)}</b></div><div class="col-sm-3"><div class="small text-body-secondary">Auxilio de transporte</div><b>${money(cur.aux_transporte)}</b></div>
      <div class="col-sm-3"><div class="small text-body-secondary">UVT</div><b>${money(cur.uvt)}</b></div><div class="col-sm-3"><div class="small text-body-secondary">Exonerado (art. 114-1 E.T.)</div><b>${cur.exonerado ? 'Sí: sin salud, SENA ni ICBF bajo 10 SMMLV' : 'No'}</b></div></div>
      <p class="small text-body-secondary mt-2 mb-0">Reglas aplicadas: salud 4 % + 8,5 %, pensión 4 % + 12 %, FSP desde 4 SMMLV, ARL según el riesgo, caja 4 %, SENA 2 %, ICBF 3 %, cesantías 8,33 %, intereses 12 %, prima 8,33 %, vacaciones 4,17 %, horas extras y recargos según la Ley 2101 y la Ley 2466. Si cambia un valor oficial, ajústalo abajo.</p></div>
      <h2 class="h6">Ajustes del negocio por año</h2><div data-t></div>`;
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'params', title: 'parámetros', newText: 'Ajustar un año', readOnly: RO, canDelete: true, emptyIcon: 'bi-sliders', empty: 'Usas los valores de la ley. Ajusta un año solo si cambió algún valor o si tu empresa no está exonerada.',
      defaults: () => ({ year, exonerado: true }),
      fields: [{ k: 'year', label: 'Año', type: 'int', required: true }, { k: 'smmlv', label: 'Salario mínimo', type: 'money' }, { k: 'aux_transporte', label: 'Auxilio de transporte', type: 'money' }, { k: 'uvt', label: 'UVT', type: 'money' },
        { k: 'exonerado', label: 'Exoneración', type: 'bool', check: 'Exonerado de salud, SENA e ICBF (persona jurídica, o natural con 2 o más trabajadores)' }, { k: 'horas_mes', label: 'Horas ordinarias al mes', type: 'int', hint: 'Vacío = las que fija la ley' }],
      columns: [{ label: 'Año', main: true, html: (r) => String(r.year) }, { label: 'SMMLV', html: (r) => (r.smmlv ? money(r.smmlv) : 'ley') }, { label: 'Auxilio', html: (r) => (r.aux_transporte ? money(r.aux_transporte) : 'ley') }, { label: 'UVT', html: (r) => (r.uvt ? money(r.uvt) : 'ley') },
        { label: 'Exonerado', html: (r) => (r.exonerado ? 'Sí' : 'No') }] });
    t.load();
  }

  render();
});

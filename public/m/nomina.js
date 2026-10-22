// Página del módulo Nómina (Colombia): resumen, empleados, novedades, corridas de nómina (con pago a Finanzas), liquidaciones y parámetros.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud, { money, num, day, chip } = C;
  const B = '/api/nomina', RO = me.business.readOnly;
  const $ = (s, el = document) => el.querySelector(s);
  const hoy = C.todayCo(), mesHoy = hoy.slice(0, 7);
  const VIEWS = [['resumen', 'Resumen', 'bi-graph-up'], ['empleados', 'Empleados', 'bi-people'], ['novedades', 'Novedades', 'bi-lightning-charge'], ['corridas', 'Nómina', 'bi-cash-stack'], ['liquidaciones', 'Liquidaciones', 'bi-door-open'], ['parametros', 'Parámetros', 'bi-sliders']];
  let view = (location.hash || '#resumen').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'resumen';
  const ESTADO = { borrador: ['soon', 'Borrador'], aprobada: ['ok', 'Aprobada'], pagada: ['free', 'Pagada'] };
  const TIPO = { nomina: 'Nómina', prima: 'Prima de servicios', cesantias: 'Cesantías' };
  const HALF = { M: 'Mes completo', 1: 'Primera quincena', 2: 'Segunda quincena' };
  const MOTIVO = [['renuncia', 'Renuncia'], ['sin_justa_causa', 'Despido sin justa causa'], ['con_justa_causa', 'Despido con justa causa'], ['mutuo_acuerdo', 'Mutuo acuerdo'], ['terminacion_contrato', 'Terminación del contrato']];
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');
  let KINDS = {};

  const seg = $('[data-seg]');
  C.seg(seg, VIEWS, (k) => { view = k; render(); }, view);
  function render() {
    history.replaceState(null, '', `#${view}`);
    $('[data-acciones]').innerHTML = '';
    const old = $('[data-view]'), el = old.cloneNode(false); old.replaceWith(el);
    ({ resumen, empleados, novedades, corridas, liquidaciones, parametros })[view](el).catch((x) => { el.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; });
  }
  const cuentas = async () => (await api('/api/finanzas/accounts?limit=200').catch(() => ({ rows: [] }))).rows;

  /* ---------------- resumen ---------------- */
  async function resumen(el) {
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><label class="small text-body-secondary">Mes <input class="form-control d-inline-block w-auto" type="month" data-mes value="${mesHoy}"></label></div>
      <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div class="row g-3"><div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">Nóminas del mes</h2><div data-runs></div></div></div>
      <div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">Próximas obligaciones</h2><div data-obl></div><p class="small text-body-secondary mt-2 mb-0">Los aportes a seguridad social (PILA) y la retención en la fuente se pagan cada mes según el último dígito del NIT.</p></div></div></div>`;
    const load = async () => {
      const s = await api(`${B}/summary?period=${$('[data-mes]', el).value || mesHoy}`);
      C.kpis($('[data-kpis]', el), [['Empleados activos', num(s.empleados), '', 'bi-people'], ['Devengado estimado', money(s.devengado), `neto ${money(s.neto)}`, 'bi-cash-stack'], ['Aportes del empleador', money(s.aportes), 'salud, pensión, ARL, caja, SENA, ICBF', 'bi-shield-check'],
        ['Provisiones', money(s.provisiones), 'cesantías, intereses, prima, vacaciones', 'bi-piggy-bank'], ['Costo total del mes', money(s.costo), s.parametros_estimados ? 'con parámetros estimados' : `SMMLV ${money(s.smmlv)}`, 'bi-calculator']]);
      $('[data-runs]', el).innerHTML = s.corridas.length ? s.corridas.map((r) => `<div class="d-flex align-items-center gap-2 mb-1"><span class="flex-grow-1">${esc(TIPO[r.tipo])}${r.tipo === 'nomina' && r.half !== 'M' ? ` · ${esc(HALF[r.half])}` : ''}</span><b>${money(r.neto)}</b>${chip(...ESTADO[r.status])}</div>`).join('') : '<div class="small text-body-secondary">Aún no hay nómina liquidada este mes. Ve a «Nómina» para liquidarla.</div>';
      $('[data-obl]', el).innerHTML = s.obligaciones.map((o) => `<div class="mb-1"><b>${day(o.fecha)}</b> · ${esc(o.que)}</div>`).join('') || '<div class="small text-body-secondary">Sin fechas próximas.</div>';
    };
    $('[data-mes]', el).addEventListener('change', load);
    await load();
  }

  /* ---------------- empleados ---------------- */
  const FE = [
    { k: 'name', label: 'Nombre completo', required: true, full: true }, { k: 'doc_type', label: 'Tipo de documento', type: 'select', options: ['CC', 'CE', 'PPT', 'PEP', 'PA', 'TI'].map((x) => [x, x]) }, { k: 'doc_number', label: 'Número de documento' },
    { k: 'position', label: 'Cargo' }, { k: 'email', label: 'Correo', type: 'email' }, { k: 'phone', label: 'Celular' },
    { k: 'contract_type', label: 'Contrato', type: 'select', options: [['indefinido', 'Término indefinido'], ['fijo', 'Término fijo'], ['obra_labor', 'Obra o labor'], ['aprendizaje', 'Aprendizaje (SENA)'], ['prestacion', 'Prestación de servicios (contratista)']] },
    { k: 'salary_type', label: 'Tipo de salario', type: 'select', options: [['ordinario', 'Ordinario'], ['integral', 'Integral (≥ 13 SMMLV)']] },
    { k: 'salary', label: 'Salario mensual', type: 'money', required: true }, { k: 'pay_freq', label: 'Se paga', type: 'select', options: [['mensual', 'Mensual'], ['quincenal', 'Quincenal']] },
    { k: 'start_date', label: 'Fecha de ingreso', type: 'date', required: true }, { k: 'contract_end', label: 'Fin del contrato (si es fijo)', type: 'date' },
    { k: 'arl_risk', label: 'Riesgo ARL (1 a 5)', type: 'int', hint: '1 oficina · 2 · 3 · 4 · 5 alto riesgo' }, { k: 'aux_transporte', label: 'Auxilio de transporte', type: 'bool', check: 'Lo recibe (si gana hasta 2 SMMLV)', default: true },
    { k: 'cost_center', label: 'Centro de costo en Finanzas', placeholder: 'Administración, Ventas…' },
    { k: 'eps', label: 'EPS' }, { k: 'afp', label: 'Fondo de pensión' }, { k: 'arl', label: 'ARL' }, { k: 'caja', label: 'Caja de compensación' }, { k: 'cesantias_fund', label: 'Fondo de cesantías' },
    { k: 'bank', label: 'Banco' }, { k: 'account_type', label: 'Tipo de cuenta', placeholder: 'Ahorros, Corriente…' }, { k: 'account_number', label: 'Número de cuenta' },
    { k: 'retencion_pct', label: 'Retención de honorarios % (contratistas)', hint: 'Vacío = 10 %' }, { k: 'dependientes', label: 'Retención', type: 'bool', check: 'Tiene dependientes (deducción)' }, { k: 'deduc_vivienda', label: 'Intereses de vivienda al mes', type: 'money' }, { k: 'deduc_prepagada', label: 'Medicina prepagada al mes', type: 'money' },
    { k: 'notes', label: 'Notas', type: 'long' }];
  async function empleados(el) {
    el.innerHTML = '<div data-t></div>';
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'employees', title: 'empleado', newText: 'Nuevo empleado', fields: FE, readOnly: RO, emptyIcon: 'bi-people', empty: 'Aún no hay empleados. Registra el primero.',
      filters: [{ k: 'status', options: [['', 'Todos'], ['activo', 'Activos'], ['retirado', 'Retirados']] }], defaults: () => ({ start_date: hoy, arl_risk: 1, doc_type: 'CC', contract_type: 'indefinido', salary_type: 'ordinario', pay_freq: 'mensual', aux_transporte: true }),
      columns: [{ label: 'Empleado', main: true, html: (r) => `${esc(r.name)}${sub([r.position, r.doc_number && `${r.doc_type} ${r.doc_number}`].filter(Boolean).join(' · '))}` },
        { label: 'Salario', html: (r) => `${money(r.salary)}${sub(r.salary_type === 'integral' ? 'integral' : r.pay_freq)}` }, { label: 'Contrato', html: (r) => `${esc(({ indefinido: 'Indefinido', fijo: 'Fijo', obra_labor: 'Obra o labor', aprendizaje: 'Aprendizaje', prestacion: 'Prestación de servicios' })[r.contract_type])}${sub(`desde ${day(r.start_date)}${r.end_date ? ` · retiro ${day(r.end_date)}` : ''}`)}` },
        { label: 'Estado', html: (r) => chip(r.status === 'activo' ? 'ok' : 'free', r.status === 'activo' ? 'Activo' : 'Retirado') }],
      rowActions: (r) => (!RO && r.status === 'activo' ? '<button class="btn btn-sm btn-outline-secondary" data-act="liq" title="Liquidar contrato" aria-label="Liquidar contrato"><i class="bi bi-door-open"></i></button>' : ''),
      onAction: (a, r) => { if (a === 'liq') liquidarContrato(r, () => t.load()); } });
    t.load();
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

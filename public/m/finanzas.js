// Página del módulo Finanzas (Finance Hub de Diwilo): resumen, ingresos y gastos, facturas y cartera, recurrentes,
// centros de costo y presupuestos, bancos y conciliación, exportar.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  // Secciones de arriba: botones pequeños solo con palabras (igual en todas las apps, sin depender del crud.js de cada una)
  function segBtn(el, items, onPick, initial) {
    if (!document.getElementById('dw-segb-css')) document.head.insertAdjacentHTML('beforeend', `<style id="dw-segb-css">${'.dw-segb{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}.dw-segb .btn{flex:none;white-space:nowrap}.dw-segb .btn.active{background:var(--dw-p);border-color:var(--dw-p);color:#fff}@media(max-width:767.98px){.dw-segb{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.dw-segb::-webkit-scrollbar{display:none}}'}</style>`);
    el.className = 'dw-segb'; el.hidden = false;
    el.innerHTML = items.map(([k, l]) => `<button type="button" class="btn btn-sm btn-outline-secondary ${k === initial ? 'active' : ''}" data-k="${k}">${esc(l)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; el.querySelectorAll('.btn').forEach((x) => x.classList.toggle('active', x === b)); onPick(b.dataset.k); };
  }
  const C = window.App.Crud;
  const { money, num, day, monthName, chip } = C;
  const B = '/api/finanzas';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const RO = me.business.readOnly;
  const REC_CAT = { infraestructura: 'Infraestructura', software: 'Software', api: 'API', ia: 'IA', marketing: 'Marketing', nomina: 'Nómina', otro: 'Otro' };
  const CC_KIND = { proyecto: 'Proyecto', app: 'App', cliente: 'Cliente', departamento: 'Departamento' };
  const INV_STATE = { pendiente: ['soon', 'Pendiente'], vencida: ['bad', 'Vencida'], pagada: ['ok', 'Pagada'], anulada: ['free', 'Anulada'] };
  const usd = (n) => `US$${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usdLine = (r) => (r.currency === 'USD' && r.amount_usd ? `<div class="small text-body-secondary fw-normal">${usd(r.amount_usd)}${r.fx_rate ? ` · TRM ${Number(r.fx_rate).toLocaleString('es-CO', { maximumFractionDigits: 2 })}` : ''}</div>` : '');
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');

  const VIEWS = [['resumen', 'Resumen', 'bi-pie-chart'], ['movimientos', 'Movimientos', 'bi-arrow-down-up'], ['facturas', 'Cobros', 'bi-receipt'],
    ['recurrentes', 'Gastos recurrentes', 'bi-arrow-repeat'], ['centros', 'Centros de costo y presupuestos', 'bi-diagram-3'], ['bancos', 'Bancos y conciliación', 'bi-bank'], ['informes', 'Informes', 'bi-journal-text'], ['exportar', 'Exportar', 'bi-download']];
  const F = {
    movements: [
      { k: 'kind', label: 'Tipo', type: 'select', options: [['gasto', 'Gasto'], ['ingreso', 'Ingreso']] }, { k: 'date', label: 'Fecha', type: 'date', required: true },
      { k: 'currency', label: 'Moneda', type: 'select', options: [['COP', 'Pesos (COP)'], ['USD', 'Dólares (USD)']] }, { k: 'amount_usd', label: 'Valor en dólares', type: 'usd', hint: 'solo si es en USD' },
      { k: 'amount', label: 'Monto (COP)', type: 'money', hint: 'en USD se calcula con la TRM del día' }, { k: 'category', label: 'Categoría', placeholder: 'Nómina, arriendo, ventas…' },
      { k: 'description', label: 'Descripción', full: true }, { k: 'counterparty', label: 'Tercero', placeholder: 'Cliente o proveedor' },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'account_id', label: 'Cuenta', ref: 'accounts' },
      { k: 'invoice_id', label: 'Factura', ref: 'invoices' }, { k: 'reconciled', label: 'Conciliado con el banco', type: 'bool', check: 'Sí' }],
    invoices: [
      { k: 'kind', label: 'Tipo', type: 'select', options: [['recibida', 'Recibida (por pagar)'], ['emitida', 'Emitida (por cobrar)']] }, { k: 'number', label: 'Número' },
      { k: 'counterparty', label: 'Proveedor o cliente', required: true }, { k: 'tax_id', label: 'NIT / CC' },
      { k: 'issue_date', label: 'Fecha de emisión', type: 'date', required: true }, { k: 'due_date', label: 'Vence', type: 'date' },
      { k: 'subtotal', label: 'Subtotal', type: 'money' }, { k: 'tax', label: 'Impuestos (IVA…)', type: 'money' }, { k: 'total', label: 'Total', type: 'money', hint: 'vacío = subtotal + impuestos' },
      { k: 'status', label: 'Estado', type: 'select', options: [['pendiente', 'Pendiente'], ['pagada', 'Pagada'], ['anulada', 'Anulada']] },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'category', label: 'Categoría' }, { k: 'notes', label: 'Notas', type: 'long' }],
    recurring: [
      { k: 'name', label: 'Gasto', required: true, placeholder: 'Arriendo, internet, software…' }, { k: 'vendor', label: 'Proveedor' },
      { k: 'category', label: 'Tipo', type: 'select', options: Object.entries(REC_CAT) }, { k: 'currency', label: 'Moneda', type: 'select', options: [['COP', 'Pesos (COP)'], ['USD', 'Dólares (USD)']] },
      { k: 'amount_usd', label: 'Valor en dólares', type: 'usd', hint: 'solo si es en USD' }, { k: 'amount', label: 'Valor (COP)', type: 'money', hint: 'en USD se calcula con la TRM' },
      { k: 'cycle', label: 'Ciclo', type: 'select', options: [['mensual', 'Mensual'], ['quincenal', 'Quincenal'], ['semanal', 'Semanal'], ['anual', 'Anual']] }, { k: 'tax_id', label: 'Cédula o NIT', placeholder: 'de a quién se le paga' }, { k: 'next_date', label: 'Próximo cobro', type: 'date', required: true },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'account_id', label: 'Se paga desde', ref: 'accounts' },
      { k: 'active', label: 'Estado', type: 'bool', check: 'Activo', default: true }, { k: 'notes', label: 'Notas', type: 'long' }],
    cost_centers: [
      { k: 'name', label: 'Nombre', required: true }, { k: 'kind', label: 'Tipo', type: 'select', options: Object.entries(CC_KIND) },
      { k: 'code', label: 'Código', placeholder: 'opcional' }, { k: 'active', label: 'Estado', type: 'bool', check: 'Activo', default: true }, { k: 'notes', label: 'Notas', type: 'long' }],
    budgets: [
      { k: 'month', label: 'Mes', type: 'month', required: true }, { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers', empty: 'General' },
      { k: 'category', label: 'Categoría', placeholder: 'opcional' }, { k: 'amount', label: 'Presupuesto (COP)', type: 'money', required: true }],
    accounts: [
      { k: 'name', label: 'Nombre', required: true, placeholder: 'Bancolombia ahorros' }, { k: 'kind', label: 'Tipo', type: 'select', options: [['banco', 'Banco'], ['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['billetera', 'Billetera (Nequi, Daviplata)']] },
      { k: 'bank', label: 'Banco' }, { k: 'last4', label: 'Últimos 4 dígitos' }, { k: 'opening_balance', label: 'Saldo inicial (COP)', type: 'money', hint: 'lo que tenía la cuenta antes de registrar movimientos aquí' }],
  };

  const abrirPagar = /^#pagar:(\d+)$/.exec(location.hash)?.[1] || null;   // desde Equipo: abre el pago de ese gasto
  let view = abrirPagar ? 'recurrentes' : (location.hash || '#resumen').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'resumen';
  function render() {
    history.replaceState(null, '', `#${view}`);
    const old = $('[data-view]'), el = old.cloneNode(false);
    old.replaceWith(el);
    ({ resumen: summary, movimientos, facturas: invoices, recurrentes, centros, bancos: banks, informes: reports, exportar: exportView })[view](el);
  }

  function movimientos(el) {
    const t = C.table({ el, base: B, entity: 'movements', title: 'movimiento', newText: 'Nuevo movimiento', refs: ['cost_centers', 'accounts'], fields: F.movements,
      filters: [{ k: 'kind', options: [['', 'Todos los movimientos'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos']] }], defaults: () => ({ kind: 'gasto', date: C.todayCo() }),
      extraButtons: RO ? '' : '<button class="btn btn-outline-primary" data-recibo><i class="bi bi-receipt me-1"></i>Recibo de caja</button>',
      empty: 'Sin movimientos. Los gastos recurrentes y los cobros los crean solos.', emptyIcon: 'bi-arrow-down-up',
      columns: [
        { label: 'Fecha', html: (r) => day(r.date) },
        { label: 'Descripción', main: true, html: (r) => `${esc(r.description || r.category || '—')}${sub(r.counterparty)}${r.tax_id ? sub(`CC/NIT ${r.tax_id}`) : ''}` },
        { label: 'Categoría', html: (r) => (r.category ? `<span class="badge text-bg-light">${esc(r.category)}</span>` : '—') },
        { label: 'Centro de costo', html: (r, R) => C.refName(R, 'cost_centers', r.cost_center_id) },
        { label: 'Cuenta', html: (r, R) => C.refName(R, 'accounts', r.account_id) },
        { label: 'Monto', cls: 'text-end text-nowrap', html: (r) => `<b class="${r.kind === 'ingreso' ? 'text-success' : ''}">${r.kind === 'ingreso' ? '+' : '−'}${money(r.amount)}</b>${r.pago_doc ? ` <a class="btn btn-sm btn-outline-secondary py-0 px-1" href="${B}/pagos-mes/documento?tipo=${r.pago_doc.tipo}&month=${r.pago_doc.month}&key=${encodeURIComponent(r.pago_doc.key)}" target="_blank" rel="noopener" title="Documento del pago: total con sus ${r.pago_doc.items} ítems, nombre y cédula" aria-label="Documento del pago"><i class="bi bi-file-earmark-text"></i></a>` : ''}${r.receipt_id ? ` <a class="btn btn-sm btn-outline-secondary py-0 px-1" href="${B}/receipts/${r.receipt_id}/pdf" target="_blank" rel="noopener" title="Ver el recibo ${esc(r.receipt_number)} (PDF)" aria-label="Ver el recibo (PDF)"><i class="bi bi-filetype-pdf"></i></a>${(r.receipt_files || []).map((f) => ` <a class="btn btn-sm btn-outline-secondary py-0 px-1" href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc(f.nombre)}" aria-label="${esc(f.nombre)}"><i class="bi bi-paperclip"></i></a>`).join('')}` : ''}${usdLine(r)}` },
        { label: 'Conciliado', html: (r) => (r.reconciled ? '<i class="bi bi-check-circle text-success" title="Conciliado"></i>' : '') }] });
    t.load();
    $('[data-recibo]', el)?.addEventListener('click', () => nuevoRecibo(() => t.load()));
  }

  // Pagar un gasto recurrente: se ve el total con sus ítems (los de la nómina vienen de Equipo), la fecha y de qué cuentas sale (se puede dividir: efectivo y banco).
  async function pagarRecurrente(r, despues) {
    const mes = C.todayCo().slice(0, 7), esNomina = r.category === 'nomina';
    const key = r.ref ? String(r.ref).replace(/^academia:nomina:/, '') : `r:${r.id}`;
    const [pm, cuentas] = await Promise.all([api(`${B}/pagos-mes?month=${mes}`).catch(() => ({ planes: [] })), C.refs(B, 'accounts').catch(() => [])]);
    const plan = pm.planes.find((x) => x.tipo === (esNomina ? 'nomina' : 'servicios') && x.key === key);
    if (esNomina && !plan && !(r.amount > 0)) { toast(`Primero arma los ítems de ${r.vendor || r.name} este mes${r.ref ? ' en Equipo' : ''}`, false); return; }
    // Los ítems se pueden cambiar aquí mismo (la app de origen, como Equipo, solo los organiza y los trae)
    const FORMAS = { 1: ['Todo de una vez', 'Total'], 4: ['En cuotas semanales (total del mes ÷ 4)', 'semanas'], 2: ['En cuotas quincenales (total del mes ÷ 2)', 'quincenas'], 12: ['En cuotas mensuales (total del año ÷ 12)', 'meses'] };
    let de = esNomina ? (r.cycle === 'semanal' ? 4 : r.cycle === 'quincenal' ? 2 : 1) : 1;
    const hoy = C.todayCo(), planVale = plan && (r.ref || esNomina);   // un gasto propio de Finanzas parte de su valor, no de un plan viejo
    let items = planVale ? plan.items.map((x) => ({ ...x })) : [{ concepto: r.vendor && esNomina ? `Nómina de ${monthName(mes)}` : r.name, valor: (Number(r.amount) || 0) * de }];
    const sumaMes = () => items.reduce((a, x) => a + (Number(x.valor) > 0 ? Math.round(Number(x.valor)) : 0), 0), parte = () => (de > 1 ? Math.round(sumaMes() / de) : sumaMes());
    let totalMes = sumaMes(), total0 = parte();
    let tot = total0, fu = [{ account_id: r.account_id || cuentas[0]?.id || '', valor: tot }];
    const efectivo = cuentas.find((a) => a.kind === 'efectivo'), banco = cuentas.find((a) => a.kind === 'banco') || cuentas.find((a) => a !== efectivo);
    const { el, m } = window.App.modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">Pagar · ${esc(r.vendor || r.name)}</h2><div class="small text-body-secondary">${esc(r.name)}${r.tax_id ? ` · ${esc(r.tax_id)}` : ''}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="mb-3"><label class="form-label small mb-1">Cómo se paga</label><select class="form-select" data-forma>${Object.entries(FORMAS).map(([n, f]) => `<option value="${n}" ${+n === de ? 'selected' : ''}>${f[0]}</option>`).join('')}</select></div>
        <ul class="list-group mb-1" data-items></ul>
        <button type="button" class="btn btn-sm btn-link px-0 mb-2" data-mas><i class="bi bi-plus-lg me-1"></i>Agregar ítem</button>
        <ul class="list-group mb-3" data-resumen></ul>
        <div class="mb-3"><label class="form-label small mb-1">Fecha del pago</label><input type="date" class="form-control" data-fecha value="${hoy}"></div>
        <div class="d-flex align-items-center mb-1"><label class="form-label small mb-0 flex-grow-1">De dónde sale</label><button type="button" class="btn btn-sm btn-outline-secondary" data-mitad><i class="bi bi-scissors me-1"></i>Mitad y mitad</button></div>
        <div data-fuentes></div><button type="button" class="btn btn-sm btn-link px-0" data-otra><i class="bi bi-plus-lg me-1"></i>Agregar otra cuenta</button><div class="small mt-1" data-dif></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-primary" data-ok>Registrar pago</button></div>`);
    const pintaItems = () => {
      el.querySelector('[data-items]').innerHTML = items.map((x, i) => `<li class="list-group-item d-flex gap-2 align-items-center" data-k="${i}"><input class="form-control form-control-sm" data-concepto value="${esc(x.concepto)}" maxlength="200" placeholder="Concepto" aria-label="Concepto"><div class="input-group input-group-sm" style="width:170px;flex:none"><span class="input-group-text">$</span><input class="form-control" type="number" min="0" step="1000" data-valor value="${x.valor || ''}" aria-label="Valor"></div>${items.length > 1 ? '<button type="button" class="btn btn-sm btn-light" data-quita aria-label="Quitar"><i class="bi bi-x-lg"></i></button>' : '<span style="width:2rem"></span>'}</li>`).join('');
    };
    const resumen = () => {
      totalMes = sumaMes(); tot = parte();
      el.querySelector('[data-resumen]').innerHTML = `${de > 1 ? `<li class="list-group-item d-flex justify-content-between"><span>Total del ${de === 12 ? 'año' : 'mes'}</span><b>${money(totalMes)}</b></li>` : ''}<li class="list-group-item d-flex justify-content-between bg-body-tertiary"><b>${de > 1 ? `Este pago · 1 de ${de} ${FORMAS[de][1]}` : 'Total a pagar'}</b><b>${money(tot)}</b></li>`;
      if (fu.length === 1) { fu[0].valor = tot; const v = el.querySelector('[data-j] [data-v]'); if (v) v.value = tot; }
      estado();
    };
    const dif = () => tot - fu.reduce((a, f) => a + (Number(f.valor) || 0), 0);
    const estado = () => { const d = dif(); el.querySelector('[data-dif]').innerHTML = d === 0 ? '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Cuadra con el total</span>' : `<span class="text-danger">${d > 0 ? 'Falta' : 'Sobra'} ${money(Math.abs(d))} para llegar a ${money(tot)}</span>`; el.querySelector('[data-ok]').disabled = d !== 0 || !(tot > 0); };
    const pinta = () => { el.querySelector('[data-fuentes]').innerHTML = fu.map((f, i) => `<div class="input-group mb-2" data-j="${i}"><select class="form-select" data-c aria-label="Cuenta"><option value="">Sin cuenta</option>${cuentas.map((a) => `<option value="${a.id}" ${a.id === f.account_id ? 'selected' : ''}>${esc(a.name)}${a.kind === 'efectivo' ? ' (efectivo)' : ''}</option>`).join('')}</select><span class="input-group-text">$</span><input class="form-control" type="number" min="0" step="1000" data-v value="${f.valor}" aria-label="Valor">${fu.length > 1 ? '<button type="button" class="btn btn-outline-secondary" data-x aria-label="Quitar"><i class="bi bi-x-lg"></i></button>' : ''}</div>`).join(''); estado(); };
    el.addEventListener('input', (e) => {
      if (e.target.matches('[data-forma]')) { de = Number(e.target.value); resumen(); return; }
      const li = e.target.closest('[data-k]');
      if (li) { const x = items[+li.dataset.k]; if (e.target.matches('[data-valor]')) x.valor = Math.max(0, Math.round(Number(e.target.value) || 0)); else x.concepto = e.target.value; resumen(); return; }
      const j = e.target.closest('[data-j]'); if (!j) return; const f = fu[+j.dataset.j];
      if (e.target.matches('[data-c]')) f.account_id = e.target.value ? Number(e.target.value) : ''; else f.valor = Math.round(Number(e.target.value) || 0); estado();
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-mas]')) { items.push({ concepto: '', valor: '' }); pintaItems(); return; }
      const q = e.target.closest('[data-quita]'); if (q) { items.splice(+q.closest('[data-k]').dataset.k, 1); pintaItems(); resumen(); return; }
      if (e.target.closest('[data-mitad]')) { const a = Math.floor(tot / 2); fu = [{ account_id: efectivo?.id || '', valor: a }, { account_id: banco?.id || '', valor: tot - a }]; pinta(); }
      if (e.target.closest('[data-otra]')) { fu.push({ account_id: '', valor: 0 }); pinta(); }
      const x = e.target.closest('[data-x]'); if (x) { fu.splice(+x.closest('[data-j]').dataset.j, 1); pinta(); }
    });
    el.querySelector('[data-ok]').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const lista = items.filter((x) => x.concepto && Number(x.valor) > 0).map((x) => ({ concepto: x.concepto, valor: Math.round(Number(x.valor)) }));
      try {
        const x = await api(`${B}/pagos-mes`, { method: 'POST', body: { month: mes, tipo: esNomina ? 'nomina' : 'servicios', key, tercero: r.vendor || r.name, tax_id: r.tax_id || '', cost_center_id: r.cost_center_id || null, recurring_id: r.id, partes: de, items: lista,
          pagar: true, fecha: el.querySelector('[data-fecha]').value, fuentes: fu.map((f) => ({ account_id: f.account_id || null, valor: f.valor })) } });
        toast(`Pago registrado en Movimientos${x.movimientos > 1 ? ` (${x.movimientos} cuentas)` : ''}`); m.hide(); despues?.();
      } catch (ex) { toast(ex.message, false); btn.disabled = false; }
    });
    pintaItems(); pinta(); resumen();
  }

  function recurrentes(el) {
    el.innerHTML = '<div class="dw-grid dw-grid--kpi mb-3" data-tot></div><div class="alert alert-light border small">Arriendo, internet, software, servicios y la nómina. Los que crea otra app (como la nómina de Equipo) se pagan allá; los demás se cobran solos cada día a las 3:00 a. m. o con el botón «Pagar».</div><div data-t></div>';
    let est = { pagados: [], por_pagar: [] };
    const CICLO = { mensual: 'mensual', anual: 'anual', quincenal: 'quincenal', semanal: 'semanal' };
    const cargaEstado = async () => {
      est = await api(`${B}/recurring/estado`).catch(() => est);
      C.kpis($('[data-tot]', el), [['Este mes', money((est.total_pagado || 0) + (est.total_por_pagar || 0)), `${monthName(est.mes || C.todayCo().slice(0, 7))}: lo pagado más lo que falta`, 'bi-calendar-month'],
        ['Pagado', money(est.total_pagado || 0), `${est.pagados.length} gasto${est.pagados.length === 1 ? '' : 's'} ya registrado${est.pagados.length === 1 ? '' : 's'}`, 'bi-check-circle'],
        ['Por pagar', `<span class="${est.total_por_pagar ? 'text-danger' : ''}">${money(est.total_por_pagar || 0)}</span>`, `${est.por_pagar.length} que vence${est.por_pagar.length === 1 ? '' : 'n'} antes de que acabe el mes`, 'bi-hourglass-split']]);
    };
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'recurring', title: 'gasto recurrente', newText: 'Nuevo gasto recurrente', refs: ['cost_centers', 'accounts'], fields: F.recurring, onChanged: () => cargaEstado().then(() => t.load()),
      filters: [{ k: 'category', options: [['', 'Todos los tipos'], ...Object.entries(REC_CAT)] }], defaults: () => ({ next_date: C.todayCo(), category: 'software' }),
      // Todo se paga aquí; los que gestiona otra app (nómina) tienen además el enlace a sus ítems
      rowActions: (r) => (!r.active || RO ? '' : `<button class="btn btn-sm btn-outline-primary" data-act="pagar"><i class="bi bi-cash-coin me-1"></i>Pagar</button>`),
      onAction: (a, r) => { if (a === 'pagar') pagarRecurrente(r, () => cargaEstado().then(() => t.load())); },
      empty: 'Agrega lo que pagas cada mes o cada año.', emptyIcon: 'bi-arrow-repeat',
      columns: [
        { label: 'Nombre', main: true, html: (r) => (r.category === 'nomina' && r.vendor ? `${esc(r.vendor)}${r.tax_id ? sub(r.tax_id) : ''}` : `${esc(r.name)}${sub(r.vendor)}${r.tax_id ? sub(r.tax_id) : ''}`) },
        { label: 'Tipo', html: (r) => `<span class="badge ${r.category === 'nomina' ? 'text-bg-info' : 'text-bg-light'}">${esc(REC_CAT[r.category] || r.category)}</span>` },
        { label: 'Valor', cls: 'text-end text-nowrap', html: (r) => (r.currency === 'USD' ? `<b>${usd(r.amount_usd)}</b> <span class="small text-body-secondary">${esc(CICLO[r.cycle] || r.cycle)}</span>${sub(`≈ ${money(r.amount)} hoy`)}` : `<b>${money(r.amount)}</b>${sub(r.notes && r.category === 'nomina' ? `${CICLO[r.cycle] || r.cycle} · ${r.notes}` : CICLO[r.cycle] || r.cycle)}`) },
        { label: 'Este mes', html: (r) => { const p = est.pagados.find((x) => x.recurring_id === r.id), x = est.por_pagar.find((y) => y.id === r.id); return p ? `${chip('ok', 'Pagado')}${sub(money(p.pagado))}` : x ? `${chip(x.fecha < C.todayCo() ? 'bad' : 'soon', 'Por pagar')}${sub(`vence ${day(x.fecha)}`)}` : '<span class="text-body-secondary">—</span>'; } },
        { label: 'Próximo cobro', html: (r) => `${day(r.next_date)}${r.active ? '' : ` ${chip('free', 'Pausado')}`}` },
        { label: 'Centro de costo', html: (r, R) => C.refName(R, 'cost_centers', r.cost_center_id) }] });
    cargaEstado().then(() => t.load());
    // Desde Equipo: «Pagar» de una persona abre aquí su pago (#pagar:<id del gasto>)
    const abrirId = abrirPagar;
    if (abrirId && !RO) { api(`${B}/recurring?limit=500`).then((x) => { const r = x.rows.find((y) => y.id === Number(abrirId)); if (r) pagarRecurrente(r, () => cargaEstado().then(() => t.load())); }).catch(() => {}); }
  }

  function centros(el) {
    el.innerHTML = '<div class="dw-grid dw-grid--kpi mb-3" data-tot></div><div data-cc></div><h2 class="h5 mt-4 mb-2">Presupuestos por mes</h2><div data-b></div>';
    const totales = () => api(`${B}/cost_centers/totales`).then((t) => C.kpis($('[data-tot]', el), [['Ingresos de los centros', money(t.ingresos), 'todo el tiempo', 'bi-arrow-down-circle'], ['Gastos de los centros', money(t.gastos), 'todo el tiempo', 'bi-arrow-up-circle'],
      ['Resultado', `<span class="${t.resultado < 0 ? 'text-danger' : 'text-success'}">${money(t.resultado)}</span>`, 'ingresos menos gastos', 'bi-graph-up'], ['Sin centro de costo', money(t.sin_centro.ingresos - t.sin_centro.gastos), `${t.sin_centro.movimientos} movimientos sin asignar`, 'bi-question-circle']])).catch(() => {});
    totales();
    const bud = C.table({ el: $('[data-b]', el), base: B, entity: 'budgets', title: 'presupuesto', newText: 'Nuevo presupuesto', refs: ['cost_centers'], fields: F.budgets,
      defaults: () => ({ month: C.todayCo().slice(0, 7) }), empty: 'Define cuánto puede gastar cada centro de costo al mes; el resumen lo compara con el gasto real.', emptyIcon: 'bi-bullseye',
      columns: [{ label: 'Mes', html: (r) => monthName(r.month) }, { label: 'Centro de costo', main: true, html: (r, R) => (r.cost_center_id ? C.refName(R, 'cost_centers', r.cost_center_id) : 'General') },
        { label: 'Categoría', html: (r) => esc(r.category || '—') }, { label: 'Presupuesto', cls: 'text-end', html: (r) => money(r.amount) }] });
    C.table({ el: $('[data-cc]', el), base: B, entity: 'cost_centers', title: 'centro de costo', newText: 'Nuevo centro de costo', fields: F.cost_centers,
      filters: [{ k: 'kind', options: [['', 'Todos'], ...Object.entries(CC_KIND)] }], onChanged: () => { bud.load(); totales(); },
      empty: 'Crea centros por sede, servicio, proyecto o área para saber cuánto cuesta y cuánto deja cada uno.', emptyIcon: 'bi-diagram-3',
      columns: [{ label: 'Centro de costo', main: true, html: (r) => `${esc(r.name)}${sub(r.code)}` },
        { label: 'Tipo', html: (r) => `<span class="badge text-bg-light">${esc(CC_KIND[r.kind] || r.kind)}</span>` },
        { label: 'Ingresos', cls: 'text-end', html: (r) => money(r.ingresos) }, { label: 'Gastos', cls: 'text-end', html: (r) => money(r.gastos) },
        { label: 'Total (resultado)', cls: 'text-end', html: (r) => `<b class="${r.resultado < 0 ? 'text-danger' : r.resultado > 0 ? 'text-success' : ''}">${money(r.resultado)}</b>${sub(`${r.movimientos} movimientos`)}` }, { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activo') : chip('free', 'Inactivo')) }] }).load();
    bud.load();
  }

  function summary(el) {
    el.innerHTML = `<div class="d-flex gap-2 align-items-center mb-3"><label class="small text-body-secondary" for="fMes">Mes</label><input class="form-control w-auto" type="month" id="fMes" data-m></div>
      <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div>
      <div class="dw-card mb-3"><h2 class="h6 mb-1">Flujo de caja</h2><p class="small text-body-secondary">6 meses reales y 3 proyectados con los gastos recurrentes y las facturas por vencer.</p><div data-flow></div></div>
      <div class="row g-3 mb-3"><div class="col-lg-7"><div class="dw-card h-100"><h2 class="h6">Presupuesto vs gasto real por centro de costo</h2><div data-cc></div></div></div>
        <div class="col-lg-5"><div class="dw-card h-100"><h2 class="h6">Gastos del mes por categoría</h2><div data-cat></div></div></div></div>
      <div class="row g-3 mb-3"><div class="col-lg-4"><div class="dw-card h-100"><h2 class="h6">Por cobrar</h2><div data-ar></div></div></div>
        <div class="col-lg-4"><div class="dw-card h-100"><h2 class="h6">Por pagar</h2><div data-ap></div></div></div>
        <div class="col-lg-4"><div class="dw-card h-100"><h2 class="h6">Gastos recurrentes al mes</h2><div data-rec></div></div></div></div>
      <div class="dw-card"><h2 class="h6">Cuentas</h2><div data-acc></div></div>`;
    const m = $('[data-m]', el);
    const aging = (a, kind) => `<div class="row row-cols-5 g-1 small text-center mb-2">${[['al_dia', 'Al día'], ['d30', '1–30'], ['d60', '31–60'], ['d90', '61–90'], ['mas90', '+90']].map(([k, l]) => `<div><div class="text-body-secondary">${l}</div><b class="${k !== 'al_dia' && a.buckets[k] ? 'text-danger' : ''}">${money(a.buckets[k])}</b></div>`).join('')}</div>
      ${a.items.length ? a.items.map((i) => `<div class="d-flex small py-1 border-top gap-2"><span class="flex-grow-1">${esc(i.counterparty)} · ${esc(i.number || '#' + i.id)}<br>${i.late > 0 ? `<span class="text-danger">${i.late} días vencida</span>` : `<span class="text-body-secondary">vence ${day(i.due_date)}</span>`}</span><b>${money(i.due)}</b></div>`).join('') : `<p class="small text-body-secondary mb-0">Nada ${kind}.</p>`}`;
    async function load() {
      let s; try { s = await api(`${B}/summary${m.value ? `?month=${m.value}` : ''}`); } catch (x) { $('[data-kpis]', el).innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
      m.value = s.month;
      C.kpis($('[data-kpis]', el), [
        ['Ingresos del mes', money(s.totals.income), '', 'bi-arrow-down-circle'], ['Gastos del mes', money(s.totals.expense), '', 'bi-arrow-up-circle'],
        ['Resultado', `<span class="${s.totals.net >= 0 ? 'text-success' : 'text-danger'}">${money(s.totals.net)}</span>`, '', 'bi-wallet2'],
        ['Presupuesto del mes', money(s.totals.budget), s.totals.budget ? `usado ${Math.round(s.totals.expense / s.totals.budget * 100)}%` : 'sin presupuesto', 'bi-bullseye'],
        ['Por cobrar', money(s.receivable.total), s.receivable.overdue ? `<span class="text-danger">${money(s.receivable.overdue)} vencido</span>` : 'al día', 'bi-hourglass-split'],
        ['Por pagar', money(s.payable.total), s.payable.overdue ? `<span class="text-danger">${money(s.payable.overdue)} vencido</span>` : 'al día', 'bi-receipt'],
        ['Recurrentes al mes', money(s.recurring_total), '', 'bi-arrow-repeat'],
        ['Banco sin conciliar', num(s.bank_pending), s.bank_pending ? 'líneas del extracto' : 'todo conciliado', 'bi-bank']]);
      C.bars($('[data-flow]', el), s.cash_flow.map((r) => ({ label: monthName(r.month), a: r.income, b: r.expense, projected: r.projected })), { la: 'Ingresos', lb: 'Gastos' });
      $('[data-cc]', el).innerHTML = s.cost_centers.length ? window.App.table([
        { label: 'Centro de costo', main: true, html: (c) => esc(c.name) }, { label: 'Ingresos', cls: 'text-end', html: (c) => money(c.income) },
        { label: 'Gasto', cls: 'text-end', html: (c) => money(c.expense) }, { label: 'Presupuesto', cls: 'text-end', html: (c) => money(c.budget) },
        { label: 'Uso', html: (c) => `<div style="min-width:120px">${C.meter(c.expense, c.budget)}</div>` }], s.cost_centers) : '<p class="small text-body-secondary mb-0">Sin movimientos ni presupuestos este mes.</p>';
      C.rank($('[data-cat]', el), s.expense_by_category, money);
      $('[data-ar]', el).innerHTML = aging(s.receivable, 'por cobrar');
      $('[data-ap]', el).innerHTML = aging(s.payable, 'por pagar');
      C.rank($('[data-rec]', el), Object.entries(s.recurring_monthly).map(([k, n]) => ({ k: REC_CAT[k] || k, n })), money);
      $('[data-acc]', el).innerHTML = s.accounts.length ? window.App.table([{ label: 'Cuenta', main: true, html: (a) => esc(a.name) }, { label: 'Tipo', html: (a) => esc(a.kind) },
        { label: 'Saldo según registros', cls: 'text-end', html: (a) => money(a.balance) }], s.accounts) : '<p class="small text-body-secondary mb-0">Agrega tus cuentas en «Bancos y conciliación».</p>';
    }
    m.onchange = load;
    load();
  }

  /* ---------- recibos de caja ---------- */
  // Recibo de caja sin cuenta de cobro (para quien cobra sin cuentas de cobro). Los demás recibos nacen de los cobros de una cuenta.
  async function nuevoRecibo(after) {
    const out = await C.form({ title: 'Nuevo recibo de caja', base: B, okText: 'Generar recibo',
      fields: [{ k: 'counterparty', label: 'Recibimos de', required: true }, { k: 'concept', label: 'Por concepto de', required: true }, { k: 'amount', label: 'Valor', type: 'money', required: true },
        { k: 'date', label: 'Fecha', type: 'date', required: true }, { k: 'method', label: 'Medio de pago', type: 'select', options: ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Otro'].map((x) => [x, x]) },
        { k: 'account_id', label: 'Cuenta donde entra', ref: 'accounts' }, { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'notes', label: 'Notas', type: 'long' }],
      values: { date: C.todayCo(), method: 'Efectivo' } });
    if (!out) return;
    try { const r = await api(`${B}/receipts`, { method: 'POST', body: out }); toast(`Recibo de caja ${r.receipt.number} generado`); window.open(`${B}/receipts/${r.receipt.id}/pdf`, '_blank', 'noopener'); after?.(); } catch (x) { toast(x.message, false); }
  }
  // Enlaces a los archivos de un recibo (comprobantes que subió el cliente en la app)
  const archivos = (files) => (files || []).map((f) => `<a class="btn btn-sm btn-outline-secondary" href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc(f.nombre)}"><i class="bi bi-paperclip me-1"></i>${esc(f.nombre.length > 18 ? f.nombre.slice(0, 16) + '…' : f.nombre)}</a>`).join(' ');

  /* ---------- facturas y cuentas de cobro ---------- */
  function invoices(el) {
    el.innerHTML = `<div class="alert alert-light border d-flex flex-wrap gap-2 align-items-center small"><span class="flex-grow-1">Crea tus cuentas de cobro con sus líneas (en pesos o en dólares con la TRM del día) y descárgalas en PDF con tus datos, consecutivo, QR de validación y datos de pago. Registra también las facturas que te llegan (por pagar).</span>
      ${me.canManage ? '<button class="btn btn-sm btn-outline-primary" data-sign><i class="bi bi-pen me-1"></i>Mi firma</button><button class="btn btn-sm btn-outline-primary" data-profile><i class="bi bi-person-vcard me-1"></i>Mis datos de facturación</button>' : ''}</div><div data-t></div>`;
    $('[data-profile]', el)?.addEventListener('click', billingProfile);
    $('[data-sign]', el)?.addEventListener('click', signatureDialog);
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'invoices', title: 'factura', newText: 'Nueva cuenta de cobro', refs: ['cost_centers'], fields: F.invoices,
      filters: [{ k: 'kind', options: [['', 'Cobros y cuentas por pagar'], ['emitida', 'Cobros (cuentas por cobrar)'], ['recibida', 'Por pagar (recibidas)']] }],
      extraButtons: RO ? '' : '<button class="btn btn-outline-primary" data-recibida><i class="bi bi-inbox me-1"></i>Factura recibida</button>',
      empty: 'Sin facturas. Crea tu primera cuenta de cobro o registra las que te llegan.', emptyIcon: 'bi-receipt',
      onEdit: (row, changed) => (row?.kind === 'recibida' ? simpleInvoice(row, changed) : invoiceEditor(row, changed)),
      columns: [
        { label: 'Documento', main: true, html: (r) => `${esc(r.number || '#' + r.id)}${sub(r.kind === 'emitida' ? 'Por cobrar' : 'Por pagar')}` },
        { label: 'Tercero', html: (r) => `${esc(r.counterparty)}${sub(r.tax_id)}` },
        { label: 'Emisión', html: (r) => day(r.issue_date) }, { label: 'Vence', html: (r) => day(r.due_date) },
        { label: 'Total', cls: 'text-end', html: (r) => money(r.total) }, { label: 'Saldo', cls: 'text-end', html: (r) => money(Math.max(0, r.total - r.paid)) },
        { label: 'Estado', html: (r) => chip(...(INV_STATE[r.state] || ['free', r.state])) }],
      rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="ver"><i class="bi bi-eye me-1"></i>Ver</button>',
      onAction: (a, r) => { if (a === 'ver') detalleCuenta(r.id, () => t.load()); } });
    t.load();
    $('[data-recibida]', el)?.addEventListener('click', () => simpleInvoice(null, () => t.load()));
    const openPdf = (id) => window.open(`${B}/invoices/${id}/pdf`, '_blank', 'noopener');

    async function simpleInvoice(row, changed) {
      const out = await C.form({ title: row ? 'Editar factura por pagar' : 'Factura recibida (por pagar)', fields: F.invoices, base: B,
        values: row || { kind: 'recibida', issue_date: C.todayCo() }, onDelete: row && me.canManage ? () => api(`${B}/invoices/${row.id}`, { method: 'DELETE' }) : null });
      if (out === 'deleted') { toast('Borrada'); return changed(); }
      if (!out) return;
      try { await api(row ? `${B}/invoices/${row.id}` : `${B}/invoices`, { method: row ? 'PATCH' : 'POST', body: out }); toast('Guardada'); changed(); } catch (x) { toast(x.message, false); }
    }

    // La cuenta con todo lo suyo: su PDF, sus pagos con el recibo (PDF) y los archivos que lo acompañan (comprobantes).
    async function detalleCuenta(id, changed) {
      const { el: mo } = window.App.modal('<div class="modal-body"><p class="text-body-secondary mb-0">Cargando…</p></div>', { size: 'modal-lg' });
      const pinta = async () => {
        let d; try { d = await api(`${B}/invoices/${id}/detalle`); } catch (x) { mo.querySelector('.modal-content').innerHTML = `<div class="modal-body text-danger">${esc(x.message)}</div>`; return; }
        const f = d.factura, saldo = Math.max(0, f.total - f.paid), cobro = f.kind === 'emitida';
        mo.querySelector('.modal-content').innerHTML = `<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">${esc(f.number || '#' + f.id)} · ${esc(f.counterparty)}</h2><div class="small text-body-secondary">${cobro ? 'Cuenta por cobrar' : 'Cuenta por pagar'} · ${day(f.issue_date)}${f.due_date ? ` · vence ${day(f.due_date)}` : ''}</div></div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><div class="row g-2 mb-3"><div class="col-4"><div class="small text-body-secondary">Total</div><b>${money(f.total)}</b></div><div class="col-4"><div class="small text-body-secondary">${cobro ? 'Cobrado' : 'Pagado'}</div><b class="text-success">${money(f.paid)}</b></div>
            <div class="col-4"><div class="small text-body-secondary">Saldo</div><b class="${saldo ? 'text-danger' : ''}">${money(saldo)}</b> ${chip(...(INV_STATE[f.state] || ['free', f.state]))}</div></div>
            <div class="d-flex flex-wrap gap-2 mb-3">${cobro ? '<button class="btn btn-sm btn-outline-secondary" data-cuenta><i class="bi bi-filetype-pdf me-1"></i>Ver la cuenta de cobro (PDF)</button>' : ''}
              ${!RO && ['pendiente', 'vencida'].includes(f.state) ? `<button class="btn btn-sm btn-primary" data-cobrar><i class="bi bi-cash me-1"></i>${cobro ? 'Registrar cobro' : 'Registrar pago'}</button>` : ''}</div>
            <h3 class="h6">${cobro ? 'Pagos recibidos' : 'Pagos registrados'}</h3>
            ${cobro ? (d.recibos.length ? `<ul class="list-group">${d.recibos.map((x) => `<li class="list-group-item d-flex flex-wrap gap-2 align-items-center ${x.voided ? 'opacity-50' : ''}"><div class="flex-grow-1"><b>${esc(x.number)}</b>${x.voided ? ' ' + chip('free', 'Anulado') : ''}
                <div class="small text-body-secondary">${day(x.date)} · ${esc(x.method || '—')}${x.concept ? ` · ${esc(x.concept)}` : ''}</div></div><b class="${x.voided ? 'text-decoration-line-through' : ''}">${money(x.amount)}</b>
                <button class="btn btn-sm btn-outline-secondary" data-recibo="${x.id}"><i class="bi bi-filetype-pdf me-1"></i>Recibo</button>${archivos(x.files)}
                ${me.canManage && !x.voided && !RO ? `<button class="btn btn-sm btn-outline-danger" data-void="${x.id}" data-n="${esc(x.number)}" aria-label="Anular recibo"><i class="bi bi-x-circle"></i></button>` : ''}</li>`).join('')}</ul>` : '<p class="small text-body-secondary mb-0">Aún no hay pagos.</p>')
            : (d.pagos.length ? `<ul class="list-group">${d.pagos.map((x) => `<li class="list-group-item d-flex gap-2"><div class="flex-grow-1">${day(x.date)}<div class="small text-body-secondary">${esc(x.description || '')}</div></div><b>${money(x.amount)}</b></li>`).join('')}</ul>` : '<p class="small text-body-secondary mb-0">Aún no hay pagos.</p>')}</div>`;
        mo.querySelector('[data-cuenta]')?.addEventListener('click', () => openPdf(f.id));
        mo.querySelector('[data-cobrar]')?.addEventListener('click', async () => { await (cobro ? payReceipt : payInvoice)({ ...f }, async () => { await pinta(); changed?.(); }); });
        mo.querySelectorAll('[data-recibo]').forEach((b) => b.addEventListener('click', () => window.open(`${B}/receipts/${b.dataset.recibo}/pdf`, '_blank', 'noopener')));
        mo.querySelectorAll('[data-void]').forEach((b) => b.addEventListener('click', async () => {
          if (!(await confirm({ title: `¿Anular el recibo ${b.dataset.n}?`, text: 'El ingreso se quita y la cuenta de cobro vuelve a deber ese valor.', ok: 'Anular', danger: true }))) return;
          try { await api(`${B}/receipts/${b.dataset.void}/void`, { method: 'POST' }); toast('Recibo anulado'); await pinta(); changed?.(); } catch (x) { toast(x.message, false); }
        }));
      };
      pinta();
    }

    // Pago de una factura recibida (por pagar): queda como gasto ligado a la factura.
    async function payInvoice(inv, after) {
      const out = await C.form({ title: `Pago de ${inv.number || '#' + inv.id}`, base: B,
        fields: [{ k: 'date', label: 'Fecha', type: 'date', required: true }, { k: 'amount', label: 'Monto (COP)', type: 'money', required: true }, { k: 'account_id', label: 'Cuenta', ref: 'accounts' }],
        values: { date: C.todayCo(), amount: inv.total - inv.paid } });
      if (!out) return;
      try { await api(`${B}/invoices/${inv.id}/pay`, { method: 'POST', body: out }); toast('Registrado: queda como movimiento ligado a la factura'); await after?.(); } catch (x) { toast(x.message, false); }
    }

    // Ventana para pagar una cuenta por cobrar: genera un recibo de caja (se pueden hacer varios hasta cubrir el saldo).
    async function payReceipt(inv, after) {
      const saldo = Math.max(0, inv.total - inv.paid);
      const out = await C.form({ title: `Pago de ${inv.number || '#' + inv.id} · ${inv.counterparty}`, base: B, okText: 'Generar recibo de caja',
        fields: [{ k: 'date', label: 'Fecha', type: 'date', required: true }, { k: 'amount', label: `Monto (saldo ${money(saldo)})`, type: 'money', required: true },
          { k: 'method', label: 'Medio de pago', type: 'select', options: ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Otro'].map((x) => [x, x]) },
          { k: 'account_id', label: 'Cuenta donde entra', ref: 'accounts' }, { k: 'notes', label: 'Notas', type: 'long' }],
        values: { date: C.todayCo(), amount: saldo, method: 'Transferencia' } });
      if (!out) return;
      try {
        const r = await api(`${B}/invoices/${inv.id}/receipts`, { method: 'POST', body: out });
        toast(`Recibo de caja ${r.receipt.number} generado`);
        window.open(`${B}/receipts/${r.receipt.id}/pdf`, '_blank', 'noopener');
        await after?.();
      } catch (x) { toast(x.message, false); }
    }

    // Editor de cuenta de cobro con líneas (COP o USD con TRM)
    async function invoiceEditor(row, changed) {
      if (RO && !row) return;
      const prof = await api(`${B}/billing/profile`).catch(() => ({ due_days: 15 }));
      const v = row ? { ...row } : { kind: 'emitida', issue_date: C.todayCo(), due_date: new Date(Date.now() - 5 * 3600000 + (prof.due_days || 15) * 86400000).toISOString().slice(0, 10) };
      let lines = []; try { lines = JSON.parse(v.items || '[]'); } catch {}
      if (!lines.length) lines = row ? [{ concepto: v.concept || 'Servicios', cantidad: 1, moneda: 'COP', valor: v.subtotal || v.total || 0 }] : [{ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }];
      const ccs = await C.refs(B, 'cost_centers');
      const { el: d, m } = modal(`<form class="needs-validation" novalidate>
        <div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${row ? `Cuenta de cobro ${esc(row.number || '#' + row.id)}` : 'Nueva cuenta de cobro'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body">
          ${row?.number ? '' : `<p class="small text-body-secondary">El número se asigna solo (${esc(prof.prefix || '')}…).</p>`}
          <div class="row g-2">
            <div class="col-12"><label class="form-label small mb-1">Cliente</label><input class="form-control" name="counterparty" required value="${esc(v.counterparty || '')}"></div>
            <div class="col-sm-4"><label class="form-label small mb-1">NIT o documento</label><input class="form-control" name="tax_id" value="${esc(v.tax_id || '')}"></div>
            <div class="col-sm-4"><label class="form-label small mb-1">Ciudad</label><input class="form-control" name="client_city" value="${esc(v.client_city || '')}"></div>
            <div class="col-sm-4"><label class="form-label small mb-1">Correo del cliente</label><input class="form-control" name="client_email" type="email" value="${esc(v.client_email || '')}"></div>
            <div class="col-sm-6"><label class="form-label small mb-1">Fecha</label><input class="form-control" name="issue_date" type="date" required value="${esc(v.issue_date || '')}"></div>
            <div class="col-sm-6"><label class="form-label small mb-1">Pagar antes del</label><input class="form-control" name="due_date" type="date" value="${esc(v.due_date || '')}"></div>
            <div class="col-12"><label class="form-label small mb-1">Por concepto de <span class="text-body-secondary">· párrafo que explica el cobro (opcional)</span></label><textarea class="form-control" name="concept" rows="2">${esc(v.concept || '')}</textarea></div>
          </div>
          <div class="mt-3 dw-invlines" data-lines></div>
          <button class="btn btn-sm btn-outline-primary mt-1" type="button" data-add><i class="bi bi-plus-lg me-1"></i>Agregar línea</button>
          <div class="d-flex flex-wrap gap-3 align-items-center justify-content-between mt-3 p-3 rounded-3" style="background:var(--dw-activo-bg)">
            <span class="small text-body-secondary" data-trm></span>
            <span class="d-flex align-items-center gap-2 small">Impuestos (si aplica) <input class="form-control form-control-sm" name="tax" type="number" min="0" step="1" value="${esc(v.tax || '')}" style="width:130px"></span>
            <span>Total <b class="fs-4" data-total>$0</b></span></div>
          <div class="row g-2 mt-1">
            <div class="col-sm-6"><label class="form-label small mb-1">Centro de costo</label><select class="form-select" name="cost_center_id"><option value="">—</option>${ccs.map((x) => `<option value="${x.id}" ${String(x.id) === String(v.cost_center_id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
            <div class="col-sm-6"><label class="form-label small mb-1">Categoría</label><input class="form-control" name="category" value="${esc(v.category || '')}"></div>
            ${row ? `<div class="col-sm-6"><label class="form-label small mb-1">Estado</label><select class="form-select" name="status">${[['pendiente', 'Pendiente'], ['pagada', 'Pagada'], ['anulada', 'Anulada']].map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
            <div class="col-12"><label class="form-label small mb-1">Notas internas <span class="text-body-secondary">· no salen en el PDF</span></label><textarea class="form-control" name="notes" rows="1">${esc(v.notes || '')}</textarea></div>
          </div>
          ${row && row.kind === 'emitida' ? `<div class="mt-3 p-3 rounded-3 border" data-recibos>
            <div class="d-flex flex-wrap gap-2 align-items-center mb-2"><h3 class="h6 mb-0 me-auto"><i class="bi bi-cash-coin me-1"></i>Recibos de caja</h3><span class="small text-body-secondary" data-saldo></span>
              ${RO ? '' : '<button type="button" class="btn btn-sm btn-primary" data-nuevo-rc><i class="bi bi-plus-lg me-1"></i>Registrar pago</button>'}</div>
            <div data-rcs><span class="small text-body-secondary">Cargando…</span></div></div>` : '<p class="small text-body-secondary mt-3 mb-0">Cuando la guardes podrás registrar los pagos: cada pago genera su recibo de caja (pueden ser varios).</p>'}
          <div class="small text-danger mt-2" data-err></div></div>
        <div class="modal-footer border-0 pt-0 justify-content-between"><span>${row && me.canManage ? '<button type="button" class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
          <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-outline-primary" value="save">Guardar</button> <button class="btn btn-primary" value="pdf"><i class="bi bi-filetype-pdf me-1"></i>Guardar y ver PDF</button></span></div></form>`, { size: 'modal-xl' });
      const f = $('form', d), box = $('[data-lines]', d);
      let rate = null, rateDate = null;
      const n = (x) => Number(String(x ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
      const lineHtml = (l, i) => `<div class="row g-2 align-items-start mb-2 dw-invline" data-i="${i}">
          <div class="col-12 col-md-5"><input class="form-control" data-k="concepto" value="${esc(l.concepto || '')}" placeholder="Concepto" aria-label="Concepto"><input class="form-control form-control-sm mt-1" data-k="detalle" value="${esc(l.detalle || '')}" placeholder="Detalle (opcional)" aria-label="Detalle"></div>
          <div class="col-3 col-md-1"><input class="form-control" data-k="cantidad" type="number" min="0" step="any" value="${esc(l.cantidad ?? 1)}" aria-label="Cantidad"></div>
          <div class="col-4 col-md-2"><select class="form-select" data-k="moneda" aria-label="Moneda"><option value="COP" ${l.moneda !== 'USD' ? 'selected' : ''}>COP</option><option value="USD" ${l.moneda === 'USD' ? 'selected' : ''}>USD</option></select></div>
          <div class="col-5 col-md-2"><input class="form-control" data-k="valor" type="number" min="0" step="any" value="${esc(l.valor ?? '')}" placeholder="Valor unitario" aria-label="Valor unitario"></div>
          <div class="col-10 col-md-1 text-md-end pt-2"><b data-lt>$0</b></div>
          <div class="col-2 col-md-1 text-end"><button class="btn btn-sm btn-light" type="button" data-rm aria-label="Quitar línea"><i class="bi bi-x-lg"></i></button></div></div>`;
      const read = () => { $$('.dw-invline', box).forEach((r) => { const l = lines[+r.dataset.i]; $$('[data-k]', r).forEach((x) => { l[x.dataset.k] = x.value; }); }); };
      function calc() {
        read();
        let total = 0;
        $$('.dw-invline', box).forEach((r) => {
          const l = lines[+r.dataset.i];
          const lt = Math.round((l.moneda === 'USD' ? n(l.valor) * (rate || l.trm || 0) : n(l.valor)) * (n(l.cantidad) || 1));
          total += lt; $('[data-lt]', r).textContent = money(lt);
        });
        total += n(f.tax.value);
        $('[data-total]', d).textContent = money(total);
        $('[data-trm]', d).textContent = lines.some((l) => l.moneda === 'USD') ? (rate ? `TRM oficial del ${day(rateDate)}: $${rate.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'TRM: se calcula al guardar') : '';
      }
      const draw = () => { box.innerHTML = lines.map(lineHtml).join(''); calc(); };
      async function ensureRate() {
        const date = f.issue_date.value;
        if (!lines.some((l) => l.moneda === 'USD') || (rate && rateDate === date)) return;
        rateDate = date; rate = null; $('[data-trm]', d).textContent = 'Buscando la TRM…';
        try { rate = (await api(`${B}/billing/fx?date=${date}`)).rate; } catch { rate = null; }
        calc();
      }
      // Recibos de caja de esta cuenta: se ven aquí y se crean pagando un monto desde una ventana.
      if (row?.kind === 'emitida') {
        const rcBox = $('[data-rcs]', d);
        const loadRc = async () => {
          const [{ rows }, inv] = await Promise.all([api(`${B}/invoices/${row.id}/receipts`), api(`${B}/invoices/${row.id}`).catch(() => row)]);
          const saldo = Math.max(0, inv.total - inv.paid);
          $('[data-saldo]', d).innerHTML = `Pagado <b>${money(inv.paid)}</b> de ${money(inv.total)} · saldo <b class="${saldo ? '' : 'text-success'}">${money(saldo)}</b>`;
          const btn = $('[data-nuevo-rc]', d); if (btn) btn.hidden = saldo <= 0 || inv.status === 'anulada';
          rcBox.innerHTML = rows.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Recibo</th><th>Fecha</th><th>Medio</th><th class="text-end">Valor</th><th></th></tr></thead><tbody>${rows.map((x) => `<tr class="${x.voided ? 'text-body-secondary' : ''}">
              <td>${esc(x.number)}${x.voided ? ' ' + chip('free', 'Anulado') : ''}</td><td>${day(x.date)}</td><td>${esc(x.method || '—')}</td><td class="text-end ${x.voided ? 'text-decoration-line-through' : ''}">${money(x.amount)}</td>
              <td class="text-end text-nowrap"><button type="button" class="btn btn-sm btn-outline-secondary" data-rcpdf="${x.id}"><i class="bi bi-printer me-1"></i>Recibo</button>${me.canManage && !x.voided && !RO ? ` <button type="button" class="btn btn-sm btn-outline-danger" data-rcvoid="${x.id}" data-n="${esc(x.number)}" aria-label="Anular"><i class="bi bi-x-circle"></i></button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
            : '<span class="small text-body-secondary">Aún no hay pagos. Cada pago que registres genera un recibo de caja.</span>';
        };
        loadRc();
        $('[data-nuevo-rc]', d)?.addEventListener('click', async () => { const inv = await api(`${B}/invoices/${row.id}`).catch(() => row); await payReceipt(inv, async () => { await loadRc(); changed(); }); });
        rcBox.addEventListener('click', async (e) => {
          const pdf = e.target.closest('[data-rcpdf]'), vd = e.target.closest('[data-rcvoid]');
          if (pdf) window.open(`${B}/receipts/${pdf.dataset.rcpdf}/pdf`, '_blank', 'noopener');
          if (vd && (await confirm({ title: `¿Anular el recibo ${vd.dataset.n}?`, text: 'El ingreso se quita y la cuenta de cobro vuelve a deber ese valor.', ok: 'Anular', danger: true }))) {
            try { await api(`${B}/receipts/${vd.dataset.rcvoid}/void`, { method: 'POST' }); toast('Recibo anulado'); await loadRc(); changed(); } catch (x) { toast(x.message, false); }
          }
        });
      }
      draw(); ensureRate();
      box.addEventListener('input', calc);
      box.addEventListener('change', (e) => { if (e.target.dataset.k === 'moneda') { read(); ensureRate(); } calc(); });
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; read(); lines.splice(+b.closest('.dw-invline').dataset.i, 1); if (!lines.length) lines.push({ cantidad: 1, moneda: 'COP' }); draw(); });
      $('[data-add]', d).onclick = () => { read(); lines.push({ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }); draw(); $$('.dw-invline [data-k=concepto]', box).pop().focus(); };
      f.issue_date.addEventListener('change', ensureRate);
      f.tax.addEventListener('input', calc);
      $('[data-del]', d)?.addEventListener('click', async () => {
        if (!(await confirm({ title: `¿Borrar la cuenta de cobro ${row.number || '#' + row.id}?`, text: 'No se puede deshacer.' }))) return;
        await api(`${B}/invoices/${row.id}`, { method: 'DELETE' }); m.hide(); toast('Borrada'); changed();
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        f.classList.add('was-validated');
        if (!f.checkValidity()) return;
        read();
        const items = lines.filter((l) => String(l.concepto || '').trim()).map((l) => ({ concepto: l.concepto.trim(), detalle: (l.detalle || '').trim(), cantidad: n(l.cantidad) || 1, moneda: l.moneda, valor: n(l.valor), ...(l.moneda === 'USD' && rate ? { trm: rate } : {}) }));
        if (!items.length) { $('[data-err]', d).textContent = 'Agrega al menos una línea con su concepto.'; return; }
        if (items.some((i) => !(i.valor > 0))) { $('[data-err]', d).textContent = 'Cada línea necesita un valor mayor que cero.'; return; }
        const body = { kind: 'emitida', counterparty: f.counterparty.value.trim(), tax_id: f.tax_id.value.trim(), client_city: f.client_city.value.trim(), client_email: f.client_email.value.trim(),
          issue_date: f.issue_date.value, due_date: f.due_date.value, concept: f.concept.value.trim(), items, tax: n(f.tax.value), cost_center_id: f.cost_center_id.value, category: f.category.value.trim(), notes: f.notes.value.trim(),
          ...(row ? { status: f.status.value } : {}) };
        const wantPdf = e.submitter?.value === 'pdf';
        try {
          const r = await api(row ? `${B}/invoices/${row.id}` : `${B}/invoices`, { method: row ? 'PATCH' : 'POST', body });
          m.hide(); toast(row ? 'Guardada' : 'Cuenta de cobro creada'); changed();
          if (wantPdf) openPdf(row ? row.id : r.id);
        } catch (x) { $('[data-err]', d).textContent = x.message; }
      });
    }
  }

  // Firma de las cuentas de cobro: subir una foto (se le quita el fondo) o dibujarla
  async function signatureDialog() {
    const prof = await api(`${B}/billing/profile`);
    const { el: d, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Mi firma</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Sale sobre la línea de firma de tus cuentas de cobro. Firma en una hoja blanca con lapicero oscuro y tómale una foto de cerca, o dibújala aquí.</p>
        <ul class="nav nav-pills mb-2" data-mode><li class="nav-item"><button class="nav-link active" type="button" data-m="up"><i class="bi bi-upload me-1"></i>Subir foto</button></li><li class="nav-item"><button class="nav-link" type="button" data-m="draw"><i class="bi bi-pen me-1"></i>Dibujarla</button></li></ul>
        <div data-up><label class="d-block border border-2 border-dashed rounded-3 p-4 text-center text-body-secondary" style="cursor:pointer;border-style:dashed!important"><input type="file" accept="image/*" hidden><i class="bi bi-image fs-3 d-block"></i>Toca para elegir la foto de tu firma</label></div>
        <div data-draw hidden><canvas width="1200" height="420" style="width:100%;aspect-ratio:1200/420;background:#fff;border-radius:12px;touch-action:none;cursor:crosshair" data-pad></canvas><div class="d-flex justify-content-between mt-1 small text-body-secondary">Firma con el mouse o el dedo<button class="btn btn-sm btn-light" type="button" data-clear>Borrar trazo</button></div></div>
        <div class="small text-body-secondary mt-3">Así se verá</div><div class="rounded-3 p-2 d-flex align-items-center justify-content-center" style="background:#fff;min-height:90px" data-prev>${prof.signature ? `<img src="${esc(prof.signature)}" alt="" style="max-height:110px;max-width:100%">` : '<span style="color:#888">Aún no hay firma</span>'}</div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${prof.signature ? '<button type="button" class="btn btn-sm btn-outline-danger" data-rmsig>Quitar firma</button>' : ''}</span><span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary" data-yes disabled>Guardar firma</button></span></div></form>`);
    let result = null, drawn = false;
    const preview = (url) => { result = url; $('[data-prev]', d).innerHTML = url ? `<img src="${url}" alt="" style="max-height:110px;max-width:100%">` : '<span style="color:#888">Aún no hay firma</span>'; $('[data-yes]', d).disabled = !url; };
    function clean(src) {
      const w = src.width, h = src.height, ctx = src.getContext('2d'), img = ctx.getImageData(0, 0, w, h), px = img.data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2], a = px[i + 3];
        if (!(a > 40 && l < 150)) { px[i + 3] = 0; continue; }
        px[i + 3] = Math.min(255, Math.round((150 - l) * 2.2 + 90) * (a / 255));
        const p = i / 4, x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
      if (x1 < 0) throw new Error('No encontré la firma: usa una foto con buena luz, fondo blanco y tinta oscura.');
      ctx.putImageData(img, 0, 0);
      const pad = 10, cw = x1 - x0 + 1 + pad * 2, ch = y1 - y0 + 1 + pad * 2, k = Math.min(1, 600 / cw, 220 / ch);
      const out = document.createElement('canvas'); out.width = Math.round(cw * k); out.height = Math.round(ch * k);
      out.getContext('2d').drawImage(src, x0 - pad, y0 - pad, cw, ch, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    }
    $('[data-mode]', d).onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; $$('[data-m]', d).forEach((x) => x.classList.toggle('active', x === b)); $('[data-up]', d).hidden = b.dataset.m !== 'up'; $('[data-draw]', d).hidden = b.dataset.m !== 'draw'; };
    $('[data-up] input', d).onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const img = new Image();
      img.onload = () => {
        try { const k = Math.min(1, 1800 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); preview(clean(cv)); $('[data-err]', d).textContent = ''; }
        catch (x) { $('[data-err]', d).textContent = x.message; }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => { $('[data-err]', d).textContent = 'No pude abrir esa imagen. Prueba con una foto JPG o PNG.'; };
      img.src = URL.createObjectURL(file);
    };
    const pad = $('[data-pad]', d), g = pad.getContext('2d');
    g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#14112b';
    let down = false, last = null;
    const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    pad.addEventListener('pointerdown', (e) => { down = true; last = pos(e); pad.setPointerCapture(e.pointerId); });
    pad.addEventListener('pointermove', (e) => { if (!down) return; const p = pos(e); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; drawn = true; });
    const end = () => { if (!down) return; down = false; if (drawn) try { const cv = document.createElement('canvas'); cv.width = pad.width; cv.height = pad.height; cv.getContext('2d').drawImage(pad, 0, 0); preview(clean(cv)); } catch {} };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    $('[data-clear]', d).onclick = () => { g.clearRect(0, 0, pad.width, pad.height); drawn = false; preview(null); };
    $('[data-rmsig]', d)?.addEventListener('click', async () => { try { await api(`${B}/billing/profile`, { method: 'PUT', body: { signature: '' } }); toast('Firma quitada'); m.hide(); } catch (x) { $('[data-err]', d).textContent = x.message; } });
    $('form', d).onsubmit = async (e) => {
      e.preventDefault(); if (!result) return;
      try { await api(`${B}/billing/profile`, { method: 'PUT', body: { signature: result } }); toast('Firma guardada: ya sale en tus cuentas de cobro'); m.hide(); }
      catch (x) { $('[data-err]', d).textContent = x.message; }
    };
  }

  // Datos de quien cobra (salen en todas las cuentas de cobro del negocio)
  async function billingProfile() {
    const p = await api(`${B}/billing/profile`);
    const out = await C.form({ title: 'Mis datos de facturación', base: B, okText: 'Guardar', values: p, fields: [
      { k: 'title', label: 'Nombre del documento', placeholder: 'Cuenta de cobro' }, { k: 'prefix', label: 'Prefijo del consecutivo', placeholder: 'CC-' },
      { k: 'next_number', label: 'Siguiente número', type: 'int' }, { k: 'due_days', label: 'Días para pagar', type: 'int' },
      { k: 'issuer_name', label: 'Nombre de quien cobra', full: true }, { k: 'issuer_doc_label', label: 'Tipo de documento', placeholder: 'NIT o C.C.' }, { k: 'issuer_doc', label: 'Número' },
      { k: 'issuer_doc_city', label: 'Expedido en' }, { k: 'signer_doc_label', label: 'Documento en la firma', placeholder: 'Cédula de ciudadanía' },
      { k: 'brand', label: 'Marca' }, { k: 'tagline', label: 'Frase de la marca' }, { k: 'city', label: 'Ciudad' },
      { k: 'phone', label: 'Teléfono' }, { k: 'email', label: 'Correo' }, { k: 'web', label: 'Sitio web' }, { k: 'whatsapp', label: 'WhatsApp para comprobantes', hint: 'con indicativo: 57…' },
      { k: 'bank', label: 'Banco' }, { k: 'account_type', label: 'Tipo de cuenta', type: 'select', options: [['ahorros', 'Ahorros'], ['corriente', 'Corriente']] }, { k: 'account_number', label: 'Número de cuenta' },
      { k: 'breb_key', label: 'Llave Bre-B', hint: 'cédula, celular, correo o alfanumérica' },
      { k: 'legal', label: 'Nota legal (al final)', type: 'long' }] });
    if (!out) return;
    try { await api(`${B}/billing/profile`, { method: 'PUT', body: out }); toast('Datos de facturación guardados'); } catch (x) { toast(x.message, false); }
  }

  /* ---------- bancos y conciliación ---------- */
  async function banks(el) {
    el.innerHTML = `<div data-acc></div>
      <div class="dw-card mt-3" data-imp><h2 class="h6">Importar extracto (CSV)</h2>
        <p class="small text-body-secondary">Descarga el extracto de tu banco en CSV (o guárdalo como CSV desde Excel). Elige la cuenta y el archivo, y marca qué columna es cada dato. Se concilia solo lo que coincide en valor, sentido y fecha (±3 días).</p>
        <div class="d-flex flex-wrap gap-2"><select class="form-select w-auto" data-acct aria-label="Cuenta"></select><input class="form-control w-auto" type="file" accept=".csv,text/csv" data-file aria-label="Archivo CSV" ${RO || !me.canManage ? 'disabled' : ''}></div>
        <div data-map class="mt-3"></div></div>
      <div class="dw-card mt-3"><div class="d-flex flex-wrap gap-2 align-items-center mb-2"><h2 class="h6 mb-0 flex-grow-1">Líneas del extracto</h2><select class="form-select w-auto" data-filter aria-label="Cuenta"></select></div><div data-lines></div></div>`;
    const accTable = C.table({ el: $('[data-acc]', el), base: B, entity: 'accounts', title: 'cuenta', newText: 'Nueva cuenta', fields: F.accounts, onChanged: fillAccounts,
      empty: 'Agrega tus cuentas bancarias, de efectivo o billeteras.', emptyIcon: 'bi-bank',
      rowActions: () => '<button class="btn btn-sm btn-primary" data-act="conciliar"><i class="bi bi-check2-square me-1"></i>Conciliar</button>',
      onAction: (a, r) => { if (a === 'conciliar') conciliar(r.id); },
      columns: [{ label: 'Cuenta', main: true, html: (r) => `${esc(r.name)}${r.last4 ? ` <span class="text-body-secondary">···${esc(r.last4)}</span>` : ''}` },
        { label: 'Tipo', html: (r) => esc(r.kind) }, { label: 'Banco', html: (r) => esc(r.bank || '—') }, { label: 'Saldo mes anterior', cls: 'text-end', html: (r) => `<b class="${r.saldo_mes_anterior < 0 ? 'text-danger' : ''}">${money(r.saldo_mes_anterior)}</b>${sub('con lo que cerró el mes pasado')}` },
        { label: 'Movimiento del mes', cls: 'text-end', html: (r) => `<b class="${r.movimiento_mes < 0 ? 'text-danger' : r.movimiento_mes > 0 ? 'text-success' : ''}">${r.movimiento_mes > 0 ? '+' : ''}${money(r.movimiento_mes)}</b>${sub('entró menos salió este mes')}` },
        { label: 'Total en cuenta', cls: 'text-end', html: (r) => `<b class="${r.balance < 0 ? 'text-danger' : ''}">${money(r.balance)}</b>${r.sin_conciliar ? `<div class="small text-danger fw-normal">Sin conciliar ${money(r.valor_sin_conciliar)} (${r.sin_conciliar})</div>` : r.movimientos ? '<div class="small text-success fw-normal">Todo conciliado</div>' : '<div class="small text-body-secondary fw-normal">Sin movimientos</div>'}` }] });
    // Conciliación de una cuenta en una ventana fija: por mes, con lo que quedó sin conciliar de meses anteriores. «Vi el movimiento» marca y «Guardar» concilia.
    async function conciliar(id) {
      let d; try { d = await api(`${B}/accounts/${id}/conciliacion?estado=todos`); } catch (x) { toast(x.message, false); return; }
      $('[data-acct]', el).value = String(id); $('[data-filter]', el).value = String(id); loadLines();
      let rows = d.rows.map((m) => ({ ...m, marca: !!m.reconciled })), ocultar = false, guardando = false, mes = C.todayCo().slice(0, 7);   // marca = lo que se ve marcado; reconciled = lo ya guardado
      const hoyMes = C.todayCo().slice(0, 7);
      const moverMes = (m, n) => { const [y, mm] = m.split('-').map(Number), t = y * 12 + mm - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
      const mo = document.createElement('div');
      mo.className = 'modal fade'; mo.tabIndex = -1;
      mo.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg"><div class="modal-content">
        <div class="modal-header"><div><h2 class="modal-title h5 mb-0">Conciliar · ${esc(d.cuenta.name)}</h2><div class="small text-body-secondary">Toca «Vi el movimiento» en los pagos que ya salieron en tu extracto del banco y luego «Guardar».</div></div><button type="button" class="btn-close" data-cerrar aria-label="Cerrar"></button></div>
        <div class="modal-body"><div class="d-flex align-items-center gap-2 mb-3"><button type="button" class="btn btn-light" data-mes="-1" aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button><b class="flex-grow-1 text-center text-capitalize" data-mes-nombre></b>
            <button type="button" class="btn btn-light" data-mes="1" aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button><button type="button" class="btn btn-light" data-mes="hoy">Este mes</button></div>
          <div class="row g-2 mb-3" data-resumen></div><div data-anteriores></div>
          <div class="d-flex flex-wrap align-items-center gap-2 mb-2"><h3 class="h6 mb-0 flex-grow-1 text-capitalize" data-titulo-mes></h3><div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="soloPend" data-solo><label class="form-check-label small" for="soloPend">Ocultar los ya conciliados</label></div></div>
          <div class="table-responsive"><table class="table table-sm align-middle mb-0"><tbody data-filas></tbody></table></div></div>
        <div class="modal-footer justify-content-between"><span class="small text-body-secondary" data-estado></span><span class="d-flex gap-2"><button type="button" class="btn btn-light" data-cerrar>Cerrar</button>${RO ? '' : '<button type="button" class="btn btn-primary" data-guardar disabled><i class="bi bi-check2-square me-1"></i>Guardar conciliación</button>'}</span></div></div></div>`;
      document.body.appendChild(mo);
      const modal = new bootstrap.Modal(mo, { backdrop: 'static', keyboard: false });   // no se cierra por error: hay cambios sin guardar
      mo.addEventListener('hidden.bs.modal', () => mo.remove());
      const cambios = () => rows.filter((m) => m.marca !== !!m.reconciled);
      const signed = (m) => (m.kind === 'ingreso' ? m.amount : -m.amount);
      const suma = (l) => l.reduce((a, m) => a + signed(m), 0);
      const nombreMes = (m) => monthName(m);
      const orden = (l) => [...l].sort((p, q) => (p.reconciled ? 1 : 0) - (q.reconciled ? 1 : 0) || q.date.localeCompare(p.date) || q.id - p.id);
      const fila = (m) => `<tr data-m="${m.id}" class="${m.marca !== !!m.reconciled ? 'table-warning' : m.reconciled ? 'table-success' : ''}">
        <td class="text-nowrap">${day(m.date)}</td><td>${esc(m.description || m.category || '—')}${sub(m.counterparty)}</td>
        <td class="text-end text-nowrap"><b class="${m.kind === 'ingreso' ? 'text-success' : ''}">${m.kind === 'ingreso' ? '+' : '−'}${money(m.amount)}</b>${m.receipt_id ? ` <a class="btn btn-sm btn-outline-secondary py-0 px-1" href="${B}/receipts/${m.receipt_id}/pdf" target="_blank" rel="noopener" title="Ver el recibo ${esc(m.receipt_number)} (PDF)"><i class="bi bi-filetype-pdf"></i></a>` : ''}${(m.receipt_files || []).map((f) => ` <a class="btn btn-sm btn-outline-secondary py-0 px-1" href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc(f.nombre)}"><i class="bi bi-paperclip"></i></a>`).join('')}</td>
        <td class="text-end text-nowrap" style="width:11rem">${m.marca !== !!m.reconciled ? '<span class="badge text-bg-warning me-1">Sin guardar</span>' : m.reconciled ? '<span class="text-success small fw-semibold me-1"><i class="bi bi-check-circle-fill"></i></span>' : ''}${RO ? '' : `<button type="button" class="btn btn-sm ${m.marca ? 'btn-success' : 'btn-outline-secondary'}" data-marca="${m.id}" aria-pressed="${m.marca}">${m.marca ? '<i class="bi bi-check2 me-1"></i>Visto' : 'Vi el movimiento'}</button>`}</td></tr>`;
      const pinta = () => {
        const ant = moverMes(mes, -1), delMes = (m) => rows.filter((x) => x.date.slice(0, 7) === m);
        const esteMes = delMes(mes), mesAnt = delMes(ant), sinAnteriores = rows.filter((x) => x.date.slice(0, 7) < mes && !x.reconciled);
        const sinDe = (l) => l.filter((x) => !x.reconciled), tarjeta = (titulo, l) => `<div class="col-6"><div class="dw-card py-2"><div class="small text-body-secondary text-capitalize">${titulo}</div><b class="fs-5 ${suma(l) < 0 ? 'text-danger' : ''}">${money(suma(l))}</b>
          <div class="small ${sinDe(l).length ? 'text-danger' : 'text-body-secondary'}">${sinDe(l).length ? `Sin conciliar ${money(suma(sinDe(l)))} (${sinDe(l).length})` : l.length ? 'Todo conciliado' : 'Sin movimientos'}</div></div></div>`;
        $('[data-mes-nombre]', mo).textContent = nombreMes(mes);
        mo.querySelector('[data-mes="1"]').disabled = mes >= hoyMes;
        $('[data-resumen]', mo).innerHTML = tarjeta(`Total ${mes === hoyMes ? 'mes anterior' : nombreMes(ant)}`, mesAnt) + tarjeta(mes === hoyMes ? 'Total este mes' : `Total ${nombreMes(mes)}`, esteMes);
        $('[data-anteriores]', mo).innerHTML = sinAnteriores.length ? `<div class="alert alert-warning py-2 mb-3"><div class="d-flex flex-wrap gap-2 align-items-center"><div class="flex-grow-1"><b><i class="bi bi-exclamation-triangle me-1"></i>Sin conciliar de meses anteriores: ${money(suma(sinAnteriores))}</b>
            <span class="small">(${sinAnteriores.length} movimiento${sinAnteriores.length === 1 ? '' : 's'})</span></div><button type="button" class="btn btn-sm btn-outline-dark" data-ver-ant>${verAnt ? 'Ocultar' : 'Verlos aquí'}</button></div>
            ${verAnt ? `<div class="table-responsive mt-2 bg-body rounded"><table class="table table-sm align-middle mb-0"><tbody>${orden(sinAnteriores).map(fila).join('')}</tbody></table></div>` : ''}</div>` : '';
        const lista = orden(esteMes).filter((m) => !ocultar || !m.reconciled);
        $('[data-titulo-mes]', mo).textContent = `Movimientos de ${nombreMes(mes)}`;
        $('[data-filas]', mo).innerHTML = lista.length ? lista.map(fila).join('') : `<tr><td class="text-body-secondary small">${esteMes.length ? 'Todo lo de este mes ya está conciliado.' : 'No hay movimientos de esta cuenta en este mes.'}</td></tr>`;
        const n = cambios().length, g = $('[data-guardar]', mo);
        $('[data-estado]', mo).textContent = n ? `${n} cambio${n === 1 ? '' : 's'} sin guardar` : '';
        if (g) { g.disabled = !n || guardando; g.innerHTML = guardando ? '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…' : `<i class="bi bi-check2-square me-1"></i>Guardar conciliación${n ? ` (${n})` : ''}`; }
      };
      let verAnt = false;
      mo.addEventListener('change', (e) => { if (e.target.matches('[data-solo]')) { ocultar = e.target.checked; pinta(); } });
      mo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-marca]');
        if (b) { const m = rows.find((x) => x.id === Number(b.dataset.marca)); m.marca = !m.marca; return pinta(); }   // «Vi el movimiento»: marca o desmarca (se guarda abajo)
        const nav = e.target.closest('[data-mes]');
        if (nav) { mes = nav.dataset.mes === 'hoy' ? hoyMes : moverMes(mes, Number(nav.dataset.mes)); if (mes > hoyMes) mes = hoyMes; return pinta(); }
        if (e.target.closest('[data-ver-ant]')) { verAnt = !verAnt; pinta(); }
      });
      const cerrar = async () => { if (cambios().length && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cierras, se pierden las marcas que no guardaste.', ok: 'Cerrar sin guardar', danger: true }))) return; modal.hide(); };
      mo.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
      $('[data-guardar]', mo)?.addEventListener('click', async () => {
        const lote = cambios(); guardando = true; pinta();
        const fallos = [];
        for (const m of lote) {
          try { await api(`${B}/movements/${m.id}`, { method: 'PATCH', body: { reconciled: m.marca ? 1 : 0 } }); m.reconciled = m.marca ? 1 : 0; } catch (x) { fallos.push(x.message); }
        }
        guardando = false; pinta(); accTable.load();   // los conciliados bajan al final y el saldo de la cuenta se actualiza
        if (fallos.length) toast(`No se pudieron guardar ${fallos.length}: ${fallos[0]}`, false); else toast(`${lote.length} movimiento${lote.length === 1 ? '' : 's'} conciliado${lote.length === 1 ? '' : 's'}`);
      });
      pinta(); modal.show();
    }
    accTable.load();
    async function fillAccounts() {
      C.dropRefs(B, 'accounts');
      const accs = await C.refs(B, 'accounts');
      $('[data-acct]', el).innerHTML = accs.length ? accs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('') : '<option value="">Primero crea una cuenta</option>';
      $('[data-filter]', el).innerHTML = '<option value="">Todas las cuentas</option>' + accs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    }
    await fillAccounts();
    const parseCsv = (text) => {
      const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
      const rows = []; let row = [], cell = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
        else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows.filter((r) => r.some((x) => x.trim()));
    };
    const toNum = (s) => { s = String(s || '').replace(/[^\d,.-]/g, ''); if (!s) return 0; if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); return Number(s) || 0; };
    const toDate = (s) => { s = String(s || '').trim(); let mm; if ((mm = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return `${mm[1]}-${mm[2].padStart(2, '0')}-${mm[3].padStart(2, '0')}`; if ((mm = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/))) return `${mm[3].length === 2 ? '20' + mm[3] : mm[3]}-${mm[2].padStart(2, '0')}-${mm[1].padStart(2, '0')}`; return null; };
    $('[data-file]', el).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const rows = parseCsv(await file.text());
      if (rows.length < 2) { toast('El archivo no tiene filas', false); return; }
      const head = rows[0], guess = (re) => head.findIndex((h) => re.test(h.toLowerCase()));
      const sel = (name, idx, none) => `<div class="col-sm-4 col-lg-2"><label class="form-label small mb-1">${name}</label><select class="form-select form-select-sm" data-c="${name}">${none ? '<option value="-1">— ninguna —</option>' : ''}${head.map((h, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(h || 'Columna ' + (i + 1))}</option>`).join('')}</select></div>`;
      $('[data-map]', el).innerHTML = `<div class="row g-2">${sel('Fecha', guess(/fecha|date/))}${sel('Descripción', guess(/desc|concepto|detalle/))}${sel('Valor', guess(/valor|monto|importe|amount/), true)}${sel('Débito', guess(/d[eé]bito|cargo|retiro|salida/), true)}${sel('Crédito', guess(/cr[eé]dito|abono|consign|entrada/), true)}${sel('Referencia', guess(/ref|doc|comprobante/), true)}</div>
        <p class="small text-body-secondary mt-2">${rows.length - 1} filas. Si el banco trae una sola columna de valor, los retiros deben venir en negativo; si trae débito y crédito, déjalas marcadas y la de valor en «ninguna».</p>
        <button class="btn btn-primary" data-go><i class="bi bi-upload me-1"></i>Importar y conciliar</button>`;
      $('[data-go]', el).onclick = async () => {
        const col = Object.fromEntries($$('[data-c]', el).map((s) => [s.dataset.c, Number(s.value)]));
        const lines = rows.slice(1).map((r) => {
          const amount = col.Valor >= 0 ? toNum(r[col.Valor]) : toNum(r[col['Crédito']]) - Math.abs(toNum(r[col['Débito']]));
          return { date: toDate(r[col.Fecha]), description: r[col['Descripción']] || '', amount: Math.round(amount), ref: col.Referencia >= 0 ? r[col.Referencia] : null };
        }).filter((l) => l.date && l.amount);
        if (!lines.length) { toast('No se encontraron filas con fecha y valor', false); return; }
        try { const r = await api(`${B}/bank-import`, { method: 'POST', body: { account_id: Number($('[data-acct]', el).value), lines } }); toast(`${r.imported} líneas importadas · ${r.matched} conciliadas solas`); $('[data-map]', el).innerHTML = ''; e.target.value = ''; loadLines(); }
        catch (x) { toast(x.message, false); }
      };
    };
    async function loadLines() {
      const acc = $('[data-filter]', el).value;
      const [{ lines }, ccs] = await Promise.all([api(`${B}/bank-lines${acc ? `?account_id=${acc}` : ''}`), C.refs(B, 'cost_centers')]);
      $('[data-lines]', el).innerHTML = lines.length ? `<div class="table-responsive-md"><table class="table dw-table align-middle mb-0"><thead><tr><th>Fecha</th><th>Descripción</th><th class="text-end">Valor</th><th>Conciliación</th></tr></thead><tbody>${lines.map((l) => `<tr data-line="${l.id}">
          <td data-label="Fecha">${day(l.date)}</td><td data-label="Descripción" class="dw-td-main">${esc(l.description || '—')}${sub(l.ref)}</td>
          <td data-label="Valor" class="text-end ${l.amount > 0 ? 'text-success' : ''}">${money(l.amount)}</td>
          <td data-label="Conciliación">${l.movement_id ? `${chip('ok', 'Conciliada')} <span class="small text-body-secondary">${esc(l.m_description || l.m_category || '')}</span> <button class="btn btn-sm btn-light" data-unlink>Deshacer</button>`
            : `<div class="d-flex flex-wrap gap-1 justify-content-end justify-content-md-start">${(l.candidates || []).map((mv) => `<button class="btn btn-sm btn-outline-primary" data-match="${mv.id}" title="${esc(mv.description || '')}">${day(mv.date)} · ${esc((mv.description || mv.counterparty || '').slice(0, 24))}</button>`).join('')}
               <select class="form-select form-select-sm w-auto" data-cc aria-label="Centro de costo"><option value="">Centro de costo…</option>${ccs.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
               <input class="form-control form-control-sm" data-cat placeholder="Categoría" style="width:130px" aria-label="Categoría"><button class="btn btn-sm btn-primary" data-create>Crear movimiento</button></div>`}</td></tr>`).join('')}</tbody></table></div>`
        : window.App.empty('bi-file-earmark-spreadsheet', 'Aún no hay extractos importados.');
    }
    $('[data-filter]', el).onchange = loadLines;
    $('[data-lines]', el).addEventListener('click', async (e) => {
      const tr = e.target.closest('[data-line]'); if (!tr) return;
      let body = null;
      if (e.target.closest('[data-match]')) body = { movement_id: Number(e.target.closest('[data-match]').dataset.match) };
      if (e.target.closest('[data-create]')) body = { create: { category: $('[data-cat]', tr).value.trim(), cost_center_id: $('[data-cc]', tr).value || null } };
      if (e.target.closest('[data-unlink]')) body = { unlink: true };
      if (!body) return;
      try { await api(`${B}/bank-lines/${tr.dataset.line}/match`, { method: 'POST', body }); toast(body.unlink ? 'Conciliación deshecha' : 'Conciliada'); loadLines(); } catch (x) { toast(x.message, false); }
    });
    loadLines();
  }

  function exportView(el) {
    const t = C.todayCo(), first = t.slice(0, 8) + '01';
    el.innerHTML = `<div class="dw-card" style="max-width:720px"><h2 class="h6">Exportar para el contador</h2>
      <p class="small text-body-secondary">Archivos CSV (separados por punto y coma, listos para Excel en español) con los movimientos o facturas del periodo, su centro de costo, cuenta y conciliación.</p>
      <div class="row g-2"><div class="col-sm-6"><label class="form-label small mb-1" for="xFrom">Desde</label><input class="form-control" type="date" id="xFrom" data-from value="${first}"></div><div class="col-sm-6"><label class="form-label small mb-1" for="xTo">Hasta</label><input class="form-control" type="date" id="xTo" data-to value="${t}"></div></div>
      <div class="d-flex gap-2 mt-3"><button class="btn btn-primary" data-x="movements"><i class="bi bi-download me-1"></i>Movimientos</button><button class="btn btn-outline-primary" data-x="invoices"><i class="bi bi-download me-1"></i>Facturas</button></div></div>`;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const qs = new URLSearchParams({ kind: b.dataset.x, from: $('[data-from]', el).value, to: $('[data-to]', el).value });
      try { await C.download(`${B}/export?${qs}`, 'export.csv'); } catch (x) { toast(x.message, false); }
    });
  }

  // Informes del analista: los escribe el asistente de IA del negocio (conexión MCP) con los datos del mes.
  function reports(el) {
    el.innerHTML = `<div class="alert alert-light border small">Pídele a tu asistente de IA (Configuración → IA · Conexiones): <i>«Escribe el informe de finanzas de este mes y guárdalo»</i>. Usa los números de Finanzas y lo deja aquí.</div><div data-r></div>`;
    C.table({ el: $('[data-r]', el), base: B, entity: 'reports', title: 'informe', newText: 'Escribir informe', readOnly: RO, emptyIcon: 'bi-journal-text', empty: 'Aún no hay informes.',
      fields: [{ k: 'title', label: 'Título', required: true, full: true }, { k: 'content', label: 'Informe', type: 'long', required: true }],
      defaults: () => ({ title: `Finanzas · ${day(C.todayCo())}` }), fixed: { origen: 'manual' },
      columns: [{ label: 'Informe', main: true, html: (r) => `${esc(r.title)}${sub((r.content || '').slice(0, 140))}` },
        { label: 'Origen', html: (r) => chip(r.origen === 'ia' ? 'ok' : 'free', r.origen === 'ia' ? 'Asistente IA' : 'Manual') }, { label: 'Fecha', html: (r) => window.App.fecha(r.created_at) }],
      rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="ver">Leer</button>',
      onAction: (a, r) => modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${esc(r.title)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body"><div style="white-space:pre-wrap">${esc(r.content)}</div></div>`, { size: 'modal-lg' }) }).load();
  }

  segBtn($('[data-seg]'), VIEWS, (k) => { view = k; render(); }, view);
  render();
});

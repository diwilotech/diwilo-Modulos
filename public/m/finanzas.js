// Página del módulo Finanzas (Finance Hub de Diwilo): resumen, ingresos y gastos, facturas y cartera, recurrentes,
// centros de costo y presupuestos, bancos y conciliación, exportar.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud;
  const { money, num, day, monthName, chip } = C;
  const B = '/api/finanzas';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const RO = me.business.readOnly;
  const REC_CAT = { infraestructura: 'Infraestructura', software: 'Software', api: 'API', ia: 'IA', marketing: 'Marketing', otro: 'Otro' };
  const CC_KIND = { proyecto: 'Proyecto', app: 'App', cliente: 'Cliente', departamento: 'Departamento' };
  const INV_STATE = { pendiente: ['soon', 'Pendiente'], vencida: ['bad', 'Vencida'], pagada: ['ok', 'Pagada'], anulada: ['free', 'Anulada'] };
  const usd = (n) => `US$${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usdLine = (r) => (r.currency === 'USD' && r.amount_usd ? `<div class="small text-body-secondary fw-normal">${usd(r.amount_usd)}${r.fx_rate ? ` · TRM ${Number(r.fx_rate).toLocaleString('es-CO', { maximumFractionDigits: 2 })}` : ''}</div>` : '');
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');

  const VIEWS = [['resumen', 'Resumen', 'bi-pie-chart'], ['movimientos', 'Ingresos y gastos', 'bi-arrow-down-up'], ['facturas', 'Facturas y cartera', 'bi-receipt'],
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
      { k: 'cycle', label: 'Ciclo', type: 'select', options: [['mensual', 'Mensual'], ['anual', 'Anual']] }, { k: 'next_date', label: 'Próximo cobro', type: 'date', required: true },
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
      { k: 'bank', label: 'Banco' }, { k: 'last4', label: 'Últimos 4 dígitos' }, { k: 'opening_balance', label: 'Saldo inicial (COP)', type: 'money' }],
  };

  let view = (location.hash || '#resumen').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'resumen';
  function render() {
    history.replaceState(null, '', `#${view}`);
    const old = $('[data-view]'), el = old.cloneNode(false);
    old.replaceWith(el);
    ({ resumen: summary, movimientos, facturas: invoices, recurrentes, centros, bancos: banks, informes: reports, exportar: exportView })[view](el);
  }

  function movimientos(el) {
    C.table({ el, base: B, entity: 'movements', title: 'movimiento', newText: 'Nuevo movimiento', refs: ['cost_centers', 'accounts'], fields: F.movements,
      filters: [{ k: 'kind', options: [['', 'Ingresos y gastos'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos']] }], defaults: () => ({ kind: 'gasto', date: C.todayCo() }),
      empty: 'Sin movimientos. Los gastos recurrentes y los cobros de facturas los crean solos.', emptyIcon: 'bi-arrow-down-up',
      columns: [
        { label: 'Fecha', html: (r) => day(r.date) },
        { label: 'Descripción', main: true, html: (r) => `${esc(r.description || r.category || '—')}${sub(r.counterparty)}` },
        { label: 'Categoría', html: (r) => (r.category ? `<span class="badge text-bg-light">${esc(r.category)}</span>` : '—') },
        { label: 'Centro de costo', html: (r, R) => C.refName(R, 'cost_centers', r.cost_center_id) },
        { label: 'Cuenta', html: (r, R) => C.refName(R, 'accounts', r.account_id) },
        { label: 'Monto', cls: 'text-end text-nowrap', html: (r) => `<b class="${r.kind === 'ingreso' ? 'text-success' : ''}">${r.kind === 'ingreso' ? '+' : '−'}${money(r.amount)}</b>${usdLine(r)}` },
        { label: 'Conciliado', html: (r) => (r.reconciled ? '<i class="bi bi-check-circle text-success" title="Conciliado"></i>' : '') }] }).load();
  }

  function recurrentes(el) {
    el.innerHTML = '<div class="alert alert-light border small">Arriendo, internet, software y servicios que se cobran solos. Cada día, a las 3:00 a. m., los que vencen se registran como gasto en su centro de costo y la fecha pasa al siguiente cobro.</div><div data-t></div>';
    C.table({ el: $('[data-t]', el), base: B, entity: 'recurring', title: 'gasto recurrente', newText: 'Nuevo gasto recurrente', refs: ['cost_centers', 'accounts'], fields: F.recurring,
      filters: [{ k: 'category', options: [['', 'Todos los tipos'], ...Object.entries(REC_CAT)] }], defaults: () => ({ next_date: C.todayCo(), category: 'software' }),
      empty: 'Agrega lo que pagas cada mes o cada año.', emptyIcon: 'bi-arrow-repeat',
      columns: [
        { label: 'Gasto', main: true, html: (r) => `${esc(r.name)}${sub(r.vendor)}` },
        { label: 'Tipo', html: (r) => `<span class="badge text-bg-light">${esc(REC_CAT[r.category] || r.category)}</span>` },
        { label: 'Valor', cls: 'text-end text-nowrap', html: (r) => (r.currency === 'USD' ? `<b>${usd(r.amount_usd)}</b> <span class="small text-body-secondary">${esc(r.cycle)}</span>${sub(`≈ ${money(r.amount)} hoy`)}` : `${money(r.amount)}${sub(r.cycle)}`) },
        { label: 'Próximo cobro', html: (r) => day(r.next_date) },
        { label: 'Centro de costo', html: (r, R) => C.refName(R, 'cost_centers', r.cost_center_id) },
        { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activo') : chip('free', 'Pausado')) }] }).load();
  }

  function centros(el) {
    el.innerHTML = '<div data-cc></div><h2 class="h5 mt-4 mb-2">Presupuestos por mes</h2><div data-b></div>';
    const bud = C.table({ el: $('[data-b]', el), base: B, entity: 'budgets', title: 'presupuesto', newText: 'Nuevo presupuesto', refs: ['cost_centers'], fields: F.budgets,
      defaults: () => ({ month: C.todayCo().slice(0, 7) }), empty: 'Define cuánto puede gastar cada centro de costo al mes; el resumen lo compara con el gasto real.', emptyIcon: 'bi-bullseye',
      columns: [{ label: 'Mes', html: (r) => monthName(r.month) }, { label: 'Centro de costo', main: true, html: (r, R) => (r.cost_center_id ? C.refName(R, 'cost_centers', r.cost_center_id) : 'General') },
        { label: 'Categoría', html: (r) => esc(r.category || '—') }, { label: 'Presupuesto', cls: 'text-end', html: (r) => money(r.amount) }] });
    C.table({ el: $('[data-cc]', el), base: B, entity: 'cost_centers', title: 'centro de costo', newText: 'Nuevo centro de costo', fields: F.cost_centers,
      filters: [{ k: 'kind', options: [['', 'Todos'], ...Object.entries(CC_KIND)] }], onChanged: () => bud.load(),
      empty: 'Crea centros por sede, servicio, proyecto o área para saber cuánto cuesta y cuánto deja cada uno.', emptyIcon: 'bi-diagram-3',
      columns: [{ label: 'Centro de costo', main: true, html: (r) => `${esc(r.name)}${sub(r.code)}` },
        { label: 'Tipo', html: (r) => `<span class="badge text-bg-light">${esc(CC_KIND[r.kind] || r.kind)}</span>` }, { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activo') : chip('free', 'Inactivo')) }] }).load();
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

  /* ---------- facturas y cuentas de cobro ---------- */
  function invoices(el) {
    el.innerHTML = `<div class="alert alert-light border d-flex flex-wrap gap-2 align-items-center small"><span class="flex-grow-1">Crea tus cuentas de cobro con sus líneas (en pesos o en dólares con la TRM del día) y descárgalas en PDF con tus datos, consecutivo, QR de validación y datos de pago. Registra también las facturas que te llegan (por pagar).</span>
      ${me.canManage ? '<button class="btn btn-sm btn-outline-primary" data-sign><i class="bi bi-pen me-1"></i>Mi firma</button><button class="btn btn-sm btn-outline-primary" data-profile><i class="bi bi-person-vcard me-1"></i>Mis datos de facturación</button>' : ''}</div><div data-t></div>`;
    $('[data-profile]', el)?.addEventListener('click', billingProfile);
    $('[data-sign]', el)?.addEventListener('click', signatureDialog);
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'invoices', title: 'factura', newText: 'Nueva cuenta de cobro', refs: ['cost_centers'], fields: F.invoices,
      filters: [{ k: 'kind', options: [['', 'Por cobrar y por pagar'], ['emitida', 'Por cobrar (emitidas)'], ['recibida', 'Por pagar (recibidas)']] }],
      extraButtons: RO ? '' : '<button class="btn btn-outline-primary" data-recibida><i class="bi bi-inbox me-1"></i>Factura recibida</button>',
      empty: 'Sin facturas. Crea tu primera cuenta de cobro o registra las que te llegan.', emptyIcon: 'bi-receipt',
      onEdit: (row, changed) => (row?.kind === 'recibida' ? simpleInvoice(row, changed) : invoiceEditor(row, changed)),
      columns: [
        { label: 'Documento', main: true, html: (r) => `${esc(r.number || '#' + r.id)}${sub(r.kind === 'emitida' ? 'Por cobrar' : 'Por pagar')}` },
        { label: 'Tercero', html: (r) => `${esc(r.counterparty)}${sub(r.tax_id)}` },
        { label: 'Emisión', html: (r) => day(r.issue_date) }, { label: 'Vence', html: (r) => day(r.due_date) },
        { label: 'Total', cls: 'text-end', html: (r) => money(r.total) }, { label: 'Saldo', cls: 'text-end', html: (r) => money(Math.max(0, r.total - r.paid)) },
        { label: 'Estado', html: (r) => chip(...(INV_STATE[r.state] || ['free', r.state])) }],
      rowActions: (r) => `${r.kind === 'emitida' ? '<button class="btn btn-sm btn-outline-secondary" data-act="pdf"><i class="bi bi-filetype-pdf me-1"></i>PDF</button> ' : ''}${['pendiente', 'vencida'].includes(r.state) && !RO ? `<button class="btn btn-sm btn-outline-primary" data-act="pay"><i class="bi bi-cash me-1"></i>${r.kind === 'emitida' ? 'Registrar cobro' : 'Registrar pago'}</button>` : ''}`,
      onAction: async (a, r) => {
        if (a === 'pdf') return openPdf(r.id);
        if (a !== 'pay') return;
        const out = await C.form({ title: `${r.kind === 'emitida' ? 'Cobro' : 'Pago'} de ${r.number || '#' + r.id}`, base: B,
          fields: [{ k: 'date', label: 'Fecha', type: 'date', required: true }, { k: 'amount', label: 'Monto (COP)', type: 'money', required: true }, { k: 'account_id', label: 'Cuenta', ref: 'accounts' }],
          values: { date: C.todayCo(), amount: r.total - r.paid } });
        if (!out) return;
        try { await api(`${B}/invoices/${r.id}/pay`, { method: 'POST', body: out }); toast('Registrado: queda como movimiento ligado a la factura'); t.load(); } catch (x) { toast(x.message, false); }
      } });
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
      <div class="dw-card mt-3"><h2 class="h6">Importar extracto (CSV)</h2>
        <p class="small text-body-secondary">Descarga el extracto de tu banco en CSV (o guárdalo como CSV desde Excel). Elige la cuenta y el archivo, y marca qué columna es cada dato. Se concilia solo lo que coincide en valor, sentido y fecha (±3 días).</p>
        <div class="d-flex flex-wrap gap-2"><select class="form-select w-auto" data-acct aria-label="Cuenta"></select><input class="form-control w-auto" type="file" accept=".csv,text/csv" data-file aria-label="Archivo CSV" ${RO || !me.canManage ? 'disabled' : ''}></div>
        <div data-map class="mt-3"></div></div>
      <div class="dw-card mt-3"><div class="d-flex flex-wrap gap-2 align-items-center mb-2"><h2 class="h6 mb-0 flex-grow-1">Líneas del extracto</h2><select class="form-select w-auto" data-filter aria-label="Cuenta"></select></div><div data-lines></div></div>`;
    const accTable = C.table({ el: $('[data-acc]', el), base: B, entity: 'accounts', title: 'cuenta', newText: 'Nueva cuenta', fields: F.accounts, onChanged: fillAccounts,
      empty: 'Agrega tus cuentas bancarias, de efectivo o billeteras.', emptyIcon: 'bi-bank',
      columns: [{ label: 'Cuenta', main: true, html: (r) => `${esc(r.name)}${r.last4 ? ` <span class="text-body-secondary">···${esc(r.last4)}</span>` : ''}` },
        { label: 'Tipo', html: (r) => esc(r.kind) }, { label: 'Banco', html: (r) => esc(r.bank || '—') }, { label: 'Saldo inicial', cls: 'text-end', html: (r) => money(r.opening_balance) }] });
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

  C.seg($('[data-seg]'), VIEWS, (k) => { view = k; render(); }, view);
  render();
});

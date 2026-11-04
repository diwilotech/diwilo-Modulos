// Página del módulo Proyectos: proyectos/clientes, cotizaciones (PDF con firma, paso a cuenta de cobro) y las cuentas de cobro de cada proyecto.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud, { money, day, chip } = C;
  const B = '/api/proyectos', F = '/api/finanzas', RO = me.business.readOnly;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');
  const PROY = { propuesta: ['soon', 'Propuesta'], activo: ['ok', 'Activo'], terminado: ['free', 'Terminado'], cancelado: ['bad', 'Cancelado'] };
  const COT = { borrador: ['free', 'Borrador'], enviada: ['soon', 'Enviada'], aprobada: ['ok', 'Aprobada'], rechazada: ['bad', 'Rechazada'] };
  const COB = { pendiente: ['soon', 'Sin pagar'], vencida: ['bad', 'Vencida'], pagada: ['ok', 'Pagada'], anulada: ['free', 'Anulada'] };
  const VIEWS = [['proyectos', 'Proyectos'], ['cotizaciones', 'Cotizaciones'], ['cobros', 'Cuentas de cobro']];
  let view = (location.hash || '#proyectos').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'proyectos';
  const pdf = (url) => window.open(url, '_blank', 'noopener');
  const root = $('[data-view]');

  // Resumen en una línea y botón a los datos y la firma (viven en Finanzas)
  const cabecera = async () => {
    const s = await api(`${B}/summary`).catch(() => null);
    $('[data-acciones]').innerHTML = `<a class="btn btn-outline-primary btn-sm" href="${location.pathname.startsWith('/admin/m/') ? '/admin/#finanzas' : '/staff/finanzas.html'}"><i class="bi bi-pen me-1"></i>Mi firma y datos de cobro</a>`;
    $('[data-seg]').insertAdjacentHTML('beforebegin', s ? `<p class="text-body-secondary small mb-2">${s.proyectos_abiertos} proyectos abiertos · ${s.por_aprobar.cantidad} cotizaciones por aprobar (${money(s.por_aprobar.total)}) · ${s.cuentas_de_cobro_pendientes.cantidad} cuentas de cobro sin pagar (${money(s.cuentas_de_cobro_pendientes.saldo)})</p>` : '');
  };

  function proyectos(el) {
    const fields = [{ k: 'name', label: 'Proyecto', required: true }, { k: 'client', label: 'Cliente', required: true }, { k: 'tax_id', label: 'NIT / CC' }, { k: 'client_city', label: 'Ciudad' }, { k: 'client_email', label: 'Correo' },
      { k: 'status', label: 'Estado', type: 'select', options: Object.entries(PROY).map(([k, v]) => [k, v[1]]) }, { k: 'notes', label: 'Notas', type: 'long', full: true }];
    const t = C.table({ el, base: B, entity: 'projects', title: 'proyecto', newText: 'Nuevo proyecto', fields, empty: 'Sin proyectos. Crea el primero o pídeselo a la IA.', emptyIcon: 'bi-kanban',
      columns: [{ label: 'Proyecto', main: true, html: (r) => `${esc(r.name)}${sub(r.client)}` }, { label: 'Estado', html: (r) => chip(...(PROY[r.status] || ['free', r.status])) },
        { label: 'Cotizado', cls: 'text-end', html: (r) => `${money(r.cotizado)}${sub(`${r.cotizaciones} cotiz.`)}` }, { label: 'Cobrado', cls: 'text-end', html: (r) => `${money(r.cobrado)}${sub(`pagado ${money(r.pagado)}`)}` }],
      rowActions: () => RO ? '' : '<button class="btn btn-sm btn-outline-primary" data-act="cot"><i class="bi bi-file-earmark-text me-1"></i>Cotizar</button>',
      onAction: (a, r) => { if (a === 'cot') cotizacion({ project_id: r.id, counterparty: r.client, tax_id: r.tax_id, client_city: r.client_city, client_email: r.client_email, title: r.name }, () => { location.hash = '#cotizaciones'; render(); }); } });
    t.load();
  }

  function cotizaciones(el) {
    el.innerHTML = '<div data-t></div>';
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'quotes', title: 'cotización', newText: 'Nueva cotización', fields: [], empty: 'Sin cotizaciones. Crea la primera o pídeselo a la IA: «hazle una cotización a…».', emptyIcon: 'bi-file-earmark-text',
      filters: [{ k: 'status', options: [['', 'Todas'], ['borrador', 'Borradores'], ['enviada', 'Enviadas'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']] }],
      onEdit: (row, changed) => cotizacion(row, changed),
      columns: [{ label: 'Cotización', main: true, html: (r) => `${esc(r.number)}${sub(r.title)}` }, { label: 'Cliente', html: (r) => `${esc(r.counterparty)}${sub(r.tax_id)}` }, { label: 'Fecha', html: (r) => day(r.issue_date) },
        { label: 'Vigencia', html: (r) => (r.vencida ? `<span class="text-danger">${day(r.valid_until)}</span>` : day(r.valid_until)) }, { label: 'Total', cls: 'text-end', html: (r) => money(r.total) },
        { label: 'Estado', html: (r) => chip(...(COT[r.status] || ['free', r.status])) }],
      rowActions: (r) => `<button class="btn btn-sm btn-outline-primary" data-act="pdf"><i class="bi bi-filetype-pdf me-1"></i>PDF</button>${RO || r.invoice_id || r.status === 'rechazada' ? '' : ' <button class="btn btn-sm btn-primary" data-act="cobrar"><i class="bi bi-receipt me-1"></i>Aprobar y cobrar</button>'}`,
      onAction: async (a, r) => {
        if (a === 'pdf') return pdf(`${B}/quotes/${r.id}/pdf`);
        if (a === 'cobrar' && await confirm(`¿Aprobar la cotización ${r.number} y crear su cuenta de cobro por ${money(r.total)}? Queda sin pagar en Finanzas.`)) {
          try { const x = await api(`${B}/quotes/${r.id}/cobrar`, { method: 'POST', body: {} }); toast(`Cuenta de cobro ${x.numero} creada`); t.load(); pdf(`${F}/invoices/${x.id}/pdf`); } catch (e) { toast(e.message, false); }
        } } });
    t.load();
  }

  // Editor de la cotización: datos del cliente, líneas, condiciones y total
  function cotizacion(row, changed) {
    if (RO && !(row && row.id)) return;
    const editando = !!(row && row.id), bloqueada = editando && !!row.invoice_id;
    const v = editando ? { ...row } : { issue_date: C.todayCo(), ...row };
    let lines = []; try { lines = JSON.parse(v.items || '[]'); } catch { /* vacío */ }
    if (!lines.length) lines = [{ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }];
    const n = (x) => Number(String(x ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
    const { el: d } = modal(`<form novalidate>
      <div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${editando ? `Cotización ${esc(row.number)}` : 'Nueva cotización'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1">Cliente</label><input class="form-control" name="counterparty" required value="${esc(v.counterparty || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">NIT o documento</label><input class="form-control" name="tax_id" value="${esc(v.tax_id || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">Ciudad</label><input class="form-control" name="client_city" value="${esc(v.client_city || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">Correo</label><input class="form-control" name="client_email" type="email" value="${esc(v.client_email || '')}"></div>
        <div class="col-12"><label class="form-label small mb-1">Título del trabajo</label><input class="form-control" name="title" value="${esc(v.title || '')}" placeholder="Landing de campaña"></div>
        <div class="col-12"><label class="form-label small mb-1">Resumen del alcance</label><textarea class="form-control" name="concept" rows="2">${esc(v.concept || '')}</textarea></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Fecha</label><input class="form-control" name="issue_date" type="date" required value="${esc(v.issue_date || '')}"></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Válida hasta</label><input class="form-control" name="valid_until" type="date" value="${esc(v.valid_until || '')}"></div></div>
        <div class="mt-3" data-lines></div>
        ${bloqueada ? '<p class="small text-body-secondary">Ya tiene cuenta de cobro: las líneas no se pueden cambiar.</p>' : '<button class="btn btn-sm btn-outline-primary mt-1" type="button" data-add><i class="bi bi-plus-lg me-1"></i>Agregar línea</button>'}
        <div class="text-end mt-2">Total <b class="fs-4" data-total>$0</b></div>
        <div class="row g-2 mt-1"><div class="col-12"><label class="form-label small mb-1">Condiciones <span class="text-body-secondary">· forma de pago, entrega, qué no incluye</span></label><textarea class="form-control" name="conditions" rows="3">${esc(v.conditions || '')}</textarea></div>
          ${editando ? `<div class="col-sm-6"><label class="form-label small mb-1">Estado</label><select class="form-select" name="status">${Object.entries(COT).map(([k, x]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>` : ''}</div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${editando && me.canManage ? '<button type="button" class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-outline-primary" value="save">Guardar</button> <button class="btn btn-primary" value="pdf"><i class="bi bi-filetype-pdf me-1"></i>Guardar y ver PDF</button></span></div></form>`, { size: 'modal-xl' });
    const f = $('form', d), box = $('[data-lines]', d);
    const draw = () => {
      box.innerHTML = lines.map((l, i) => `<div class="row g-2 align-items-start mb-2" data-i="${i}">
        <div class="col-12 col-md-5"><input class="form-control" data-k="concepto" value="${esc(l.concepto || '')}" placeholder="Concepto" ${bloqueada ? 'disabled' : ''}><input class="form-control form-control-sm mt-1" data-k="detalle" value="${esc(l.detalle || '')}" placeholder="Detalle (opcional)" ${bloqueada ? 'disabled' : ''}></div>
        <div class="col-3 col-md-1"><input class="form-control" data-k="cantidad" type="number" min="0" step="any" value="${esc(l.cantidad ?? 1)}" ${bloqueada ? 'disabled' : ''}></div>
        <div class="col-4 col-md-2"><select class="form-select" data-k="moneda" ${bloqueada ? 'disabled' : ''}><option value="COP" ${l.moneda !== 'USD' ? 'selected' : ''}>COP</option><option value="USD" ${l.moneda === 'USD' ? 'selected' : ''}>USD</option></select></div>
        <div class="col-5 col-md-2"><input class="form-control" data-k="valor" type="number" min="0" step="any" value="${esc(l.valor ?? '')}" placeholder="Valor unitario" ${bloqueada ? 'disabled' : ''}></div>
        <div class="col-10 col-md-1 text-md-end pt-2"><b data-lt>$0</b></div>
        <div class="col-2 col-md-1 text-end">${bloqueada ? '' : '<button class="btn btn-sm btn-light" type="button" data-rm aria-label="Quitar"><i class="bi bi-x-lg"></i></button>'}</div></div>`).join('');
      calc();
    };
    const read = () => $$('[data-i]', box).forEach((r) => { const l = lines[+r.dataset.i]; $$('[data-k]', r).forEach((x) => { l[x.dataset.k] = x.value; }); });
    function calc() {
      read(); let total = 0;
      $$('[data-i]', box).forEach((r) => { const l = lines[+r.dataset.i], usd = l.moneda === 'USD', t = usd ? Math.round(n(l.valor) * (n(l.cantidad) || 1) * 1000) / 1000 : Math.round(n(l.valor) * (n(l.cantidad) || 1)); total += usd ? 0 : t; $('[data-lt]', r).textContent = usd ? `USD ${t}` : money(t); });
      $('[data-total]', d).textContent = money(total) + (lines.some((l) => l.moneda === 'USD') ? ' + USD (TRM al guardar)' : '');
    }
    box.addEventListener('input', calc); box.addEventListener('change', calc);
    box.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { read(); lines.splice(+e.target.closest('[data-i]').dataset.i, 1); if (!lines.length) lines.push({ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }); draw(); } });
    $('[data-add]', d)?.addEventListener('click', () => { read(); lines.push({ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }); draw(); });
    $('[data-del]', d)?.addEventListener('click', async () => { if (!await confirm('¿Borrar esta cotización?')) return; try { await api(`${B}/quotes/${row.id}`, { method: 'DELETE' }); bootstrap.Modal.getInstance(d)?.hide(); toast('Borrada'); changed(); } catch (x) { toast(x.message, false); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); read();
      const go = e.submitter?.value, body = Object.fromEntries(new FormData(f));
      if (!bloqueada) body.items = lines.filter((l) => String(l.concepto).trim()).map((l) => ({ concepto: l.concepto, detalle: l.detalle || undefined, cantidad: n(l.cantidad) || 1, moneda: l.moneda, valor: n(l.valor) }));
      if (v.project_id) body.project_id = v.project_id;
      if (!body.valid_until) delete body.valid_until;
      try {
        const out = await api(editando ? `${B}/quotes/${row.id}` : `${B}/quotes`, { method: editando ? 'PATCH' : 'POST', body });
        bootstrap.Modal.getInstance(d)?.hide(); toast('Guardada'); changed(); if (go === 'pdf') pdf(`${B}/quotes/${editando ? row.id : out.id}/pdf`);
      } catch (x) { $('[data-err]', d).textContent = x.message; }
    });
    draw();
  }

  function cobros(el) {
    el.innerHTML = '<p class="small text-body-secondary">Las cuentas de cobro se crean al aprobar una cotización (o con la IA) y viven en Finanzas → Cobros, donde registras sus pagos y recibos.</p><div data-t></div>';
    const t = C.table({ el: $('[data-t]', el), base: F, entity: 'invoices', title: 'cuenta de cobro', fields: [], readOnly: true, onOpen: (r) => pdf(`${F}/invoices/${r.id}/pdf`), empty: 'Aún no hay cuentas de cobro.', emptyIcon: 'bi-receipt',
      filters: [{ k: 'kind', options: [['emitida', 'Por cobrar']] }],
      columns: [{ label: 'Cuenta', main: true, html: (r) => `${esc(r.number || '#' + r.id)}${sub(r.counterparty)}` }, { label: 'Emisión', html: (r) => day(r.issue_date) }, { label: 'Vence', html: (r) => day(r.due_date) },
        { label: 'Total', cls: 'text-end', html: (r) => money(r.total) }, { label: 'Saldo', cls: 'text-end', html: (r) => money(Math.max(0, r.total - r.paid)) }, { label: 'Estado', html: (r) => chip(...(COB[r.state] || ['free', r.state])) }],
      rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="pdf"><i class="bi bi-filetype-pdf me-1"></i>PDF</button>',
      onAction: (a, r) => { if (a === 'pdf') pdf(`${F}/invoices/${r.id}/pdf`); } });
    t.load();
  }

  function render() {
    root.innerHTML = '';
    ({ proyectos, cotizaciones, cobros })[view](root);
  }
  const seg = $('[data-seg]');
  seg.className = 'dw-segb'; seg.hidden = false;
  if (!document.getElementById('dw-segb-css')) document.head.insertAdjacentHTML('beforeend', '<style id="dw-segb-css">.dw-segb{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}.dw-segb .btn{flex:none;white-space:nowrap}</style>');
  seg.innerHTML = VIEWS.map(([k, l]) => `<button type="button" class="btn btn-sm btn-outline-secondary ${k === view ? 'active' : ''}" data-k="${k}">${esc(l)}</button>`).join('');
  seg.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; view = b.dataset.k; location.hash = view; $$('.btn', seg).forEach((x) => x.classList.toggle('active', x === b)); render(); };
  cabecera().then(render);
});

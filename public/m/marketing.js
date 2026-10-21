// Página del módulo Marketing (Marketing Hub de Diwilo): resumen, clientes y leads, oportunidades, campañas con links
// de rastreo, tareas y automatizaciones, listas, informes, tarjetas de presentación y suscripciones/herramientas.
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
  const { money, num, pct, day, chip } = C;
  const B = '/api/marketing';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const RO = me.business.readOnly;
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');
  const STAGE_C = { lead: 'Lead', cliente: 'Cliente', perdido: 'Perdido' };
  const STAGE_D = { nuevo: 'Nuevo', calificado: 'Calificado', propuesta: 'Propuesta', negociacion: 'Negociación', ganado: 'Ganado', perdido: 'Perdido' };
  const CHANNEL = { meta_ads: 'Meta Ads', google_ads: 'Google Ads', whatsapp: 'WhatsApp', correo: 'Correo', organico: 'Orgánico', otro: 'Otro' };
  const TOOL_CAT = { marketing: 'Marketing', crm: 'CRM', infraestructura: 'Infraestructura', software: 'Software', api: 'API', ia: 'IA', otro: 'Otro' };
  const TRIGGER = { lead_nuevo: 'Llega un lead nuevo', sin_contacto: 'Lead sin contacto por N días', presupuesto_campana: 'Campaña usó el X% del presupuesto', factura_vencida: 'Una factura se venció (Finanzas)', semanal: 'Cada lunes' };
  const ACTION = { crear_tarea: 'Crear tareas', crear_oportunidad: 'Crear una oportunidad', informe_ia: 'Informe del analista de IA' };
  const LKIND = { otra: 'Lista', competidores: 'Competidores', fuentes: 'Fuentes', temas: 'Temas', tendencias: 'Tendencias', prospectos: 'Prospectos' };
  const opts = (o, first) => [...(first ? [['', first]] : []), ...Object.entries(o)];
  // Plantillas de tareas: varias tareas en secuencia (título, días después de empezar). Variables: {nombre} {campana} {porcentaje}
  const PLAYBOOKS = {
    lead: ['Nuevo lead', [['Escribir o llamar a {nombre} (WhatsApp)', 0], ['Enviar información o propuesta a {nombre}', 1], ['Seguimiento a {nombre}', 3], ['Último intento con {nombre}', 7]]],
    propuesta: ['Propuesta comercial', [['Preparar la propuesta para {nombre}', 0], ['Enviar la propuesta a {nombre}', 1], ['Llamar a {nombre} para resolver dudas', 3], ['Cerrar o descartar con {nombre}', 7]]],
    onboarding: ['Cliente nuevo (bienvenida)', [['Bienvenida a {nombre}', 0], ['Primera cita o reunión con {nombre}', 2], ['Preguntar a {nombre} cómo le fue', 7], ['Pedir reseña o referido a {nombre}', 15]]],
    seguimiento: ['Seguimiento sin respuesta', [['Hacer seguimiento a {nombre}', 0]]],
    campana: ['Campaña nueva', [['Definir público, mensaje y presupuesto de {campana}', 0], ['Crear las piezas y los links de rastreo de {campana}', 1], ['Lanzar {campana}', 2], ['Revisar resultados de {campana}', 7], ['Informe final de {campana}', 30]]],
    presupuesto: ['Alerta de presupuesto', [['Revisar la campaña {campana}: va en {porcentaje}% del presupuesto', 0]]],
  };
  const stepsOf = (a) => { try { const v = JSON.parse(a.task_title); if (Array.isArray(v)) return v; } catch {} return a.task_title ? [{ t: a.task_title, d: 0 }] : []; };
  const F = {
    contacts: [
      { k: 'name', label: 'Nombre', required: true }, { k: 'company', label: 'Empresa' }, { k: 'email', label: 'Correo', type: 'email' }, { k: 'phone', label: 'Teléfono' },
      { k: 'stage', label: 'Etapa', type: 'select', options: Object.entries(STAGE_C) }, { k: 'source', label: 'Origen', placeholder: 'Instagram, referido, volante…' },
      { k: 'campaign_id', label: 'Campaña', ref: 'campaigns' }, { k: 'owner', label: 'Responsable' }, { k: 'last_contact_at', label: 'Último contacto', type: 'date' },
      { k: 'tags', label: 'Etiquetas', placeholder: 'vip, barrio' }, { k: 'notes', label: 'Notas', type: 'long' }],
    deals: [
      { k: 'title', label: 'Oportunidad', required: true, full: true }, { k: 'contact_id', label: 'Cliente o lead', ref: 'contacts' }, { k: 'value', label: 'Valor (COP)', type: 'money' },
      { k: 'stage', label: 'Etapa', type: 'select', options: Object.entries(STAGE_D) }, { k: 'campaign_id', label: 'Campaña', ref: 'campaigns' },
      { k: 'expected_close', label: 'Cierre esperado', type: 'date' }, { k: 'notes', label: 'Notas', type: 'long' }],
    campaigns: [
      { k: 'name', label: 'Campaña', required: true, full: true }, { k: 'channel', label: 'Canal', type: 'select', options: Object.entries(CHANNEL) },
      { k: 'status', label: 'Estado', type: 'select', options: [['activa', 'Activa'], ['pausada', 'Pausada'], ['terminada', 'Terminada']] },
      { k: 'budget', label: 'Presupuesto (COP)', type: 'money' }, { k: 'goal_leads', label: 'Meta de leads', type: 'int' },
      { k: 'start_date', label: 'Inicio', type: 'date' }, { k: 'end_date', label: 'Fin', type: 'date' },
      { k: 'utm_campaign', label: 'utm_campaign', hint: 'se genera solo si lo dejas vacío' }, { k: 'notes', label: 'Notas', type: 'long' }],
    spend: [
      { k: 'campaign_id', label: 'Campaña', ref: 'campaigns', required: true }, { k: 'date', label: 'Fecha', type: 'date', required: true },
      { k: 'amount', label: 'Gasto real (COP)', type: 'money', required: true }, { k: 'leads', label: 'Leads', type: 'int' },
      { k: 'clicks', label: 'Clics', type: 'int' }, { k: 'impressions', label: 'Impresiones', type: 'int' }, { k: 'note', label: 'Nota', full: true }],
    tasks: [
      { k: 'title', label: 'Tarea', required: true, full: true }, { k: 'due_date', label: 'Para', type: 'date' }, { k: 'assignee', label: 'Responsable' },
      { k: 'contact_id', label: 'Cliente o lead', ref: 'contacts' }, { k: 'deal_id', label: 'Oportunidad', ref: 'deals' }, { k: 'done', label: 'Estado', type: 'bool', check: 'Hecha' },
      { k: 'notes', label: 'Notas', type: 'long' }],
    tools: [
      { k: 'name', label: 'Herramienta', required: true, placeholder: 'Meta Business, Canva, Mailchimp…' }, { k: 'category', label: 'Tipo', type: 'select', options: Object.entries(TOOL_CAT) },
      { k: 'vendor', label: 'Proveedor' }, { k: 'plan', label: 'Plan' }, { k: 'cost', label: 'Costo (COP)', type: 'money' },
      { k: 'cycle', label: 'Ciclo', type: 'select', options: [['mensual', 'Mensual'], ['anual', 'Anual'], ['por uso', 'Por uso']] },
      { k: 'renews_on', label: 'Renueva', type: 'date' }, { k: 'status', label: 'Estado', type: 'select', options: [['activa', 'Activa'], ['prueba', 'En prueba'], ['cancelada', 'Cancelada']] },
      { k: 'account_email', label: 'Cuenta (correo)', type: 'email' }, { k: 'url', label: 'Enlace', type: 'url' }, { k: 'notes', label: 'Notas', type: 'long' }],
    lists: [{ k: 'name', label: 'Nombre', required: true }, { k: 'kind', label: 'Tipo', type: 'select', options: Object.entries(LKIND) }, { k: 'description', label: 'Descripción', type: 'long' }],
    list_items: [{ k: 'title', label: 'Elemento', required: true, full: true }, { k: 'url', label: 'Sitio web', type: 'url' }, { k: 'feed_url', label: 'Feed RSS', type: 'url', hint: 'opcional: se busca solo al revisar' },
      { k: 'status', label: 'Estado', type: 'select', options: [['activo', 'Activo'], ['revisado', 'Revisado'], ['descartado', 'Descartado']] }, { k: 'score', label: 'Puntaje', type: 'int' }, { k: 'notes', label: 'Notas', type: 'long' }],
  };

  const VIEWS = [['resumen', 'Resumen', 'bi-graph-up'], ['contactos', 'Clientes y leads', 'bi-person-lines-fill'], ['oportunidades', 'Oportunidades', 'bi-funnel'],
    ['campanas', 'Campañas', 'bi-megaphone'], ['tarjetas', 'Tarjetas y marca', 'bi-person-vcard'], ['listas', 'Listas', 'bi-list-ul'], ['herramientas', 'Suscripciones y herramientas', 'bi-plug']];
  let view = (location.hash || '#resumen').slice(1), subTar = 'tarjetas';
  if (view === 'marca' || view === 'kit') { subTar = view; view = 'tarjetas'; }   // enlaces a Marketing → Tarjetas → Marca
  if (!VIEWS.some(([k]) => k === view)) view = 'resumen';
  function render() {
    history.replaceState(null, '', `#${view}`);
    const old = $('[data-view]'), el = old.cloneNode(false);
    old.replaceWith(el);
    ({ resumen: summary, contactos: contacts, oportunidades: pipeline, campanas: campaigns, tarjetas: tarjetasYMarca, listas: lists, herramientas: tools })[view](el);
  }

  async function summary(el) {
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><label class="small text-body-secondary">Desde <input class="form-control d-inline-block w-auto" type="date" data-from></label><label class="small text-body-secondary">Hasta <input class="form-control d-inline-block w-auto" type="date" data-to></label></div>
      <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div>
      <div class="row g-3 mb-3"><div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">Embudo de oportunidades</h2><div data-funnel></div></div></div>
        <div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">Gasto vs leads por canal</h2><div data-ch></div></div></div></div>
      <div class="dw-card mb-3"><h2 class="h6">Campañas: presupuesto, gasto, costo por lead y retorno</h2><div data-camps></div></div>
      <div class="row g-3"><div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">De dónde llegan (periodo)</h2><div data-src></div></div></div><div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">Clientes y leads</h2><div data-stage></div></div></div></div>`;
    const from = $('[data-from]', el), to = $('[data-to]', el);
    async function load() {
      const qs = new URLSearchParams(); if (from.value) qs.set('from', from.value); if (to.value) qs.set('to', to.value);
      let s; try { s = await api(`${B}/summary?${qs}`); } catch (x) { $('[data-kpis]', el).innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
      from.value = s.from; to.value = s.to;
      const open = s.deals.pipeline.reduce((a, p) => a + p.value, 0);
      C.kpis($('[data-kpis]', el), [
        ['Leads nuevos', num(s.contacts.new), '', 'bi-person-plus'], ['Leads abiertos', num(s.contacts.by_stage.lead || 0), '', 'bi-hourglass'], ['Clientes', num(s.contacts.by_stage.cliente || 0), '', 'bi-person-check'],
        ['Oportunidades abiertas', money(open), `${num(s.deals.pipeline.reduce((a, p) => a + p.n, 0))} en curso`, 'bi-funnel'],
        ['Ganado en el periodo', money(s.deals.won_value), `${num(s.deals.won)} cerradas · ${pct(s.deals.win_rate)} de éxito`, 'bi-trophy'],
        ['Gasto del periodo', money(s.totals.spend_period), `Presupuesto total ${money(s.totals.budget)}`, 'bi-cash'],
        ['Costo por lead', money(s.totals.cpl), '', 'bi-tag'], ['Retorno (ROI)', pct(s.totals.roi), `Ingresos atribuidos ${money(s.totals.revenue)}`, 'bi-graph-up-arrow'],
        ['Herramientas', money(s.tools.monthly), `${num(s.tools.active)} activas · al mes`, 'bi-plug']]);
      const maxF = Math.max(1, ...s.deals.pipeline.map((p) => p.n));
      $('[data-funnel]', el).innerHTML = s.deals.pipeline.map((p) => `<div class="d-flex align-items-center gap-2 small mb-2"><span style="width:96px">${STAGE_D[p.stage]}</span><div class="progress flex-grow-1" style="height:8px"><div class="progress-bar" style="width:${(p.n / maxF * 100).toFixed(1)}%"></div></div><b style="width:28px" class="text-end">${num(p.n)}</b><span class="text-body-secondary text-end" style="width:96px">${money(p.value)}</span></div>`).join('')
        + `<p class="small text-body-secondary mb-0">Ganadas ${num(s.deals.won)} · perdidas ${num(s.deals.lost)} en el periodo</p>`;
      C.bars($('[data-ch]', el), s.channels.map((x) => ({ label: CHANNEL[x.channel] || x.channel, a: x.spend, b: x.leads })), { la: 'Gasto', lb: 'Leads', fmt: (n) => num(n), separate: true });
      $('[data-camps]', el).innerHTML = s.campaigns.length ? window.App.table([
        { label: 'Campaña', main: true, html: (k) => esc(k.name) }, { label: 'Canal', html: (k) => esc(CHANNEL[k.channel] || k.channel) },
        { label: 'Presupuesto', cls: 'text-end', html: (k) => money(k.budget) }, { label: 'Uso', html: (k) => `<div style="min-width:110px">${C.meter(k.spend, k.budget)}</div>` },
        { label: 'Gasto', cls: 'text-end', html: (k) => money(k.spend) }, { label: 'Clics', cls: 'text-end', html: (k) => num(k.clicks) },
        { label: 'Leads', cls: 'text-end', html: (k) => `${num(k.leads)}${k.goal_leads ? `<span class="text-body-secondary"> / ${num(k.goal_leads)}</span>` : ''}` },
        { label: 'Costo/lead', cls: 'text-end', html: (k) => money(k.cpl) }, { label: 'ROI', cls: 'text-end', html: (k) => `<span class="${k.roi == null ? '' : k.roi >= 0 ? 'text-success' : 'text-danger'}">${pct(k.roi)}</span>` }], s.campaigns)
        : '<p class="small text-body-secondary mb-0">Sin campañas. Créalas en «Campañas» y registra su gasto real para ver costo por lead y retorno.</p>';
      C.rank($('[data-src]', el), s.contacts.by_source);
      C.rank($('[data-stage]', el), Object.entries(s.contacts.by_stage).map(([k, n]) => ({ k: STAGE_C[k] || k, n })));
    }
    from.onchange = to.onchange = load;
    load();
  }

  function contacts(el) {
    const t = C.table({ el, base: B, entity: 'contacts', title: 'contacto', newText: 'Nuevo contacto', refs: ['campaigns'], fields: F.contacts,
      filters: [{ k: 'stage', options: opts(STAGE_C, 'Todas las etapas') }], defaults: () => ({ stage: 'lead' }),
      extraButtons: '<button class="btn btn-outline-primary" data-csv><i class="bi bi-download me-1"></i>Exportar CSV</button>',
      empty: 'Aún no hay clientes ni leads.', emptyIcon: 'bi-person-lines-fill',
      columns: [
        { label: 'Nombre', main: true, html: (r) => `${esc(r.name)}${sub(r.company)}` },
        { label: 'Contacto', html: (r) => [r.email && `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`, r.phone && `<a href="https://wa.me/${esc(r.phone.replace(/\D/g, '').replace(/^3/, '573'))}" target="_blank" rel="noopener">${esc(r.phone)}</a>`].filter(Boolean).join('<br>') || '—' },
        { label: 'Etapa', html: (r) => chip(r.stage === 'cliente' ? 'ok' : r.stage === 'perdido' ? 'free' : 'soon', STAGE_C[r.stage] || r.stage) },
        { label: 'Origen', html: (r, R) => `${esc(r.source || '—')}${r.campaign_id ? sub(R.campaigns?.find((x) => x.id === r.campaign_id)?.name) : ''}` },
        { label: 'Último contacto', html: (r) => (r.last_contact_at ? day(r.last_contact_at) : '—') }],
      rowActions: () => (RO ? '' : '<button class="btn btn-sm btn-outline-secondary" data-act="contacted" title="Marcar contacto de hoy" aria-label="Marcar contacto de hoy"><i class="bi bi-telephone"></i></button> <button class="btn btn-sm btn-outline-secondary" data-act="plan" title="Crear sus tareas con una plantilla" aria-label="Plantilla de tareas"><i class="bi bi-list-check"></i></button> <button class="btn btn-sm btn-outline-secondary" data-act="deal" title="Crear oportunidad" aria-label="Crear oportunidad"><i class="bi bi-funnel"></i></button>'),
      onAction: async (a, r) => {
        try {
          if (a === 'contacted') { await api(`${B}/contacts/${r.id}`, { method: 'PATCH', body: { last_contact_at: C.todayCo() } }); toast('Contacto registrado'); t.load(); }
          if (a === 'plan') usePlaybook({ contact: r });
          if (a === 'deal') {
            const out = await C.form({ title: 'Nueva oportunidad', fields: F.deals, base: B, values: { title: `Oportunidad: ${r.name}`, contact_id: r.id, campaign_id: r.campaign_id, stage: 'nuevo' } });
            if (out) { await api(`${B}/deals`, { method: 'POST', body: out }); C.dropRefs(B, 'deals'); toast('Oportunidad creada'); }
          }
        } catch (x) { toast(x.message, false); }
      } });
    t.load();
    el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-csv]')) return;
      const cols = [['Nombre', 'name'], ['Empresa', 'company'], ['Correo', 'email'], ['Teléfono', 'phone'], ['Etapa', 'stage'], ['Origen', 'source'], ['Responsable', 'owner'], ['Último contacto', 'last_contact_at'], ['Notas', 'notes']];
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [cols.map((x) => x[0]).join(';'), ...t.rows().map((r) => cols.map(([, k]) => q(r[k])).join(';'))].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'clientes-y-leads.csv'; a.click();
    });
  }

  async function usePlaybook({ contact, onDone } = {}) {
    const [cs, ks] = await Promise.all([C.refs(B, 'contacts'), C.refs(B, 'campaigns')]);
    const { el: d, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Usar una plantilla de tareas</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1">Plantilla</label><select class="form-select" name="pb">${Object.entries(PLAYBOOKS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Cliente o lead</label><select class="form-select" name="contact"><option value="">—</option>${cs.map((x) => `<option value="${x.id}" ${contact?.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Campaña</label><select class="form-select" name="camp"><option value="">—</option>${ks.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Empieza</label><input class="form-control" type="date" name="start" value="${C.todayCo()}"></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Responsable</label><input class="form-control" name="assignee"></div>
        <div class="col-12" data-prev></div></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Crear tareas</button></div></form>`, { size: 'modal-lg' });
    const f = $('form', d);
    const vars = () => ({ nombre: cs.find((x) => String(x.id) === f.contact.value)?.name || '{nombre}', campana: ks.find((x) => String(x.id) === f.camp.value)?.name || '{campana}' });
    const fillT = (tpl) => tpl.replace(/\{(\w+)\}/g, (mm, k) => vars()[k] ?? mm);
    const add = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const prev = () => { $('[data-prev]', d).innerHTML = `<ol class="list-group list-group-numbered">${PLAYBOOKS[f.pb.value][1].map(([t, n]) => `<li class="list-group-item d-flex justify-content-between gap-2 small"><span class="me-auto ms-1">${esc(fillT(t))}</span><span class="text-body-secondary text-nowrap">${day(add(f.start.value || C.todayCo(), n))}</span></li>`).join('')}</ol>`; };
    if (contact) f.pb.value = contact.stage === 'cliente' ? 'onboarding' : 'lead';
    prev(); f.addEventListener('input', prev); f.addEventListener('change', prev);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const list = PLAYBOOKS[f.pb.value][1];
      try {
        for (const [t, n] of list) await api(`${B}/tasks`, { method: 'POST', body: { title: fillT(t), due_date: add(f.start.value || C.todayCo(), n), contact_id: f.contact.value || null, assignee: f.assignee.value, source: 'plantilla' } });
        m.hide(); toast(`${list.length} tareas creadas`); onDone?.();
      } catch (x) { toast(x.message, false); }
    };
  }

  async function pipeline(el) {
    el.innerHTML = `<div class="d-flex gap-2 align-items-center mb-2"><span class="small text-body-secondary flex-grow-1">Arrastra cada oportunidad a su etapa. Toca una para editarla.</span>${RO ? '' : '<button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nueva oportunidad</button>'}</div><div class="dw-kanban" data-k></div>`;
    let rows = [];
    async function load() {
      const [d, cs] = await Promise.all([api(`${B}/deals?limit=1000`), C.refs(B, 'contacts')]);
      rows = d.rows;
      const cname = (id) => cs.find((x) => x.id === id)?.name;
      $('[data-k]', el).innerHTML = Object.entries(STAGE_D).map(([k, l]) => {
        const list = rows.filter((r) => r.stage === k);
        return `<div class="dw-kcol" data-stage="${k}"><h3><span>${l}</span><span class="text-body-secondary fw-normal">${num(list.length)} · ${money(list.reduce((a, r) => a + r.value, 0))}</span></h3>
          ${list.map((r) => `<div class="dw-kcard" draggable="${!RO}" data-id="${r.id}"><b>${esc(r.title)}</b><span>${money(r.value)}</span>${cname(r.contact_id) ? `<span class="text-body-secondary">${esc(cname(r.contact_id))}</span>` : ''}${r.expected_close ? `<span class="text-body-secondary"><i class="bi bi-calendar"></i> ${day(r.expected_close)}</span>` : ''}</div>`).join('')}</div>`;
      }).join('');
    }
    const edit = async (row) => {
      if (RO) return;
      const out = await C.form({ title: row ? 'Editar oportunidad' : 'Nueva oportunidad', fields: F.deals, values: row || { stage: 'nuevo' }, base: B, onDelete: row && me.canManage ? () => api(`${B}/deals/${row.id}`, { method: 'DELETE' }) : null });
      if (out === 'deleted') { toast('Borrada'); C.dropRefs(B, 'deals'); return load(); }
      if (!out) return;
      try { await api(row ? `${B}/deals/${row.id}` : `${B}/deals`, { method: row ? 'PATCH' : 'POST', body: out }); C.dropRefs(B, 'deals'); toast('Guardado'); load(); } catch (x) { toast(x.message, false); }
    };
    $('[data-new]', el)?.addEventListener('click', () => edit(null));
    el.addEventListener('click', (e) => { const c = e.target.closest('.dw-kcard'); if (c) edit(rows.find((r) => String(r.id) === c.dataset.id)); });
    el.addEventListener('dragstart', (e) => { const c = e.target.closest('.dw-kcard'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
    el.addEventListener('dragover', (e) => { if (e.target.closest('.dw-kcol')) e.preventDefault(); });
    el.addEventListener('drop', async (e) => {
      const col = e.target.closest('.dw-kcol'); if (!col) return;
      e.preventDefault();
      try { await api(`${B}/deals/${e.dataTransfer.getData('text/plain')}`, { method: 'PATCH', body: { stage: col.dataset.stage } }); toast(`Movida a ${STAGE_D[col.dataset.stage]}`); load(); } catch (x) { toast(x.message, false); }
    });
    load();
  }

  // Links de rastreo por plataforma
  const PLAT = [['instagram', 'Instagram', 'bi-instagram'], ['facebook', 'Facebook', 'bi-facebook'], ['tiktok', 'TikTok', 'bi-tiktok'], ['whatsapp', 'WhatsApp', 'bi-whatsapp'],
    ['google', 'Google Ads', 'bi-google'], ['youtube', 'YouTube', 'bi-youtube'], ['linkedin', 'LinkedIn', 'bi-linkedin'], ['correo', 'Correo', 'bi-envelope'], ['qr', 'QR impreso', 'bi-qr-code'], ['otro', 'Otro', 'bi-link-45deg']];
  function qrDownload(url, name) {
    if (!window.qrcode) { toast('No se pudo cargar el generador de QR', false); return; }
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    const cv = document.createElement('canvas'), n = q.getModuleCount(), cell = 16, pad = 32; cv.width = cv.height = n * cell + pad * 2;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(pad + c * cell, pad + r * cell, cell, cell);
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `qr-${name}.png`; a.click();
  }
  function loadQrLib() { if (window.qrcode || document.querySelector('script[data-qr]')) return; const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.dataset.qr = '1'; document.head.appendChild(s); }

  async function campaigns(el) {
    loadQrLib();
    el.innerHTML = '<div data-c></div><div data-lp class="mt-3"></div><h2 class="h5 mt-4 mb-2">Gasto real registrado</h2><div data-s></div>';
    let stats = {};
    const loadStats = async () => { try { const s = await api(`${B}/summary`); stats = Object.fromEntries(s.campaigns.map((k) => [k.id, k])); } catch { stats = {}; } };
    const spend = C.table({ el: $('[data-s]', el), base: B, entity: 'spend', title: 'gasto', newText: 'Registrar gasto', refs: ['campaigns'], fields: F.spend,
      defaults: () => ({ date: C.todayCo() }), empty: 'Registra el gasto real de cada campaña (por día o por semana).', emptyIcon: 'bi-cash',
      columns: [{ label: 'Fecha', html: (r) => day(r.date) }, { label: 'Campaña', main: true, html: (r, R) => C.refName(R, 'campaigns', r.campaign_id) },
        { label: 'Gasto', cls: 'text-end', html: (r) => money(r.amount) }, { label: 'Leads', cls: 'text-end', html: (r) => num(r.leads) },
        { label: 'Clics', cls: 'text-end', html: (r) => num(r.clicks) }, { label: 'Nota', html: (r) => esc(r.note || '') }] });
    const camps = C.table({ el: $('[data-c]', el), base: B, entity: 'campaigns', title: 'campaña', newText: 'Nueva campaña', fields: F.campaigns,
      filters: [{ k: 'channel', options: opts(CHANNEL, 'Todos los canales') }], defaults: () => ({ start_date: C.todayCo() }),
      empty: 'Sin campañas todavía. Crea una y genera sus links por plataforma (Instagram, Facebook, TikTok…).', emptyIcon: 'bi-megaphone',
      onChanged: async () => { await loadStats(); camps.load(); spend.load(); },
      columns: [
        { label: 'Campaña', main: true, html: (r) => `${esc(r.name)}${sub(r.utm_campaign ? `utm: ${r.utm_campaign}` : '')}` },
        { label: 'Canal', html: (r) => esc(CHANNEL[r.channel] || r.channel) },
        { label: 'Estado', html: (r) => chip(r.status === 'activa' ? 'ok' : r.status === 'pausada' ? 'soon' : 'free', r.status) },
        { label: 'Presupuesto', cls: 'text-end', html: (r) => money(r.budget) },
        { label: 'Links · clics', cls: 'text-end', html: (r) => (stats[r.id] ? `${num(stats[r.id].links)} · <b>${num(stats[r.id].clicks)}</b>` : '—') },
        { label: 'Leads', cls: 'text-end', html: (r) => num(stats[r.id]?.leads || 0) },
        { label: 'Fechas', html: (r) => `${day(r.start_date)}${r.end_date ? ` → ${day(r.end_date)}` : ''}` }],
      rowActions: () => `<button class="btn btn-sm btn-primary" data-act="links"><i class="bi bi-link-45deg me-1"></i>Links</button>${RO ? '' : ' <button class="btn btn-sm btn-outline-secondary" data-act="spend"><i class="bi bi-cash me-1"></i>Gasto</button>'}`,
      onAction: async (a, r) => {
        if (a === 'links') return showLinks(r.id);
        if (a !== 'spend') return;
        const out = await C.form({ title: `Gasto de ${r.name}`, fields: F.spend, base: B, values: { campaign_id: r.id, date: C.todayCo() } });
        if (out) { try { await api(`${B}/spend`, { method: 'POST', body: out }); toast('Gasto registrado'); spend.load(); await loadStats(); camps.load(); } catch (x) { toast(x.message, false); } }
      } });
    async function showLinks(id) {
      const box = $('[data-lp]', el);
      let d; try { d = await api(`${B}/campaigns/${id}/links`); } catch (x) { toast(x.message, false); return; }
      const base = location.origin;
      box.innerHTML = `<div class="dw-card"><div class="d-flex justify-content-between align-items-center mb-1"><h2 class="h6 mb-0"><i class="bi bi-link-45deg"></i> Links de rastreo · ${esc(d.campaign.name)}</h2><button class="btn btn-sm btn-light" data-close>Cerrar</button></div>
        <p class="small text-body-secondary">Cada link cuenta las vistas y sigue el embudo: vistas → interesados (dejaron sus datos en la matrícula) → matriculados. UTM: <code>${esc(d.campaign.utm_campaign || '')}</code>.</p>
        ${RO ? '' : `<div class="d-flex flex-wrap gap-1">${PLAT.map(([k, l, ic]) => `<button class="btn btn-sm btn-outline-primary" data-plat="${k}"><i class="bi ${ic} me-1"></i>${esc(l)}</button>`).join('')}</div>`}
        ${d.links.length ? `<div class="dw-grid mt-3">${d.links.map((l) => {
          const p = PLAT.find((x) => x[0] === l.platform) || PLAT[9], url = `${base}/l/${l.slug}`, pc = (n, t) => (t ? `${Math.round((n / t) * 100)}%` : '—');
          return `<div class="dw-card"><div class="d-flex align-items-center gap-2 mb-2"><i class="bi ${p[2]} fs-5"></i><b class="flex-grow-1 text-truncate">${esc(p[1])}</b>
              <button class="btn btn-sm btn-outline-secondary" data-qr="${esc(url)}" data-slug="${esc(l.slug)}" title="Descargar QR" aria-label="Descargar QR"><i class="bi bi-qr-code"></i></button>${me.canManage && !RO ? `<button class="btn btn-sm btn-outline-danger" data-dellink="${l.id}" title="Borrar link" aria-label="Borrar link"><i class="bi bi-trash"></i></button>` : ''}</div>
            <button class="btn btn-sm btn-light w-100 text-start text-truncate mb-1" data-copy="${esc(url)}" title="Copiar link"><i class="bi bi-clipboard me-1"></i>/l/${esc(l.slug)}</button>
            <div class="small text-body-secondary text-truncate mb-2" title="${esc(l.target)}">Lleva a: ${esc(l.target)}</div>
            <div class="d-flex align-items-stretch gap-1 text-center">
              <div class="flex-fill border rounded p-2"><div class="fs-5 fw-bold">${num(l.clicks)}</div><div class="small text-body-secondary">Vistas</div></div><i class="bi bi-chevron-right align-self-center text-body-secondary"></i>
              <div class="flex-fill border rounded p-2"><div class="fs-5 fw-bold">${num(l.leads)}</div><div class="small text-body-secondary">Interesados</div><div class="small text-body-secondary">${pc(l.leads, l.clicks)}</div></div><i class="bi bi-chevron-right align-self-center text-body-secondary"></i>
              <div class="flex-fill border rounded p-2 ${l.matriculados ? 'border-success' : ''}"><div class="fs-5 fw-bold ${l.matriculados ? 'text-success' : ''}">${num(l.matriculados)}</div><div class="small text-body-secondary">Matriculados</div><div class="small text-body-secondary">${pc(l.matriculados, l.leads)}</div></div></div></div>`; }).join('')}</div>`
          : '<p class="small text-body-secondary mt-2 mb-0">Aún no hay links: elige una plataforma arriba.</p>'}</div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      box.onclick = async (e) => {
        if (e.target.closest('[data-close]')) { box.innerHTML = ''; return; }
        const pl = e.target.closest('[data-plat]');
        if (pl) {
          const label = PLAT.find((p) => p[0] === pl.dataset.plat)[1];
          const out = await C.form({ title: `Link para ${label}`, base: B, okText: 'Crear link', values: { target: d.links[d.links.length - 1]?.target || '/matricula' },
            fields: [{ k: 'target', label: '¿A qué página lleva? (https://… o /matricula). Los UTM se agregan solos.', required: true, full: true }] });
          if (!out) return;
          try {
            const r = await api(`${B}/campaigns/${id}/links`, { method: 'POST', body: { platform: pl.dataset.plat, target: out.target } });
            try { await navigator.clipboard.writeText(`${base}/l/${r.slug}`); toast(`Link creado y copiado: /l/${r.slug}`); } catch { toast(`Link creado: /l/${r.slug}`); }
            await loadStats(); camps.load(); showLinks(id);
          } catch (x) { toast(x.message, false); }
          return;
        }
        const cp = e.target.closest('[data-copy]');
        if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Link copiado'); } catch { toast(cp.dataset.copy); } return; }
        const qr = e.target.closest('[data-qr]');
        if (qr) return qrDownload(qr.dataset.qr, qr.dataset.slug);
        const del = e.target.closest('[data-dellink]');
        if (del && await confirm({ title: '¿Borrar este link y sus clics?', text: 'El QR o el enlace dejarán de funcionar.' })) {
          try { await api(`${B}/links/${del.dataset.dellink}`, { method: 'DELETE' }); toast('Link borrado'); await loadStats(); camps.load(); showLinks(id); } catch (x) { toast(x.message, false); }
        }
      };
    }
    await loadStats();
    camps.load();
    spend.load();
  }

  function tasks(el) {
    el.innerHTML = `<div data-tasks></div><h2 class="h5 mt-4 mb-2">Automatizaciones</h2>
      <div class="alert alert-light border small" data-anote>Cada automatización crea <b>una o varias tareas</b> (a N días) o una oportunidad. «Llega un lead nuevo» corre al instante; las demás se revisan cada día a las 3:00 a. m. y no repiten tareas abiertas.
        ${me.canManage && !RO ? `<div class="d-flex flex-wrap gap-1 mt-2">${[['lead', 'Plan para cada lead nuevo'], ['followup', 'Seguimiento a 3 días sin contacto'], ['budget', 'Aviso al 80% del presupuesto']].map(([k, l]) => `<button class="btn btn-sm btn-outline-primary" data-preset="${k}">+ ${l}</button>`).join('')}</div>` : ''}</div><div data-autos></div>`;
    const tt = C.table({ el: $('[data-tasks]', el), base: B, entity: 'tasks', title: 'tarea', newText: 'Nueva tarea', refs: ['contacts', 'deals'], fields: F.tasks, canDelete: true,
      filters: [{ k: 'done', options: [['0', 'Pendientes'], ['1', 'Hechas'], ['', 'Todas']] }], fixed: {}, defaults: () => ({ due_date: C.todayCo() }),
      extraButtons: RO ? '' : '<button class="btn btn-outline-primary" data-playbook><i class="bi bi-list-check me-1"></i>Usar plantilla</button>',
      empty: 'Sin tareas pendientes. Crea una, usa una plantilla o deja que las automatizaciones las creen.', emptyIcon: 'bi-check2-square',
      columns: [
        { label: '', html: (r) => `<input class="form-check-input" type="checkbox" data-act="toggle" ${r.done ? 'checked' : ''} ${RO ? 'disabled' : ''} aria-label="Hecha">` },
        { label: 'Tarea', main: true, html: (r) => `<span class="${r.done ? 'text-decoration-line-through text-body-secondary' : ''}">${esc(r.title)}</span>${r.source?.startsWith('auto') ? ' <span class="badge text-bg-light">auto</span>' : r.source === 'plantilla' ? ' <span class="badge text-bg-light">plantilla</span>' : ''}` },
        { label: 'Para', html: (r) => (r.due_date ? (r.due_date < C.todayCo() && !r.done ? chip('bad', day(r.due_date)) : day(r.due_date)) : '—') },
        { label: 'Relacionado', html: (r, R) => [r.contact_id && C.refName(R, 'contacts', r.contact_id), r.deal_id && C.refName(R, 'deals', r.deal_id)].filter(Boolean).join('<br>') || '—' },
        { label: 'Responsable', html: (r) => esc(r.assignee || '—') }],
      onAction: async (a, r, box) => { if (a === 'toggle') { try { await api(`${B}/tasks/${r.id}`, { method: 'PATCH', body: { done: box.checked } }); r.done = box.checked ? 1 : 0; toast(box.checked ? 'Tarea hecha' : 'Tarea pendiente'); } catch (x) { toast(x.message, false); } } } });
    // El filtro arranca en «Pendientes»
    tt.load().then(() => { const s = $('[data-f="done"]', el); if (s) { s.value = '0'; s.dispatchEvent(new Event('change')); } });
    $('[data-tasks]', el).addEventListener('click', (e) => { if (e.target.closest('[data-playbook]')) usePlaybook({ onDone: () => tt.load() }); });
    const autos = C.table({ el: $('[data-autos]', el), base: B, entity: 'automations', title: 'automatización', newText: 'Nueva automatización', fields: [], readOnly: !me.canManage,
      onEdit: (row, done) => editAutomation(row, done), onOpen: () => {},
      empty: 'Sin automatizaciones. Usa los atajos de arriba para crear las más comunes.', emptyIcon: 'bi-lightning',
      columns: [
        { label: 'Automatización', main: true, html: (r) => esc(r.name) },
        { label: 'Cuando', html: (r) => esc((TRIGGER[r.trigger] || r.trigger).replace('N', r.days ?? 'N').replace('X%', `${r.percent ?? 'X'}%`)) },
        { label: 'Entonces', html: (r) => `${esc(ACTION[r.action] || r.action)}${sub(stepsOf(r).map((x) => `${x.t}${x.d ? ` (día ${x.d})` : ''}`).join(' → '))}` },
        { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activa') : chip('free', 'Pausada')) },
        { label: 'Ejecuciones', cls: 'text-end', html: (r) => num(r.runs) }] });
    autos.load();
    const steps = (k) => JSON.stringify(PLAYBOOKS[k][1].map(([t, d]) => ({ t, d })));
    const PRESETS = {
      lead: { name: 'Plan para cada lead nuevo', trigger: 'lead_nuevo', action: 'crear_tarea', task_title: steps('lead'), active: true },
      followup: { name: 'Seguimiento a leads sin contacto', trigger: 'sin_contacto', action: 'crear_tarea', days: 3, task_title: steps('seguimiento'), active: true },
      budget: { name: 'Aviso de presupuesto', trigger: 'presupuesto_campana', action: 'crear_tarea', percent: 80, task_title: steps('presupuesto'), active: true },
    };
    $('[data-anote]', el).addEventListener('click', async (e) => { const b = e.target.closest('[data-preset]'); if (!b) return; try { await api(`${B}/automations`, { method: 'POST', body: PRESETS[b.dataset.preset] }); toast('Automatización creada'); autos.load(); } catch (x) { toast(x.message, false); } });
  }

  async function editAutomation(row, done) {
    if (!me.canManage || RO) return;
    const a = row || { trigger: 'lead_nuevo', action: 'crear_tarea', active: 1, task_title: JSON.stringify(PLAYBOOKS.lead[1].map(([t, d]) => ({ t, d }))) };
    let steps = stepsOf(a);
    const { el: d, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${row ? 'Editar automatización' : 'Nueva automatización'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="name" value="${esc(a.name || '')}" required></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Cuando…</label><select class="form-select" name="trigger">${Object.entries(TRIGGER).map(([k, l]) => `<option value="${k}" ${a.trigger === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="col-sm-3" data-days><label class="form-label small mb-1">N (días)</label><input class="form-control" type="number" min="1" name="days" value="${esc(a.days ?? 3)}"></div>
        <div class="col-sm-3" data-pct><label class="form-label small mb-1">X (%)</label><input class="form-control" type="number" min="1" max="200" name="percent" value="${esc(a.percent ?? 80)}"></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Entonces…</label><select class="form-select" name="action">${Object.entries(ACTION).map(([k, l]) => `<option value="${k}" ${a.action === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="col-sm-6 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="aActive" name="active" ${a.active ? 'checked' : ''}><label class="form-check-label" for="aActive">Activa</label></div></div>
        <div class="col-12"><div class="d-flex justify-content-between align-items-center mb-1"><b class="small" data-stitle>Tareas que crea</b>
          <select class="form-select form-select-sm w-auto" data-pb aria-label="Cargar una plantilla"><option value="">Cargar una plantilla…</option>${Object.entries(PLAYBOOKS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          <div data-steps></div><button class="btn btn-sm btn-outline-primary" type="button" data-addstep><i class="bi bi-plus-lg me-1"></i>Agregar tarea</button>
          <p class="small text-body-secondary mt-1 mb-0">Usa {nombre}, {campana} o {porcentaje}. «Día» es cuántos días después de dispararse vence la tarea.</p></div></div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${row ? '<button type="button" class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar</button></span></div></form>`, { size: 'modal-lg' });
    const f = $('form', d);
    const drawSteps = () => { $('[data-steps]', d).innerHTML = steps.map((st, i) => `<div class="d-flex gap-2 align-items-center mb-1" data-i="${i}"><span class="text-body-secondary small">${i + 1}.</span><input class="form-control form-control-sm" data-t value="${esc(st.t)}" placeholder="Título de la tarea" aria-label="Título"><span class="small text-body-secondary">día</span><input class="form-control form-control-sm" style="width:72px" type="number" min="0" max="365" data-d value="${esc(st.d)}" aria-label="Día"><button class="btn btn-sm btn-light" type="button" data-rm aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>`).join('') || '<p class="small text-body-secondary">Sin tareas.</p>'; };
    const sync = () => { steps = $$('[data-steps] [data-i]', d).map((r) => ({ t: $('[data-t]', r).value.trim(), d: Number($('[data-d]', r).value) || 0 })); };
    const show = () => { $('[data-days]', d).hidden = f.trigger.value !== 'sin_contacto'; $('[data-pct]', d).hidden = f.trigger.value !== 'presupuesto_campana'; $('[data-stitle]', d).textContent = f.action.value === 'crear_oportunidad' ? 'Título de la oportunidad (el primero)' : f.action.value === 'informe_ia' ? 'Tareas (opcional: el informe se guarda en Informes)' : 'Tareas que crea'; };
    drawSteps(); show();
    f.addEventListener('change', (e) => {
      if (e.target.matches('[data-pb]') && e.target.value) { steps = PLAYBOOKS[e.target.value][1].map(([t, n]) => ({ t, d: n })); if (!f.name.value) f.name.value = PLAYBOOKS[e.target.value][0]; e.target.value = ''; drawSteps(); }
      show();
    });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-addstep]')) { sync(); steps.push({ t: '', d: steps.length ? steps[steps.length - 1].d + 1 : 0 }); drawSteps(); $$('[data-t]', d).pop()?.focus(); }
      if (e.target.closest('[data-rm]')) { sync(); steps.splice(Number(e.target.closest('[data-i]').dataset.i), 1); drawSteps(); }
    });
    $('[data-del]', d)?.addEventListener('click', async () => { if (await confirm({ title: '¿Borrar esta automatización?', text: 'Las tareas que ya creó se quedan.' })) { await api(`${B}/automations/${row.id}`, { method: 'DELETE' }); m.hide(); toast('Borrada'); done(); } });
    f.onsubmit = async (e) => {
      e.preventDefault(); sync();
      const list = steps.filter((x) => x.t);
      if (!list.length && f.action.value !== 'informe_ia') { $('[data-err]', d).textContent = 'Agrega al menos una tarea.'; return; }
      const body = { name: f.name.value.trim(), trigger: f.trigger.value, action: f.action.value, days: f.days.value, percent: f.percent.value, active: f.active.checked, task_title: JSON.stringify(list) };
      try { await api(row ? `${B}/automations/${row.id}` : `${B}/automations`, { method: row ? 'PATCH' : 'POST', body }); m.hide(); toast('Automatización guardada'); done(); }
      catch (x) { $('[data-err]', d).textContent = x.message; }
    };
  }

  function lists(el) {
    el.innerHTML = '<div class="row g-3"><div class="col-lg-4"><div data-ls></div></div><div class="col-lg-8"><div data-items></div></div></div>';
    let current = null;
    const lt = C.table({ el: $('[data-ls]', el), base: B, entity: 'lists', title: 'lista', newText: 'Nueva lista', fields: F.lists,
      empty: 'Crea listas de competidores, prospectos, proveedores o ideas.', emptyIcon: 'bi-list-ul', onChanged: () => { if (current) items(); },
      columns: [{ label: 'Lista', main: true, html: (r) => `${esc(r.name)}${sub(LKIND[r.kind])}` }],
      rowActions: () => '<button class="btn btn-sm btn-primary" data-act="open">Abrir</button>',
      onAction: (a, r) => { if (a === 'open') { current = r; items(); } } });
    lt.load();
    function items() {
      if (!current) { $('[data-items]', el).innerHTML = `<div class="dw-card">${window.App.empty('bi-arrow-left', 'Abre una lista para ver y agregar sus elementos.')}</div>`; return; }
      $('[data-items]', el).innerHTML = `<div class="d-flex align-items-center gap-2 mb-2"><h2 class="h6 mb-0 flex-grow-1">${esc(current.name)}</h2>${RO ? '' : '<button class="btn btn-sm btn-outline-primary" data-check><i class="bi bi-rss me-1"></i>Revisar sitios</button>'}</div><div data-t></div>`;
      $('[data-check]', el)?.addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Revisando…';
        try { const r = await api(`${B}/lists/${current.id}/check`, { method: 'POST' }); toast(`Revisé ${r.revisados} sitio(s)`); items(); } catch (x) { toast(x.message, false); b.disabled = false; }
      });
      C.table({ el: $('[data-t]', el), base: B, entity: 'list_items', title: 'elemento', newText: 'Agregar', fields: F.list_items, fixed: { list_id: current.id }, canDelete: true,
        defaults: () => ({ status: 'activo' }), empty: 'Lista vacía.', emptyIcon: 'bi-list-ul',
        onEdit: async (row, changed) => {
          if (RO) return;
          const out = await C.form({ title: row ? 'Editar elemento' : 'Agregar a la lista', fields: F.list_items, base: B, values: row || { status: 'activo' }, onDelete: row ? () => api(`${B}/list_items/${row.id}`, { method: 'DELETE' }) : null });
          if (out === 'deleted') { toast('Borrado'); return changed(); }
          if (!out) return;
          try { await api(row ? `${B}/list_items/${row.id}` : `${B}/list_items`, { method: row ? 'PATCH' : 'POST', body: { ...out, list_id: current.id } }); toast('Guardado'); changed(); } catch (x) { toast(x.message, false); }
        },
        columns: [{ label: 'Elemento', main: true, html: (r) => `${esc(r.title)}${r.url ? `<div class="small"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace(/^https?:\/\//, '').slice(0, 50))}</a></div>` : ''}` },
          { label: 'Estado', html: (r) => chip(r.status === 'activo' ? 'ok' : r.status === 'revisado' ? 'soon' : 'free', r.status) }, { label: 'Puntaje', cls: 'text-end', html: (r) => num(r.score) },
          { label: 'Notas', html: (r) => `<span class="small text-body-secondary">${esc((r.notes || '').slice(0, 80))}</span>${r.ultimas?.length ? `<details class="small mt-1"><summary>Últimas publicaciones (${r.ultimas.length})</summary>${r.ultimas.map((u) => `<div><a href="${esc(u.url)}" target="_blank" rel="noopener">${esc(u.titulo)}</a>${u.fecha ? ` <span class="text-body-secondary">· ${esc(u.fecha)}</span>` : ''}</div>`).join('')}</details>` : ''}` }] }).load();
    }
    items();
  }

  /* ---------- Tarjetas de presentación (las mismas de Diwilo) ---------- */
  // Colores de tarjeta: «app» sigue el color de la marca del negocio (por defecto el de su app, que se elige en Apariencia); luego los 9 temas
  const TEMAS_C = { violeta: ['#8f45f2', '#c99bfa', 'Violeta'], azul: ['#2f6fed', '#93c5fd', 'Azul'], indigo: ['#6366f1', '#a5b4fc', 'Índigo'], rosa: ['#db2777', '#f9a8d4', 'Rosa'], rojo: ['#dc2626', '#fca5a5', 'Rojo'],
    naranja: ['#ea580c', '#fdba74', 'Naranja'], verde: ['#0f9f6e', '#6ee7b7', 'Verde'], turquesa: ['#0d9488', '#5eead4', 'Turquesa'], grafito: ['#64748b', '#cbd5e1', 'Grafito'], ambar: ['#d97706', '#fcd34d', 'Ámbar'] };
  const APP_T = TEMAS_C[me.settings?.tema] || TEMAS_C.violeta;
  const ACC = { app: [APP_T[0], APP_T[1], `Color de mi app (${APP_T[2]})`], ...TEMAS_C };
  const CONTACTOS = [['whatsapp', 'bi-whatsapp', 'WhatsApp', '+57 300 000 0000', 'tel'], ['phone', 'bi-telephone', 'Teléfono', '+57 300 000 0000', 'tel'], ['email', 'bi-envelope', 'Correo', 'nombre@negocio.com', 'email'],
    ['website', 'bi-globe', 'Sitio web', 'https://…', 'url'], ['instagram', 'bi-instagram', 'Instagram', 'usuario', 'text'], ['linkedin', 'bi-linkedin', 'LinkedIn', 'https://www.linkedin.com/in/…', 'url']];
  const cardUrl = (c) => `${location.origin}/c/${c.slug}`;
  const iniciales = (n) => esc((n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  const fotoDe = (c) => (c.has_photo ? `/c/${encodeURIComponent(c.slug)}/foto?v=${c.updated_at}` : '');
  let qrLib;
  const qr = async (text) => {
    qrLib ||= new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
    await qrLib; const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  };
  // Tarjetas de presentación y la marca del negocio (color de la app, modo, logo, fondo, tipografía, tono y kit), en un solo lugar
  let marcaCargada = null;
  async function tarjetasYMarca(el) {
    const SUB = [['tarjetas', 'Tarjetas', 'bi-person-vcard'], ['marca', 'Marca', 'bi-palette'], ['kit', 'Usar en otros lados', 'bi-box-arrow-up-right']];
    el.innerHTML = '<ul data-sub></ul><div data-body></div>';
    const body = $('[data-body]', el);
    const show = async (k) => {
      subTar = k;
      if (k === 'tarjetas') return cards(body);
      marcaCargada ||= new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/m/marca.js'; sc.onload = res; sc.onerror = () => rej(new Error('No se pudo cargar la marca')); document.head.appendChild(sc); });
      try { await marcaCargada; await DW.ready; await new Promise((r) => setTimeout(r, 0)); await window.DwMarca.mount(body, k); } catch (x) { body.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; }
    };
    segBtn($('[data-sub]', el), SUB, show, subTar);
    // «Editar la tarjeta» desde Marca lleva a la edición en vivo
    window.onDwTarjetaEditar = (id) => { editarPendiente = id; $$('[data-sub] .btn', el).forEach((b) => b.classList.toggle('active', b.dataset.k === 'tarjetas')); show('tarjetas'); };
    show(subTar);
  }

  /* ---------- La tarjeta del negocio: la misma vista en la lista, en el editor y en Marca (con los colores, fondo y letra de la marca) ---------- */
  // ctx = { P (paleta del color), claro (fondo blanco), familia (tipografía) }
  const tarjetaHtml = (c, { P, claro, familia, logo }) => {
    const bg = claro ? P.fondo : P.fondo_oscuro, tx = claro ? P.texto : P.texto_oscuro, nombre = c.name || 'Tu nombre';
    const wa = String(c.whatsapp || c.phone || '').replace(/[^\d]/g, ''), ig = String(c.instagram || '').replace(/^@/, '');
    const acts = [wa && ['bi-whatsapp', 'WhatsApp'], c.phone && ['bi-telephone', 'Llamar'], c.email && ['bi-envelope', 'Correo'], c.website && ['bi-globe', 'Sitio web'], ig && ['bi-instagram', 'Instagram'], c.linkedin && ['bi-linkedin', 'LinkedIn']].filter(Boolean);
    const ph = c.photo_url || (c.has_photo ? fotoDe(c) : '');
    const avatar = ph ? `<img src="${esc(ph)}" alt="" style="width:88px;height:88px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 3px ${P[400]}">`
      : `<span class="d-inline-grid text-white fw-semibold" style="width:88px;height:88px;border-radius:50%;place-items:center;font-size:1.9rem;background:linear-gradient(135deg,${P[500]},${P[800]})">${logo ? `<img src="${esc(logo)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : iniciales(nombre)}</span>`;
    return `<div class="rounded-4 p-3" style="background:${bg};color:${tx};font-family:${familia}"><div class="mx-auto text-center" style="max-width:360px;border-radius:20px;padding:26px 20px 18px;background:${claro ? '#fff' : 'rgba(255,255,255,.06)'};box-shadow:${claro ? '0 1px 2px rgba(15,23,42,.06),0 14px 30px rgba(15,23,42,.1)' : '0 14px 30px rgba(0,0,0,.35)'}">
      ${avatar}<div class="fw-semibold fs-4 mt-2" style="line-height:1.15;color:${claro ? P[800] : P[200]}">${esc(nombre)}</div>
      ${c.role ? `<div style="opacity:.85">${esc(c.role)}</div>` : ''}${c.company ? `<div class="font-monospace text-uppercase" style="font-size:.7rem;letter-spacing:.1em;opacity:.6">${esc(c.company)}</div>` : ''}
      ${c.bio ? `<div class="small mt-2" style="opacity:.75">${esc(c.bio)}</div>` : ''}
      ${acts.length ? `<div class="d-grid gap-2 mt-3" style="grid-template-columns:1fr 1fr">${acts.map(([i, t]) => `<span class="rounded-pill py-2 small" style="border:1px solid ${claro ? 'rgba(15,23,42,.14)' : 'rgba(255,255,255,.16)'}"><i class="bi ${i} me-1" style="color:${claro ? P[600] : P[300]}"></i>${t}</span>`).join('')}</div>` : ''}
      <div class="rounded-pill py-2 mt-3 text-white fw-semibold" style="background:${claro ? P[600] : P[500]}"><i class="bi bi-person-lines-fill me-1"></i>Guardar contacto</div>
      <div class="d-flex justify-content-center gap-3 mt-3 small" style="opacity:.6"><span><i class="bi bi-qr-code me-1"></i>Código QR</span><span><i class="bi bi-share me-1"></i>Compartir</span></div></div>
      ${c.chat_slug ? `<div class="d-flex justify-content-end mt-3"><span class="d-grid text-white rounded-circle" style="width:46px;height:46px;place-items:center;background:${P[600]}" title="Chat de IA"><i class="bi bi-chat-dots-fill"></i></span></div>` : ''}</div>`;
  };
  // Lo que hace falta para pintar una tarjeta con la marca del negocio: se lee de /api/marca (paletas, fondo, tipografía)
  const marcaDe = async () => {
    const d = await api('/api/marca');
    const fuente = d.opciones.fuentes.find((f) => f.id === d.marca.tipografia) || d.opciones.fuentes[0];
    if (!document.getElementById('dwFontsMarca')) { const l = document.createElement('link'); l.id = 'dwFontsMarca'; l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?${d.opciones.fuentes.map((f) => `family=${f.google}`).join('&')}&display=swap`; document.head.appendChild(l); }
    return { d, claro: d.marca.fondo_efectivo === 'claro', familia: fuente.familia, logo: me.settings?.logo || null,
      paletaDe: (accent) => (d.opciones.temas.find((t) => t.id === (!accent || accent === 'app' ? d.marca.color_efectivo : accent)) || d.opciones.temas[0]).paleta };
  };
  window.DwCard = { html: tarjetaHtml, marcaDe };

  let editarPendiente = null;
  async function cards(el) {
    el.innerHTML = '<div class="text-body-secondary">Cargando…</div>';
    let rows = [], M;
    try { [rows, M] = await Promise.all([api(`${B}/cards`).then((r) => r.rows), marcaDe()]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const ctxDe = (c) => ({ P: M.paletaDe(c.accent), claro: M.claro, familia: M.familia, logo: c.predeterminada ? M.logo : null });
    el.innerHTML = `<div class="alert alert-light border small">Tarjetas de presentación digitales: cada una tiene su enlace y su QR, se instala como app en el celular y guarda el contacto con un toque. Se ven con el color, el fondo y la letra de tu marca (pestaña <b>Marca</b>). La del negocio se crea sola con sus datos.</div>
      <div class="row g-3">${rows.map((c) => `<div class="col-md-6 col-xl-4" data-id="${c.id}"><div class="dw-card p-2 h-100 d-flex flex-column">
          <div class="d-flex align-items-center gap-2 px-2 pt-1 pb-2">${c.predeterminada ? '<span class="badge text-bg-light">Del negocio</span>' : ''}<span class="small text-body-secondary ms-auto"><i class="bi bi-eye me-1"></i>${num(c.views)} · /c/${esc(c.slug)}</span></div>
          ${tarjetaHtml(c, ctxDe(c))}
          <div class="d-flex flex-wrap gap-1 p-2">${RO ? '' : '<button class="btn btn-sm btn-primary" data-act="edit"><i class="bi bi-pencil me-1"></i>Editar</button>'}
            <a class="btn btn-sm btn-outline-primary" href="/c/${esc(c.slug)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i></a>
            <button class="btn btn-sm btn-outline-primary" data-act="copy" title="Copiar enlace"><i class="bi bi-link-45deg"></i></button>
            <button class="btn btn-sm btn-outline-primary" data-act="qr" title="QR"><i class="bi bi-qr-code"></i></button></div></div></div>`).join('')}
        ${RO ? '' : '<div class="col-md-6 col-xl-4"><button class="dw-card d-grid text-body-secondary w-100 h-100" data-new style="place-items:center;border:1px dashed var(--bs-border-color);min-height:220px"><span><i class="bi bi-person-plus fs-3 d-block"></i>Nueva tarjeta</span></button></div>'}</div>`;
    el.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return nueva();
      const b = e.target.closest('[data-act]'); if (!b) return;
      const c = rows.find((x) => String(x.id) === b.closest('[data-id]').dataset.id);
      if (b.dataset.act === 'edit') editar(c);
      if (b.dataset.act === 'copy') { try { await navigator.clipboard.writeText(cardUrl(c)); toast('Enlace copiado'); } catch { prompt('Copia el enlace:', cardUrl(c)); } }
      if (b.dataset.act === 'qr') modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${esc(c.name)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body text-center"><div style="max-width:240px;margin:auto">${await qr(cardUrl(c))}</div><p class="small text-body-secondary mt-2 mb-0">${esc(cardUrl(c))}</p></div>`);
    };

    // Nueva tarjeta: un modal con los profesionales del negocio como sugeridos (o en blanco); luego se edita en vivo, sin modal.
    async function nueva() {
      const yaTienen = new Set(rows.flatMap((c) => [String(c.name || '').trim().toLowerCase(), String(c.email || '').trim().toLowerCase()]).filter(Boolean));
      const prof = await api('/api/profesionales/profesionales?limit=200').then((r) => r.rows.filter((p) => p.activo && !yaTienen.has(String(p.nombre).trim().toLowerCase()) && !(p.email && yaTienen.has(String(p.email).toLowerCase())))).catch(() => []);
      if (!prof.length) return editar(null);
      const { el: m, m: mm } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Nueva tarjeta</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><div class="small text-body-secondary mb-2"><i class="bi bi-stars me-1"></i>Sugeridos: profesionales de tu equipo que aún no tienen tarjeta</div>
          <div class="d-grid gap-2">${prof.map((p, i) => `<button type="button" class="btn text-start border d-flex align-items-center gap-3 p-2" data-p="${i}"><span class="d-grid text-white fw-semibold flex-shrink-0" style="width:42px;height:42px;border-radius:50%;place-items:center;background:var(--dw-p)">${iniciales(p.nombre)}</span>
            <span class="flex-grow-1" style="min-width:0"><span class="d-block fw-semibold text-truncate">${esc(p.nombre)}</span><span class="d-block small text-body-secondary text-truncate">${esc([p.email, p.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</span></span><i class="bi bi-chevron-right text-body-secondary"></i></button>`).join('')}</div>
          <button type="button" class="btn btn-outline-primary w-100 mt-3" data-blank><i class="bi bi-plus-lg me-1"></i>Tarjeta en blanco</button></div>`);
      m.addEventListener('click', (e) => {
        if (e.target.closest('[data-blank]')) { mm.hide(); return editar(null); }
        const b = e.target.closest('[data-p]'); if (!b) return;
        const p = prof[+b.dataset.p]; mm.hide();
        editar(null, { name: p.nombre, email: p.email || '', phone: p.telefono || '', whatsapp: p.telefono || '', role: 'Profesional' });
      });
    }

    // Edición en vivo (sin modal): el formulario a la izquierda y la tarjeta real, con la marca, a la derecha
    async function editar(card, base = {}) {
      const chats = await api('/api/ai/chats').then((r) => r.rows.filter((x) => x.activo)).catch(() => []);
      const d = card ? { ...card } : { name: '', accent: 'app', company: me.business.name, ...base };
      let foto = card ? fotoDe(card) : '', fotoNueva; // undefined = sin cambio · '' = quitar · data URL = nueva
      el.onclick = null;
      el.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3 flex-wrap"><button class="btn btn-light btn-sm" data-back><i class="bi bi-arrow-left me-1"></i>Tarjetas</button><h2 class="h5 mb-0">${card ? 'Editar tarjeta' : 'Nueva tarjeta'}</h2>
          ${card ? `<span class="ms-auto d-flex gap-1"><a class="btn btn-sm btn-outline-primary" href="/c/${esc(card.slug)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>Ver pública</a><button class="btn btn-sm btn-outline-primary" data-copy><i class="bi bi-link-45deg me-1"></i>Copiar enlace</button></span>` : ''}</div>
        <div class="row g-3"><div class="col-lg-7"><form class="dw-card"><div class="row g-2">
          <div class="col-sm-6"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="name" value="${esc(d.name || '')}" required></div>
          <div class="col-sm-6"><label class="form-label small mb-1">Cargo</label><input class="form-control" name="role" value="${esc(d.role || '')}" placeholder="Directora, asesor…"></div>
          <div class="col-12"><label class="form-label small mb-1">Empresa</label><input class="form-control" name="company" value="${esc(d.company || '')}"></div>
          <div class="col-12"><label class="form-label small mb-1">Presentación</label><textarea class="form-control" name="bio" rows="2" maxlength="600">${esc(d.bio || '')}</textarea></div>
          ${CONTACTOS.map(([k, ic, l, ph, t]) => `<div class="col-sm-6"><label class="form-label small mb-1"><i class="bi ${ic} me-1"></i>${l}</label><input class="form-control" name="${k}" type="${t}" value="${esc(d[k] || '')}" placeholder="${esc(ph)}"></div>`).join('')}
          <div class="col-12"><label class="form-label small mb-1">Dirección</label><div class="input-group"><span class="input-group-text small">${esc(location.host)}/c/</span><input class="form-control" name="slug" value="${esc(d.slug || '')}" placeholder="se arma con el nombre"></div></div>
          <div class="col-12"><label class="form-label small mb-1"><i class="bi bi-chat-dots me-1"></i>Chat de IA de la tarjeta</label><select class="form-select" name="chat_slug"><option value="">Sin chat</option>${chats.map((x) => `<option value="${esc(x.slug)}" ${d.chat_slug === x.slug ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
            <div class="small text-body-secondary">${chats.length ? 'Aparece como una burbuja en la tarjeta.' : 'Aún no tienes chats activos: créalos en IA → Chats.'}</div></div>
          <div class="col-12"><label class="form-label small mb-1">Foto</label><div class="d-flex align-items-center gap-2 flex-wrap"><button type="button" class="btn btn-sm btn-outline-primary" data-subir><i class="bi bi-camera me-1"></i>Subir</button><button type="button" class="btn btn-sm btn-light" data-quitar>Quitar</button><input type="file" accept="image/*" hidden data-file></div></div>
          <div class="col-12"><label class="form-label small mb-1">Color</label><div class="d-flex flex-wrap gap-2" data-colores>${Object.entries(ACC).filter(([k]) => k !== 'ambar' || d.accent === 'ambar').map(([k, a]) => `<button type="button" class="btn p-0 rounded-circle d-grid" data-acc="${k}" title="${a[2]}" aria-label="${a[2]}" style="width:28px;height:28px;background:${a[0]};outline-offset:2px;place-items:center">${k === 'app' ? '<i class="bi bi-phone text-white" style="font-size:.8rem"></i>' : ''}</button>`).join('')}</div><div class="small text-body-secondary mt-1">El primero sigue el color de tu app</div></div>
        </div><div class="d-flex flex-wrap align-items-center gap-2 mt-3"><button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Guardar</button><button type="button" class="btn btn-light" data-back>Cancelar</button>
          ${card && !card.predeterminada ? '<button type="button" class="btn btn-outline-danger ms-auto" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}<span class="small text-danger" data-err></span></div></form></div>
        <div class="col-lg-5 order-first order-lg-last"><div class="position-sticky" style="top:76px"><div class="small text-body-secondary mb-2">Vista previa en vivo</div><div data-prev></div>
          ${card ? `<div class="text-center mt-3"><div data-qr style="max-width:150px;margin:auto"></div><div class="small text-body-secondary mt-1">${num(card.views)} vistas</div></div>` : ''}</div></div></div>`;
      const f = $('form', el);
      let accent = d.accent || 'app';
      const pintar = () => {
        const v = Object.fromEntries(['name', 'role', 'company', 'bio', ...CONTACTOS.map((x) => x[0])].map((k) => [k, f[k].value.trim()]));
        $('[data-prev]', el).innerHTML = tarjetaHtml({ ...v, photo_url: foto, chat_slug: f.chat_slug.value, accent }, { P: M.paletaDe(accent), claro: M.claro, familia: M.familia, logo: card?.predeterminada ? M.logo : null });
        $$('[data-acc]', el).forEach((b) => (b.style.outline = b.dataset.acc === accent ? `3px solid ${ACC[accent][1]}` : 'none'));
      };
      pintar();
      f.addEventListener('input', pintar); f.addEventListener('change', pintar);
      const volver = () => cards(el);
      $$('[data-back]', el).forEach((b) => (b.onclick = volver));
      $('[data-copy]', el)?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(cardUrl(card)); toast('Enlace copiado'); } catch { prompt('Copia el enlace:', cardUrl(card)); } });
      if (card) qr(cardUrl(card)).then((svg) => { const q = $('[data-qr]', el); if (q) q.innerHTML = svg; }).catch(() => {});
      $('[data-colores]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-acc]'); if (b) { accent = b.dataset.acc; pintar(); } });
      $('[data-subir]', el).onclick = () => $('[data-file]', el).click();
      $('[data-quitar]', el).onclick = () => { foto = ''; fotoNueva = ''; pintar(); };
      // La foto se recorta cuadrada y se reduce a 400 px antes de subirla
      $('[data-file]', el).addEventListener('change', async (e) => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file || !file.type.startsWith('image/')) return;
        const img = new Image(); img.src = URL.createObjectURL(file);
        try { await img.decode(); } catch { toast('No se pudo leer esa imagen. Prueba con JPG o PNG.', false); return; }
        const k = Math.min(img.naturalWidth, img.naturalHeight), S = 400, cv = document.createElement('canvas'); cv.width = cv.height = S;
        cv.getContext('2d').drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, 0, 0, S, S);
        URL.revokeObjectURL(img.src);
        foto = fotoNueva = cv.toDataURL('image/jpeg', 0.85); pintar();
      });
      // Ícono de la app instalable: la foto (o las iniciales) sobre el color de la tarjeta
      const iconos = async () => {
        const [ac, acl] = ACC[accent];
        let img = null;
        if (foto) { img = new Image(); img.src = foto; try { await img.decode(); } catch { img = null; } }
        const draw = (S) => {
          const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
          const bg = g.createLinearGradient(0, 0, S, S); bg.addColorStop(0, ac); bg.addColorStop(1, '#150B2B'); g.fillStyle = bg; g.fillRect(0, 0, S, S);
          const cx = S / 2, r = S * 0.3;
          g.beginPath(); g.arc(cx, cx, r + S * 0.022, 0, Math.PI * 2); g.fillStyle = acl; g.fill();
          g.save(); g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.clip();
          if (img) { const k = Math.min(img.naturalWidth, img.naturalHeight); g.drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, cx - r, cx - r, r * 2, r * 2); }
          else { g.fillStyle = '#150B2B'; g.fillRect(cx - r, cx - r, r * 2, r * 2); g.fillStyle = '#fff'; g.font = `600 ${Math.round(S * 0.2)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText((f.name.value || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(), cx, cx + S * 0.01); }
          g.restore(); return cv.toDataURL('image/png');
        };
        try { return { icon_192: draw(192), icon_512: draw(512) }; } catch { return {}; }
      };
      $('[data-del]', el)?.addEventListener('click', async () => {
        if (!(await confirm({ title: `¿Borrar la tarjeta de ${card.name}?`, text: 'Su enlace y su QR dejan de funcionar.' }))) return;
        try { await api(`${B}/cards/${card.id}`, { method: 'DELETE' }); toast('Tarjeta borrada'); volver(); } catch (x) { $('[data-err]', el).textContent = x.message; }
      });
      f.onsubmit = async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(['name', 'role', 'company', 'bio', ...CONTACTOS.map((x) => x[0]), 'slug'].map((k) => [k, f[k].value.trim()]));
        body.accent = accent; body.chat_slug = f.chat_slug.value;
        if (!body.name) { $('[data-err]', el).textContent = 'Escribe el nombre'; return; }
        if (!body.slug) delete body.slug;
        const btn = f.querySelector('.btn-primary'); btn.disabled = true;
        try {
          const id = card ? card.id : (await api(`${B}/cards`, { method: 'POST', body })).id;
          if (card) await api(`${B}/cards/${id}`, { method: 'PATCH', body });
          await api(`${B}/cards/${id}/foto`, { method: 'PUT', body: { ...(fotoNueva !== undefined ? { photo_data: fotoNueva } : {}), ...(await iconos()) } });
          toast(card ? 'Tarjeta guardada' : 'Tarjeta creada'); volver();
        } catch (x) { $('[data-err]', el).textContent = x.message; btn.disabled = false; }
      };
    }
    // Desde Marca se puede pedir editar la tarjeta del negocio
    if (editarPendiente) { const id = editarPendiente; editarPendiente = null; const c = rows.find((x) => x.id === id); if (c) editar(c); }
  }

  // Informes del analista: los escribe el asistente de IA del negocio (conexión MCP) o la automatización semanal.
  function reports(el) {
    el.innerHTML = `<div class="alert alert-light border small">Pídele a tu asistente de IA (conectado en IA → Conexiones): <i>«Escribe el informe de marketing de esta semana y guárdalo»</i>. Usa los datos del módulo y lo deja aquí. También puedes crear la automatización «Cada lunes → Informe del analista de IA».</div><div data-r></div>`;
    C.table({ el: $('[data-r]', el), base: B, entity: 'reports', title: 'informe', newText: 'Escribir informe', readOnly: RO || !me.canManage, emptyIcon: 'bi-journal-text', empty: 'Aún no hay informes.',
      fields: [{ k: 'title', label: 'Título', required: true, full: true }, { k: 'content', label: 'Informe', type: 'long', required: true }],
      defaults: () => ({ title: `Marketing · ${day(C.todayCo())}` }), fixed: { origen: 'manual' },
      columns: [{ label: 'Informe', main: true, html: (r) => `${esc(r.title)}${sub((r.content || '').slice(0, 140))}` }, { label: 'Origen', html: (r) => chip(r.origen === 'manual' ? 'free' : 'ok', { ia: 'Asistente IA', automatico: 'Automático', manual: 'Manual' }[r.origen] || r.origen) },
        { label: 'Fecha', html: (r) => window.App.fecha(r.created_at) }],
      rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="ver">Leer</button>',
      onAction: (a, r) => modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${esc(r.title)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body"><div style="white-space:pre-wrap">${esc(r.content)}</div></div>`, { size: 'modal-lg' }),
      onOpen: () => {} }).load();
  }

  async function tools(el) {
    // Si el negocio usa Finanzas, cada suscripción puede cargarse a un centro de costo (como en Diwilo)
    let centros = [];
    if (me.canManage && me.modules.some((m) => m.id === 'finanzas')) centros = await api('/api/finanzas/cost_centers?limit=500').then((d) => d.rows).catch(() => []);
    const fields = centros.length ? [...F.tools.slice(0, -1), { k: 'cost_center_id', label: 'Centro de costo (Finanzas)', type: 'select', options: [['', '—'], ...centros.map((x) => [x.id, x.name])] }, F.tools[F.tools.length - 1]] : F.tools;
    C.table({ el, base: B, entity: 'tools', title: 'herramienta', newText: 'Nueva herramienta', fields,
      filters: [{ k: 'category', options: opts(TOOL_CAT, 'Todos los tipos') }],
      empty: 'Registra las suscripciones y cuentas externas del negocio (Meta Business, Canva, CRM, correo…).', emptyIcon: 'bi-plug',
      columns: [
        { label: 'Herramienta', main: true, html: (r) => `${esc(r.name)}${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="Abrir"><i class="bi bi-box-arrow-up-right"></i></a>` : ''}${sub([r.vendor, r.plan].filter(Boolean).join(' · '))}` },
        { label: 'Tipo', html: (r) => `<span class="badge text-bg-light">${esc(TOOL_CAT[r.category] || r.category)}</span>` },
        { label: 'Costo', cls: 'text-end', html: (r) => `${money(r.cost)}${sub(r.cycle)}` },
        { label: 'Renueva', html: (r) => day(r.renews_on) },
        { label: 'Cuenta', html: (r) => esc(r.account_email || '—') },
        { label: 'Estado', html: (r) => chip(r.status === 'activa' ? 'ok' : r.status === 'prueba' ? 'soon' : 'free', r.status) }] }).load();
  }

  segBtn($('[data-seg]'), VIEWS, (k) => { view = k; render(); }, view);
  render();
});

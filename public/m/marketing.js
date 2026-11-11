// Página del módulo Marketing (Marketing Hub de Diwilo): resumen, clientes y leads, oportunidades, campañas con links
// de rastreo, tareas y automatizaciones, listas, informes y suscripciones/herramientas. Las tarjetas de presentación y la marca están en la pantalla Marca.
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
  // Cabecera del módulo: el agente (ícono y nombre), las estadísticas en líneas pequeñas y el chat; si el componente no carga, tarjetas como antes
  const cabeceraAgente = async (el, modulo, tiles) => { if (!window.DwAgenteMod) await new Promise((ok) => { const s = document.createElement('script'); s.src = (location.pathname.startsWith('/admin/m/') ? '/admin/m/' : '/m/') + 'agentemod.js'; s.onload = s.onerror = ok; document.head.appendChild(s); }); return window.DwAgenteMod ? window.DwAgenteMod.montar(el, { modulo, stats: tiles }) : C.kpis(el, tiles); };
  const { money, num, pct, day, chip } = C;
  const B = '/api/marketing';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const RO = me.business.readOnly;
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');
  const STAGE_C = { lead: 'Lead', cliente: 'Cliente', perdido: 'Perdido' };
  const STAGE_D = { nuevo: 'Nuevo', calificado: 'Calificado', propuesta: 'Propuesta', negociacion: 'Negociación', ganado: 'Ganado', perdido: 'Perdido' };
  const etapaNombre = (k) => STAGE_D[k] || String(k || '').replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());   // las etapas propias de un pipeline llegan por su clave
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
      { k: 'name', label: 'Nombre', required: true }, { k: 'company', label: 'Nombre de la empresa', placeholder: 'Madetableros' }, { k: 'legal_name', label: 'Razón social', placeholder: 'Distribuciones Madetableros S.A.S.' }, { k: 'tax_id', label: 'NIT' }, { k: 'email', label: 'Correo', type: 'email' }, { k: 'phone', label: 'Teléfono' },
      { k: 'stage', label: 'Etapa', type: 'select', options: Object.entries(STAGE_C) }, { k: 'source', label: 'Origen', placeholder: 'Instagram, referido, volante…' },
      { k: 'campaign_id', label: 'Campaña', ref: 'campaigns' }, { k: 'owner', label: 'Responsable' }, { k: 'last_contact_at', label: 'Último contacto', type: 'date' },
      { k: 'tags', label: 'Etiquetas', placeholder: 'vip, barrio' }, { k: 'notes', label: 'Notas', type: 'long' }],
    deals: [
      { k: 'title', label: 'Oportunidad', required: true, full: true }, { k: 'contact_id', label: 'Cliente o lead', ref: 'contacts' }, { k: 'value', label: 'Valor (COP)', type: 'money' },
      { k: 'campaign_id', label: 'Campaña', ref: 'campaigns' }, { k: 'next_date', label: 'Próximo seguimiento', type: 'date' },
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

  const VIEWS = [['resumen', 'Resumen', 'bi-graph-up'], ['contactos', 'Clientes y leads', 'bi-person-lines-fill'], ['oportunidades', 'Oportunidades', 'bi-funnel'], ['difusion', 'Difusión', 'bi-broadcast'],
    ['campanas', 'Campañas', 'bi-megaphone'], ['listas', 'Listas', 'bi-list-ul'], ['herramientas', 'Suscripciones y herramientas', 'bi-plug']];
  let view = (location.hash || '#resumen').slice(1);
  // Las tarjetas y la marca ahora viven en su propia pantalla del menú: los enlaces viejos (#tarjetas, #marca, #kit) llevan allá
  if (['tarjetas', 'marca', 'kit'].includes(view)) { if (!location.pathname.startsWith('/admin/m/')) { location.replace(`/staff/marca.html#${view}`); return; } view = 'resumen'; }   // el panel de Diwilo tiene sus propias tarjetas
  if (!VIEWS.some(([k]) => k === view)) view = 'resumen';
  function render() {
    history.replaceState(null, '', `#${view}`);
    const old = $('[data-view]'), el = old.cloneNode(false);
    old.replaceWith(el);
    ({ resumen: summary, contactos: contacts, oportunidades: pipeline, difusion, campanas: campaigns, listas: lists, herramientas: tools })[view](el);
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
      cabeceraAgente($('[data-kpis]', el), 'marketing', [
        ['Leads nuevos', num(s.contacts.new), '', 'bi-person-plus'], ['Leads abiertos', num(s.contacts.by_stage.lead || 0), '', 'bi-hourglass'], ['Clientes', num(s.contacts.by_stage.cliente || 0), '', 'bi-person-check'],
        ['Oportunidades abiertas', money(open), `${num(s.deals.pipeline.reduce((a, p) => a + p.n, 0))} en curso`, 'bi-funnel'],
        ['Ganado en el periodo', money(s.deals.won_value), `${num(s.deals.won)} cerradas · ${pct(s.deals.win_rate)} de éxito`, 'bi-trophy'],
        ['Gasto del periodo', money(s.totals.spend_period), `Presupuesto total ${money(s.totals.budget)}`, 'bi-cash'],
        ['Costo por lead', money(s.totals.cpl), '', 'bi-tag'], ['Retorno (ROI)', pct(s.totals.roi), `Ingresos atribuidos ${money(s.totals.revenue)}`, 'bi-graph-up-arrow'],
        ['Herramientas', money(s.tools.monthly), `${num(s.tools.active)} activas · al mes`, 'bi-plug']]);
      const maxF = Math.max(1, ...s.deals.pipeline.map((p) => p.n));
      $('[data-funnel]', el).innerHTML = s.deals.pipeline.map((p) => `<div class="d-flex align-items-center gap-2 small mb-2"><span style="width:96px">${esc(p.name || etapaNombre(p.stage))}</span><div class="progress flex-grow-1" style="height:8px"><div class="progress-bar" style="width:${(p.n / maxF * 100).toFixed(1)}%"></div></div><b style="width:28px" class="text-end">${num(p.n)}</b><span class="text-body-secondary text-end" style="width:96px">${money(p.value)}</span></div>`).join('')
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
      rowActions: () => (RO ? '' : '<button class="btn btn-sm btn-outline-secondary" data-act="contacted" title="Marcar contacto de hoy" aria-label="Marcar contacto de hoy"><i class="bi bi-telephone"></i></button> <button class="btn btn-sm btn-outline-primary" data-act="ficha" title="Ver todo de este contacto" aria-label="Ficha del contacto"><i class="bi bi-person-vcard"></i></button> <button class="btn btn-sm btn-outline-secondary" data-act="plan" title="Crear sus tareas con una plantilla" aria-label="Plantilla de tareas"><i class="bi bi-list-check"></i></button> <button class="btn btn-sm btn-outline-secondary" data-act="deal" title="Crear oportunidad" aria-label="Crear oportunidad"><i class="bi bi-funnel"></i></button>'),
      onAction: async (a, r) => {
        try {
          if (a === 'contacted') { await api(`${B}/contacts/${r.id}`, { method: 'PATCH', body: { last_contact_at: C.todayCo() } }); toast('Contacto registrado'); t.load(); }
          if (a === 'ficha') return ficha(r.id, () => t.load());
          if (a === 'plan') usePlaybook({ contact: r });
          if (a === 'deal') {
            const out = await C.form({ title: 'Nueva oportunidad', fields: F.deals, base: B, values: { title: `Oportunidad: ${r.name}`, contact_id: r.id, campaign_id: r.campaign_id } });
            if (out) { await api(`${B}/deals`, { method: 'POST', body: out }); C.dropRefs(B, 'deals'); toast('Oportunidad creada'); }
          }
        } catch (x) { toast(x.message, false); }
      } });
    t.load();
    el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-csv]')) return;
      const cols = [['Nombre', 'name'], ['Empresa', 'company'], ['Razón social', 'legal_name'], ['NIT', 'tax_id'], ['Correo', 'email'], ['Teléfono', 'phone'], ['Etapa', 'stage'], ['Origen', 'source'], ['Responsable', 'owner'], ['Último contacto', 'last_contact_at'], ['Notas', 'notes']];
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [cols.map((x) => x[0]).join(';'), ...t.rows().map((r) => cols.map(([, k]) => q(r[k])).join(';'))].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'clientes-y-leads.csv'; a.click();
    });
  }

  // Ficha 360: todo lo que hay con este contacto en un solo lugar (Marketing, Mensajes, Proyectos y Finanzas) y su historia
  async function ficha(id, despues) {
    await (window.DwViz ? Promise.resolve() : new Promise((ok) => { const j = document.createElement('script'); j.src = `${location.pathname.startsWith('/admin/m/') ? '/admin/m/' : '/m/'}dwviz.js`; j.onload = j.onerror = () => ok(); document.head.appendChild(j); }));
    const V = window.DwViz;
    const { el: d } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5" data-t>Ficha</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div data-c><div class="dv-sk"></div><div class="dv-sk"></div></div></div>`, { size: 'modal-xl' });
    let f; try { f = await api(`${B}/contacts/${id}/ficha`); } catch (x) { $('[data-c]', d).innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const ct = f.contacto, t = f.totales, tel = (ct.phone || '').replace(/\D/g, '').replace(/^3/, '573');
    $('[data-t]', d).textContent = ct.company || ct.name;
    $('[data-c]', d).innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-3">${chip(ct.stage === 'cliente' ? 'ok' : ct.stage === 'perdido' ? 'free' : 'soon', STAGE_C[ct.stage] || ct.stage)}
        <span class="small text-body-secondary">${[ct.legal_name, ct.tax_id && `NIT ${ct.tax_id}`, ct.name !== ct.company && ct.name, ct.email, ct.phone].filter(Boolean).map(esc).join(' · ')}</span>
        <span class="ms-auto d-flex gap-2">${ct.email ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${esc(ct.email)}"><i class="bi bi-envelope me-1"></i>Correo</a>` : ''}${tel ? `<a class="btn btn-sm btn-outline-success" target="_blank" rel="noopener" href="https://wa.me/${esc(tel)}"><i class="bi bi-whatsapp me-1"></i>WhatsApp</a>` : ''}</span></div>
      <div data-k></div>
      <div class="row g-3"><div class="col-lg-7">
        ${V.tarjeta('Oportunidades', f.oportunidades.length ? f.oportunidades.map((o) => `<div class="d-flex justify-content-between small py-1 border-bottom"><span>${esc(o.title)} ${chip(o.stage === 'ganado' ? 'ok' : o.stage === 'perdido' ? 'free' : 'soon', etapaNombre(o.stage))}</span><b>${money(o.value)}</b></div>`).join('') : '<p class="small text-body-secondary mb-0">Sin oportunidades. Crea una desde la lista (ícono de embudo).</p>')}
        <div class="mt-3">${V.tarjeta('Cotizaciones y cuentas de cobro', f.cotizaciones.length || f.cuentas.length ? [...f.cotizaciones.map((q) => `<div class="d-flex justify-content-between small py-1 border-bottom"><span><i class="bi bi-file-earmark-text me-1"></i>${esc(q.number)} · ${esc(q.title || '')} ${chip(q.status === 'aprobada' ? 'ok' : q.status === 'rechazada' ? 'bad' : 'soon', q.status)}</span><b>${money(q.total)}</b></div>`), ...f.cuentas.map((i) => `<div class="d-flex justify-content-between small py-1 border-bottom"><span><i class="bi bi-receipt me-1"></i>${esc(i.number || '#' + i.id)} ${chip(i.status === 'pagada' ? 'ok' : 'soon', i.status === 'pagada' ? 'Pagada' : 'Por cobrar')}</span><b>${money(i.total)}</b></div>`)].join('') : '<p class="small text-body-secondary mb-0">Aún no tiene cotizaciones. Se crean en Proyectos.</p>', { sub: 'Vienen de Proyectos y Finanzas' })}</div>
        <div class="mt-3">${V.tarjeta('Tareas', f.tareas.length ? f.tareas.map((x) => `<div class="small py-1 border-bottom ${x.done ? 'text-body-secondary text-decoration-line-through' : ''}"><i class="bi ${x.done ? 'bi-check2-square' : 'bi-square'} me-1"></i>${esc(x.title)}${x.due_date && !x.done ? ` <span class="text-body-secondary">· ${day(x.due_date)}</span>` : ''}</div>`).join('') : '<p class="small text-body-secondary mb-0">Sin tareas.</p>')}</div>
      </div><div class="col-lg-5"><div data-tl></div></div></div>`;
    V.kpis($('[data-k]', d), [
      { titulo: 'En juego', valor: money(t.en_juego), icono: 'bi-funnel' }, { titulo: 'Cotizado', valor: money(t.cotizado), icono: 'bi-file-earmark-text' },
      { titulo: 'Cobrado', valor: money(t.cobrado), icono: 'bi-cash-coin', tono: 'ok' }, { titulo: 'Por cobrar', valor: money(t.por_cobrar), icono: 'bi-receipt', tono: t.por_cobrar ? 'aviso' : 'ok' }]);
    const tl = $('[data-tl]', d); tl.innerHTML = V.tarjeta('Historia', '<div data-in></div>', { sub: 'Lo último primero' });
    V.linea_de_tiempo($('[data-in]', tl), f.eventos.map((e) => ({ ...e, fecha: day(e.fecha) })), { fmt: money });
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

  // Bandejas y plantillas de Mensajes (para los disparadores de etapa y las difusiones); si el negocio no usa Mensajes llegan vacías
  let waCache = null;
  const waBandejas = () => (waCache ||= api('/api/whatsapp/bandejas').then((d) => (d.rows || []).filter((b) => b.activo !== 0 && ['whatsapp', 'correo'].includes(b.canal))).catch(() => []));
  const tplCache = {};
  const waPlantillas = (id) => (tplCache[id] ||= api(`/api/whatsapp/plantillas?bandeja=${id}`).then((d) => (d.rows || []).filter((p) => p.soportada)).catch((x) => { delete tplCache[id]; throw x; }));

  // Difusión: un mensaje a un segmento de contactos, por plantilla aprobada de WhatsApp o por correo (bandejas de Mensajes)
  async function difusion(el) {
    const puede = me.canManage && !RO;
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><span class="small text-body-secondary flex-grow-1">Envía un mensaje a un grupo de contactos: una plantilla de WhatsApp o un correo. Sale por las bandejas de Mensajes y cada envío queda en el chat de la persona.</span>${puede ? '<button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nueva difusión</button>' : ''}</div><div data-l><div class="dv-sk"></div></div>`;
    const EST = { pendiente: ['soon', 'Sin enviar'], enviando: ['soon', 'A medias'], terminada: ['ok', 'Enviada'] };
    let rows = [];
    async function load() {
      rows = (await api(`${B}/difusiones`)).rows;
      $('[data-l]', el).innerHTML = rows.length ? `<div class="list-group">${rows.map((d) => `<div class="list-group-item" data-id="${d.id}"><div class="d-flex flex-wrap align-items-center gap-2">
          <span class="me-auto"><b><i class="bi ${d.canal === 'correo' ? 'bi-envelope' : 'bi-whatsapp'} me-1"></i>${esc(d.nombre)}</b> ${chip(...(EST[d.estado] || EST.pendiente))}<span class="d-block small text-body-secondary">${esc(d.canal === 'correo' ? d.asunto || '' : `Plantilla ${d.plantilla || ''}`)} · ${day(new Date(d.created_at).toISOString().slice(0, 10))}${d.creado_por ? ` · ${esc(d.creado_por)}` : ''}</span></span>
          <span class="small text-nowrap"><b>${num(d.enviados)}</b> de ${num(d.total)} enviados${d.fallidos ? ` · <span class="text-danger">${num(d.fallidos)} con error</span>` : ''}</span>
          ${puede && d.pendientes ? `<button class="btn btn-sm btn-primary" data-go><i class="bi bi-send me-1"></i>${d.enviados + d.fallidos ? 'Continuar' : 'Enviar'}</button>` : ''}${d.fallidos ? '<button class="btn btn-sm btn-outline-secondary" data-err>Ver errores</button>' : ''}${puede ? '<button class="btn btn-sm btn-outline-danger" data-rm aria-label="Borrar"><i class="bi bi-trash"></i></button>' : ''}</div>
          <div class="progress mt-2" style="height:6px"><div class="progress-bar bg-success" style="width:${(d.enviados / Math.max(1, d.total) * 100).toFixed(1)}%"></div><div class="progress-bar bg-danger" style="width:${(d.fallidos / Math.max(1, d.total) * 100).toFixed(1)}%"></div></div></div>`).join('')}</div>`
        : '<div class="dw-card text-center text-body-secondary py-5"><i class="bi bi-broadcast fs-2 d-block mb-2"></i>Aún no has enviado difusiones.<br><span class="small">Sirven para avisar una promoción, reactivar leads fríos o recordar algo a todos tus clientes.</span></div>';
    }
    // Envía por tandas cortas mostrando el avance; se puede pausar y retomar después desde la lista
    function enviar(d) {
      let parar = false;
      const { el: w, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Enviando «${esc(d.nombre)}»</h2></div><div class="modal-body"><div class="progress mb-2" style="height:10px"><div class="progress-bar bg-success" data-ok style="width:0"></div><div class="progress-bar bg-danger" data-ko style="width:0"></div></div><p class="small mb-0" data-t>Empezando…</p></div>
        <div class="modal-footer border-0 pt-0"><button class="btn btn-light" data-stop>Pausar</button></div>`);
      const pinta = (r) => { $('[data-ok]', w).style.width = `${(r.enviados / Math.max(1, r.total) * 100).toFixed(1)}%`; $('[data-ko]', w).style.width = `${(r.fallidos / Math.max(1, r.total) * 100).toFixed(1)}%`; $('[data-t]', w).innerHTML = `<b>${num(r.enviados)}</b> enviados${r.fallidos ? ` · <span class="text-danger">${num(r.fallidos)} con error</span>` : ''} · faltan ${num(r.pendientes)}`; };
      $('[data-stop]', w).onclick = () => { parar = true; m.hide(); };
      w.addEventListener('hidden.bs.modal', () => { parar = true; load(); });
      (async () => {
        try {
          for (;;) {
            const r = await api(`${B}/difusiones/${d.id}/enviar`, { method: 'POST' });
            pinta(r);
            if (!r.pendientes) { $('[data-stop]', w).textContent = 'Cerrar'; toast(`Difusión enviada: ${num(r.enviados)} ${r.enviados === 1 ? 'mensaje' : 'mensajes'}${r.fallidos ? ` y ${num(r.fallidos)} con error` : ''}`); return; }
            if (parar) return;
          }
        } catch (x) { $('[data-t]', w).innerHTML = `<span class="text-danger">${esc(x.message)}</span>`; $('[data-stop]', w).textContent = 'Cerrar'; }
      })();
    }
    async function nueva() {
      const [bs, op, pp, ks] = await Promise.all([waBandejas(), api(`${B}/difusiones/opciones`), api(`${B}/pipelines`), C.refs(B, 'campaigns')]);
      if (!bs.length) return toast('Primero conecta WhatsApp o un correo en Mensajes', false);
      const hay = (canal) => bs.some((b) => b.canal === canal);
      const { el: d, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Nueva difusión</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><div class="row g-2">
          <div class="col-sm-7"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="nombre" required maxlength="100" placeholder="Promo de noviembre"></div>
          <div class="col-sm-5"><label class="form-label small mb-1">Canal</label><select class="form-select" name="canal">${hay('whatsapp') ? '<option value="whatsapp">WhatsApp (plantilla)</option>' : ''}${hay('correo') ? '<option value="correo">Correo</option>' : ''}</select></div>
          <div class="col-sm-6"><label class="form-label small mb-1">Sale por</label><select class="form-select" name="bandeja_id"></select></div>
          <div class="col-sm-6" data-wa><label class="form-label small mb-1">Plantilla aprobada</label><select class="form-select" name="tpl"></select></div>
          <div class="col-12" data-wa><div class="small border rounded p-2 bg-body-tertiary" data-prev></div><div class="row g-2 mt-0" data-vars></div></div>
          <div class="col-12" data-co hidden><label class="form-label small mb-1">Asunto</label><input class="form-control" name="asunto" maxlength="200"></div>
          <div class="col-12" data-co hidden><label class="form-label small mb-1">Mensaje</label><textarea class="form-control" name="mensaje" rows="5" maxlength="8000" placeholder="Hola {nombre}, …"></textarea><div class="form-text">Puedes usar {nombre} y {empresa}.</div></div>
          <div class="col-12"><div class="small fw-semibold mt-2">A quién</div></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Contactos</label><select class="form-select" name="stage"><option value="">Leads y clientes</option><option value="lead">Solo leads</option><option value="cliente">Solo clientes</option></select></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Origen</label><select class="form-select" name="source"><option value="">Cualquiera</option>${op.origenes.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Etiqueta</label><select class="form-select" name="tag"><option value="">Cualquiera</option>${op.etiquetas.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Campaña</label><select class="form-select" name="campaign_id"><option value="">Cualquiera</option>${ks.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Con oportunidad en</label><select class="form-select" name="pipe"><option value="">No filtrar</option>${pp.pipelines.map((p) => `<optgroup label="${esc(p.name)}"><option value="${p.id}|">Cualquier etapa abierta</option>${[...p.stages, ...pp.cierres].map((e) => `<option value="${p.id}|${esc(e.k)}">${esc(e.n)}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Sin contacto hace más de</label><div class="input-group"><input class="form-control" name="dias" type="number" min="0" max="999" placeholder="—"><span class="input-group-text">días</span></div></div>
          <div class="col-12"><div class="alert alert-light border small mb-0" data-cuenta>Calculando…</div></div>
          <div class="col-12 small text-body-secondary" data-wa><i class="bi bi-info-circle me-1"></i>WhatsApp solo deja enviar plantillas aprobadas por Meta, cobra cada mensaje y exige que la persona haya aceptado recibirlos. Quien respondió STOP no lo recibe.</div>
        </div></div>
        <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" data-ok disabled>Crear y enviar</button></div></form>`, { size: 'modal-lg' });
      const f = $('form', d);
      let tpls = [], total = 0, turno = 0;
      const seg = () => { const [pid, etapa] = f.pipe.value.split('|'); return { stage: f.stage.value, source: f.source.value, tag: f.tag.value, campaign_id: Number(f.campaign_id.value) || null, pipeline_id: Number(pid) || null, etapa: etapa || null, sin_contacto_dias: Number(f.dias.value) || null }; };
      const cuenta = async () => {
        const mio = ++turno, box = $('[data-cuenta]', d);
        try { const r = await api(`${B}/difusiones/vista`, { method: 'POST', body: { canal: f.canal.value, segmento: seg() } }); if (mio !== turno) return; total = r.total;
          box.innerHTML = r.total ? `Le llegará a <b>${num(r.total)}</b> ${r.total === 1 ? 'contacto' : 'contactos'}${r.hay_mas ? ` (el máximo por difusión son ${num(op.maximo)})` : ''}: ${r.muestra.map(esc).join(', ')}${r.total > r.muestra.length ? '…' : ''}` : `Ningún contacto de ese grupo tiene ${f.canal.value === 'correo' ? 'correo' : 'teléfono'}.`;
        } catch (x) { if (mio === turno) { total = 0; box.textContent = x.message; } }
        $('[data-ok]', d).disabled = !total;
      };
      const tpl = () => tpls.find((p) => `${p.nombre}|${p.idioma}` === f.tpl.value);
      const previa = () => { const p = tpl(); $('[data-prev]', d).textContent = p ? p.cuerpo : 'Esta bandeja no tiene plantillas aprobadas que se puedan enviar desde aquí.'; $('[data-vars]', d).innerHTML = p ? Array.from({ length: p.variables }, (_, i) => `<div class="col-sm-6"><label class="form-label small mb-1">Variable {{${i + 1}}}</label><input class="form-control" data-v value="${i ? '' : '{nombre}'}" required></div>`).join('') : ''; };
      const plantillas = async () => { f.tpl.innerHTML = '<option value="">Cargando…</option>'; try { tpls = f.canal.value === 'whatsapp' && f.bandeja_id.value ? await waPlantillas(f.bandeja_id.value) : []; } catch (x) { tpls = []; toast(x.message, false); } f.tpl.innerHTML = tpls.map((p) => `<option value="${esc(p.nombre)}|${esc(p.idioma)}">${esc(p.nombre)} (${esc(p.idioma)})</option>`).join(''); previa(); };
      const canal = () => { const co = f.canal.value === 'correo'; $$('[data-wa]', d).forEach((x) => { x.hidden = co; }); $$('[data-co]', d).forEach((x) => { x.hidden = !co; }); f.asunto.required = f.mensaje.required = co;
        f.bandeja_id.innerHTML = bs.filter((b) => b.canal === f.canal.value).map((b) => `<option value="${b.id}">${esc(b.nombre)}</option>`).join(''); plantillas(); cuenta(); };
      f.canal.onchange = canal; f.bandeja_id.onchange = plantillas; f.tpl.onchange = previa;
      ['stage', 'source', 'tag', 'campaign_id', 'pipe'].forEach((k) => { f[k].onchange = cuenta; }); f.dias.oninput = cuenta;
      canal();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const p = tpl();
        if (f.canal.value === 'whatsapp' && !p) return toast('Elige una plantilla aprobada', false);
        if (!(await confirm(`¿Enviar «${f.nombre.value}» a ${num(total)} ${total === 1 ? 'contacto' : 'contactos'}?`))) return;
        try {
          const out = await api(`${B}/difusiones`, { method: 'POST', body: { nombre: f.nombre.value, canal: f.canal.value, bandeja_id: Number(f.bandeja_id.value), plantilla: p?.nombre, idioma: p?.idioma, variables: $$('[data-v]', d).map((x) => x.value), asunto: f.asunto.value, mensaje: f.mensaje.value, segmento: seg() } });
          m.hide(); enviar({ id: out.id, nombre: f.nombre.value });
        } catch (x) { toast(x.message, false); }
      };
    }
    $('[data-new]', el)?.addEventListener('click', () => nueva().catch((x) => toast(x.message, false)));
    el.addEventListener('click', async (e) => {
      const it = e.target.closest('[data-id]'); if (!it) return;
      const d = rows.find((x) => String(x.id) === it.dataset.id);
      if (e.target.closest('[data-go]')) enviar(d);
      else if (e.target.closest('[data-err]')) { const r = await api(`${B}/difusiones/${d.id}`); modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Errores de «${esc(d.nombre)}»</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body"><ul class="list-group">${r.lista_fallidos.map((x) => `<li class="list-group-item small d-flex justify-content-between gap-3"><span>${esc(x.nombre || '')}</span><span class="text-danger text-end">${esc(x.error || '')}</span></li>`).join('')}</ul></div>`); }
      else if (e.target.closest('[data-rm]')) { if (!(await confirm(`¿Borrar la difusión «${d.nombre}»? Los mensajes ya enviados no se retiran.`))) return; try { await api(`${B}/difusiones/${d.id}`, { method: 'DELETE' }); toast('Borrada'); load(); } catch (x) { toast(x.message, false); } }
    });
    load().catch((x) => { $('[data-l]', el).innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; });
  }

  // Oportunidades: pipelines con etapas propias, tablero por etapa con sus totales y la ficha de seguimiento de cada oportunidad
  const PRESETS = {
    llamada: ['Ventas con llamada', ['Nuevo lead', 'Contactado', 'Calificado', 'Llamada agendada', 'Asistió', 'No asistió', 'Seguimiento']],
    directa: ['Venta directa', ['Nuevo', 'Contactado', 'Propuesta enviada', 'Negociación']],
    servicio: ['Servicios con cotización', ['Nuevo', 'Diagnóstico', 'Cotización enviada', 'Seguimiento', 'Por firmar']],
  };
  async function pipeline(el) {
    if (!document.getElementById('mk-pipe-css')) document.head.insertAdjacentHTML('beforeend', `<style id="mk-pipe-css">
      .mk-kh{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:.9rem;font-weight:700;margin:0}.mk-kh .badge{font-weight:600}
      .mk-kt{font-size:.8rem;color:var(--bs-secondary-color);margin:0 0 8px}.mk-col-ok{border-top:3px solid var(--bs-success)}.mk-col-no{border-top:3px solid var(--bs-danger)}.mk-col{border-top:3px solid var(--dw-p,var(--bs-primary))}
      .mk-prox{font-size:.8rem;color:var(--bs-secondary-color)}.mk-prox.late{color:var(--bs-danger);font-weight:600}.mk-prox.hoy{color:var(--bs-success);font-weight:600}
      .mk-res{display:flex;flex-wrap:wrap;gap:6px 16px}.mk-res b{font-weight:700}.mk-vacio{font-size:.8rem;color:var(--bs-secondary-color);text-align:center;padding:18px 4px}
      .mk-et{display:flex;gap:6px;align-items:center;margin-bottom:6px}.mk-au{border-left:3px solid var(--bs-warning);margin:0 0 10px 12px;padding:6px 0 6px 12px}.mk-ct{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--dw-activo-bg,var(--bs-tertiary-bg));border-radius:12px;padding:8px 12px}
      .dw-kcol.sobre{outline:2px dashed var(--dw-p,var(--bs-primary));outline-offset:-2px}</style>`);
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-2">
        <select class="form-select w-auto" data-pipe aria-label="Pipeline"></select>
        <select class="form-select w-auto" data-per aria-label="Periodo"><option value="">Todo el tiempo</option><option value="mes">Creadas este mes</option><option value="90">Últimos 90 días</option></select>
        <input class="form-control" style="max-width:230px" type="search" placeholder="Buscar oportunidad…" data-q aria-label="Buscar oportunidad">
        <span class="ms-auto d-flex flex-wrap gap-2"><button class="btn btn-outline-secondary" data-inf><i class="bi bi-bar-chart-line me-1"></i>Informe</button>${me.canManage && !RO ? '<button class="btn btn-outline-secondary" data-pipes><i class="bi bi-sliders me-1"></i>Pipelines y etapas</button>' : ''}${RO ? '' : '<button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nueva oportunidad</button>'}</span>
      </div><div class="mk-res small mb-2" data-res></div><div class="dw-kanban" data-k></div>`;
    const guardado = (() => { try { return Number(localStorage.getItem('dw_mk_pipe')) || 0; } catch { return 0; } })();
    let rows = [], ps = [], cierres = [], cs = [], ks = [], pid = guardado;
    const hoy = C.todayCo();
    const P = () => ps.find((p) => p.id === pid) || ps[0];
    const deP = (p, r) => r.pipeline_id === p.id || (p.principal && r.pipeline_id == null);
    const etapaDe = (p, r) => ([...p.stages, ...cierres].some((e) => e.k === r.stage) ? r.stage : p.stages[0].k);
    const cerrada = (r) => r.stage === 'ganado' || r.stage === 'perdido';
    const ct = (id) => cs.find((x) => x.id === id);
    const dias = (r) => Math.max(0, Math.floor((Date.now() - (r.stage_at || r.updated_at || r.created_at)) / 86400000));
    const prox = (r) => (!r.next_date || cerrada(r) ? '' : `<span class="mk-prox ${r.next_date < hoy ? 'late' : r.next_date === hoy ? 'hoy' : ''}"><i class="bi bi-alarm"></i> ${r.next_date === hoy ? 'Hoy' : day(r.next_date)}${r.next_time ? ` · ${esc(r.next_time)}` : ''}${r.next_note ? ` · ${esc(r.next_note)}` : ''}</span>`);

    function pintar() {
      const p = P(); if (!p) return;
      const q = $('[data-q]', el).value.trim().toLowerCase(), per = $('[data-per]', el).value;
      const desde = per === 'mes' ? Date.parse(hoy.slice(0, 7) + '-01T05:00:00Z') : per === '90' ? Date.now() - 90 * 86400000 : 0;
      const mias = rows.filter((r) => deP(p, r));
      const vis = mias.filter((r) => r.created_at >= desde && (!q || [r.title, r.notes, r.next_note, ct(r.contact_id)?.name, ct(r.contact_id)?.company].some((t) => String(t || '').toLowerCase().includes(q))));
      const abiertas = mias.filter((r) => !cerrada(r)), mes = Date.parse(hoy.slice(0, 7) + '-01T05:00:00Z');
      const ganadas = mias.filter((r) => r.stage === 'ganado' && (r.closed_at || 0) >= mes), venc = abiertas.filter((r) => r.next_date && r.next_date < hoy).length, paraHoy = abiertas.filter((r) => r.next_date === hoy).length, sin = abiertas.filter((r) => !r.next_date).length;
      $('[data-res]', el).innerHTML = `<span>En juego <b>${money(abiertas.reduce((a, r) => a + r.value, 0))}</b> · ${num(abiertas.length)} abiertas</span><span>Ganado este mes <b>${money(ganadas.reduce((a, r) => a + r.value, 0))}</b> · ${num(ganadas.length)}</span>
        ${venc ? `<span class="text-danger"><i class="bi bi-alarm"></i> <b>${num(venc)}</b> con seguimiento vencido</span>` : ''}${paraHoy ? `<span class="text-success"><b>${num(paraHoy)}</b> para hoy</span>` : ''}${sin ? `<span class="text-body-secondary"><b>${num(sin)}</b> sin próximo paso</span>` : ''}`;
      $('[data-k]', el).innerHTML = [...p.stages.map((e) => ({ ...e, cls: 'mk-col' })), { ...cierres[0], cls: 'mk-col-ok' }, { ...cierres[1], cls: 'mk-col-no' }].map((e) => {
        const list = vis.filter((r) => etapaDe(p, r) === e.k);
        return `<div class="dw-kcol ${e.cls}" data-stage="${esc(e.k)}"><div class="mk-kh"><span>${esc(e.n)}</span><span class="badge rounded-pill text-bg-secondary">${num(list.length)}</span></div><p class="mk-kt">${money(list.reduce((a, r) => a + r.value, 0))}</p>
          ${list.map((r) => { const k = ct(r.contact_id), d = dias(r); return `<div class="dw-kcard" draggable="${!RO}" data-id="${r.id}"><b>${esc(r.title)}</b>${k ? `<span class="text-body-secondary"><i class="bi bi-person"></i> ${esc(k.name)}${k.company && k.company !== k.name ? ` · ${esc(k.company)}` : ''}</span>` : ''}<span class="fw-semibold">${money(r.value)}</span>${prox(r)}${!cerrada(r) && d >= 7 ? `<span class="mk-prox">${num(d)} días en esta etapa</span>` : ''}</div>`; }).join('') || '<div class="mk-vacio"><i class="bi bi-inbox d-block fs-5"></i>Sin oportunidades</div>'}</div>`;
      }).join('');
    }
    async function load() {
      const [pp, d, cc, kk] = await Promise.all([api(`${B}/pipelines`), api(`${B}/deals?limit=1000`), api(`${B}/contacts?limit=1000`), C.refs(B, 'campaigns')]);
      ps = pp.pipelines; cierres = pp.cierres; rows = d.rows; cs = cc.rows; ks = kk;
      if (!ps.some((p) => p.id === pid)) pid = ps[0]?.id;
      const sel = $('[data-pipe]', el);
      sel.innerHTML = ps.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)} · ${num(p.abiertas)}</option>`).join('');
      sel.hidden = ps.length < 2;
      pintar();
    }

    // Ficha de la oportunidad: contacto a un toque, etapa, valor, próximo seguimiento y notas
    function ficha(row) {
      if (RO) return;
      const v = row || { pipeline_id: P().id, stage: P().stages[0].k, value: 0 };
      const p0 = ps.find((p) => p.id === v.pipeline_id) || (row ? ps[0] : P());
      const { el: d, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${row ? 'Oportunidad' : 'Nueva oportunidad'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><div class="mk-ct mb-3" data-ct hidden></div><div class="row g-2">
          <div class="col-12"><label class="form-label small mb-1">Oportunidad</label><input class="form-control" name="title" required maxlength="300" value="${esc(v.title || '')}" placeholder="Qué le vas a vender"></div>
          <div class="col-sm-7"><label class="form-label small mb-1">Cliente o lead</label><select class="form-select" name="contact_id"><option value="">—</option>${cs.map((x) => `<option value="${x.id}" ${x.id === v.contact_id ? 'selected' : ''}>${esc(x.name)}${x.company && x.company !== x.name ? ` · ${esc(x.company)}` : ''}</option>`).join('')}</select></div>
          <div class="col-sm-5"><label class="form-label small mb-1">Valor (COP)</label><input class="form-control" name="value" type="number" min="0" step="1" inputmode="numeric" value="${Number(v.value) || 0}"></div>
          <div class="col-sm-6" ${ps.length < 2 ? 'hidden' : ''}><label class="form-label small mb-1">Pipeline</label><select class="form-select" name="pipeline_id">${ps.map((p) => `<option value="${p.id}" ${p.id === p0.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
          <div class="${ps.length < 2 ? 'col-12' : 'col-sm-6'}"><label class="form-label small mb-1">Etapa</label><select class="form-select" name="stage"></select></div>
          <div class="col-12" data-mot hidden><label class="form-label small mb-1">Por qué se perdió</label><input class="form-control" name="lost_reason" maxlength="300" list="mk-mot" value="${esc(v.lost_reason || '')}" placeholder="Precio, no respondió, eligió a otro…"><datalist id="mk-mot"><option>Precio</option><option>No respondió</option><option>Eligió a otro</option><option>No era el momento</option><option>No califica</option><option>No asistió</option></datalist></div>
          <div class="col-12"><div class="small fw-semibold mt-2">Próximo seguimiento</div></div>
          <div class="col-7 col-sm-4"><label class="form-label small mb-1">Fecha</label><input class="form-control" name="next_date" type="date" value="${esc(v.next_date || '')}"></div>
          <div class="col-5 col-sm-3"><label class="form-label small mb-1">Hora</label><input class="form-control" name="next_time" type="time" value="${esc(v.next_time || '')}"></div>
          <div class="col-sm-5"><label class="form-label small mb-1">Qué sigue</label><input class="form-control" name="next_note" maxlength="300" list="mk-sig" value="${esc(v.next_note || '')}" placeholder="Llamada, reunión, enviar propuesta…"><datalist id="mk-sig"><option>Llamada</option><option>Reunión</option><option>Enviar propuesta</option><option>Escribir por WhatsApp</option><option>Confirmar pago</option></datalist></div>
          <div class="col-sm-6"><label class="form-label small mb-1">Cierre esperado</label><input class="form-control" name="expected_close" type="date" value="${esc(v.expected_close || '')}"></div>
          <div class="col-sm-6"><label class="form-label small mb-1">Campaña</label><select class="form-select" name="campaign_id"><option value="">—</option>${ks.map((x) => `<option value="${x.id}" ${x.id === v.campaign_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="col-12"><label class="form-label small mb-1">Notas</label><textarea class="form-control" name="notes" rows="3" maxlength="5000">${esc(v.notes || '')}</textarea></div>
          ${row ? `<div class="col-12 small text-body-secondary">Creada el ${day(new Date(row.created_at).toISOString().slice(0, 10))}${cerrada(row) ? '' : ` · ${num(dias(row))} días en esta etapa`}</div>` : ''}</div></div>
        <div class="modal-footer border-0 pt-0">${row && me.canManage ? '<button type="button" class="btn btn-outline-danger me-auto" data-del aria-label="Borrar"><i class="bi bi-trash"></i></button>' : ''}
          ${row && !cerrada(row) ? '<button type="button" class="btn btn-outline-success" data-fin="ganado"><i class="bi bi-trophy me-1"></i>Ganada</button><button type="button" class="btn btn-outline-secondary" data-fin="perdido">Perdida</button>' : ''}
          <button class="btn btn-primary">Guardar</button></div></form>`, { size: 'modal-lg' });
      const f = $('form', d);
      const etapas = () => { const p = ps.find((x) => String(x.id) === f.pipeline_id.value) || p0, act = f.stage.value || (row ? etapaDe(p0, row) : v.stage); f.stage.innerHTML = [...p.stages, ...cierres].map((e) => `<option value="${esc(e.k)}">${esc(e.n)}</option>`).join(''); f.stage.value = [...p.stages, ...cierres].some((e) => e.k === act) ? act : p.stages[0].k; };
      const contacto = () => {
        const k = ct(Number(f.contact_id.value)), box = $('[data-ct]', d);
        box.hidden = !k; if (!k) return;
        const tel = (k.phone || '').replace(/\D/g, ''), wa = tel.length === 10 && tel.startsWith('3') ? '57' + tel : tel;
        box.innerHTML = `<span class="me-auto"><b>${esc(k.name)}</b>${k.company && k.company !== k.name ? ` · ${esc(k.company)}` : ''}<span class="d-block small text-body-secondary">${[k.phone, k.email].filter(Boolean).map(esc).join(' · ') || 'Sin teléfono ni correo'}</span></span>
          ${tel ? `<a class="btn btn-sm btn-outline-secondary" href="tel:${esc(tel)}" title="Llamar" aria-label="Llamar"><i class="bi bi-telephone"></i></a><a class="btn btn-sm btn-outline-success" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}" title="WhatsApp" aria-label="WhatsApp"><i class="bi bi-whatsapp"></i></a>` : ''}
          ${k.email ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${esc(k.email)}" title="Correo" aria-label="Correo"><i class="bi bi-envelope"></i></a>` : ''}`;
      };
      const motivo = () => { $('[data-mot]', d).hidden = f.stage.value !== 'perdido'; };
      etapas(); contacto(); motivo();
      f.pipeline_id.onchange = () => { etapas(); motivo(); }; f.contact_id.onchange = contacto; f.stage.onchange = motivo;
      const guardar = async (extra = {}) => {
        const body = { title: f.title.value, contact_id: Number(f.contact_id.value) || null, value: Number(f.value.value) || 0, pipeline_id: Number(f.pipeline_id.value) || null, stage: f.stage.value, next_date: f.next_date.value || null, next_time: f.next_time.value || null,
          next_note: f.next_note.value, lost_reason: f.lost_reason.value, expected_close: f.expected_close.value || null, campaign_id: Number(f.campaign_id.value) || null, notes: f.notes.value, ...extra };
        try { await api(row ? `${B}/deals/${row.id}` : `${B}/deals`, { method: row ? 'PATCH' : 'POST', body }); C.dropRefs(B, 'deals'); m.hide(); toast(extra.stage === 'ganado' ? '¡Ganada!' : 'Guardado'); load(); } catch (x) { toast(x.message, false); }
      };
      f.onsubmit = (e) => { e.preventDefault(); guardar(); };
      $$('[data-fin]', d).forEach((b) => { b.onclick = () => {
        if (!f.reportValidity()) return;
        // Perdida: primero pide el motivo (sirve para el informe); con el motivo escrito, guarda
        if (b.dataset.fin === 'perdido' && !f.lost_reason.value.trim()) { f.stage.value = 'perdido'; motivo(); f.lost_reason.focus(); return toast('Escribe por qué se perdió y guarda'); }
        guardar({ stage: b.dataset.fin });
      }; });
      const del = $('[data-del]', d);
      if (del) del.onclick = async () => { if (!(await confirm(`¿Borrar la oportunidad «${row.title}»?`))) return; try { await api(`${B}/deals/${row.id}`, { method: 'DELETE' }); C.dropRefs(B, 'deals'); m.hide(); toast('Borrada'); load(); } catch (x) { toast(x.message, false); } };
    }

    // Informe del pipeline: conversión entre etapas, días en cada una, dónde se pierden y por qué
    function informe() {
      const p = P(); if (!p) return;
      const { el: d } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Informe de «${esc(p.name)}»</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><select class="form-select w-auto mb-3" data-rango aria-label="Periodo"><option value="">Todas las oportunidades</option><option value="30">Creadas en los últimos 30 días</option><option value="90">Creadas en los últimos 90 días</option><option value="365">Creadas en el último año</option></select><div data-i><div class="dv-sk"></div><div class="dv-sk"></div></div></div>`, { size: 'modal-lg' });
      const pinta = async () => {
        const dias = Number($('[data-rango]', d).value), desde = dias ? new Date(Date.now() - 5 * 3600000 - dias * 86400000).toISOString().slice(0, 10) : '';
        let r; try { r = await api(`${B}/pipelines/${p.id}/informe${desde ? `?from=${desde}` : ''}`); } catch (x) { $('[data-i]', d).innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
        if (!r.total) { $('[data-i]', d).innerHTML = '<p class="text-body-secondary text-center py-4">No hay oportunidades en ese periodo.</p>'; return; }
        const peor = r.etapas.filter((e) => e.llegaron >= 3 && e.avanzan_pct != null).sort((a, b) => a.avanzan_pct - b.avanzan_pct)[0];
        const dato = (t, v, s) => `<div class="col-6 col-md-3"><div class="border rounded p-2 h-100"><div class="small text-body-secondary">${t}</div><div class="fw-bold">${v}</div><div class="small text-body-secondary">${s || ''}</div></div></div>`;
        $('[data-i]', d).innerHTML = `<div class="row g-2 mb-3">${dato('Oportunidades', num(r.total), `${num(r.total - r.ganadas.n - r.perdidas.n)} abiertas`)}${dato('Ganadas', num(r.ganadas.n), money(r.ganadas.valor))}${dato('Tasa de cierre', r.tasa_cierre == null ? '—' : pct(r.tasa_cierre), `${num(r.perdidas.n)} perdidas`)}${dato('Días para ganar', r.ciclo_dias == null ? '—' : num(r.ciclo_dias), 'en promedio')}</div>
          ${peor && peor.avanzan_pct < 100 ? `<div class="alert alert-warning small py-2"><i class="bi bi-exclamation-triangle me-1"></i>Donde más se traba: <b>${esc(peor.etapa)}</b>. Solo ${pct(peor.avanzan_pct)} de las que llegan ahí avanza.</div>` : ''}
          <div class="table-responsive"><table class="table table-sm align-middle small"><thead><tr><th>Etapa</th><th class="text-end">Llegaron</th><th style="min-width:130px">Avanzan</th><th class="text-end">Días ahí</th><th class="text-end">Abiertas</th><th class="text-end">Se perdieron aquí</th></tr></thead><tbody>
          ${r.etapas.map((e) => `<tr><td>${esc(e.etapa)}</td><td class="text-end">${num(e.llegaron)}</td><td>${e.avanzan_pct == null ? '—' : `<div class="d-flex align-items-center gap-2"><div class="progress flex-grow-1" style="height:6px"><div class="progress-bar" style="width:${Math.min(100, e.avanzan_pct)}%"></div></div><span style="width:38px" class="text-end">${pct(e.avanzan_pct)}</span></div>`}</td><td class="text-end">${e.dias_promedio == null ? '—' : num(e.dias_promedio)}</td><td class="text-end">${num(e.abiertas)}${e.abiertas ? `<span class="text-body-secondary"> · ${money(e.valor_abierto)}</span>` : ''}</td><td class="text-end ${e.perdidas_aqui ? 'text-danger' : ''}">${num(e.perdidas_aqui)}</td></tr>`).join('')}</tbody></table></div>
          <div class="small fw-semibold mb-1">Por qué se pierden</div>${r.motivos.length ? r.motivos.map((m) => `<div class="d-flex align-items-center gap-2 small mb-1"><span style="width:150px" class="text-truncate">${esc(m.motivo)}</span><div class="progress flex-grow-1" style="height:6px"><div class="progress-bar bg-danger" style="width:${(m.n / r.motivos[0].n * 100).toFixed(0)}%"></div></div><b style="width:26px" class="text-end">${num(m.n)}</b><span class="text-body-secondary text-end" style="width:100px">${money(m.valor)}</span></div>`).join('') : '<p class="small text-body-secondary mb-0">Aún no hay oportunidades perdidas.</p>'}
          <p class="small text-body-secondary mt-3 mb-0">«Avanzan» es la parte de las que llegaron a la etapa que pasó a la siguiente (o se ganó). Los días se miden desde que existe este informe; lo anterior cuenta solo hasta la etapa donde quedó.</p>`;
      };
      $('[data-rango]', d).onchange = pinta; pinta();
    }

    // Pipelines y etapas (propietario o administrador): una sola ventana que cambia entre la lista y el editor
    function gestionar() {
      const { el: d } = modal('<div data-g></div>', { size: 'modal-lg' });
      const g = $('[data-g]', d), cab = (t) => `<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${t}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>`;
      d.addEventListener('hidden.bs.modal', load);
      async function lista() {
        ps = (await api(`${B}/pipelines`)).pipelines;
        g.innerHTML = `${cab('Pipelines y etapas')}<div class="modal-body"><p class="small text-body-secondary">Cada pipeline es un camino de venta con sus propias etapas. Ganado y Perdido cierran en todos.</p>
          <div class="list-group">${ps.map((p) => `<div class="list-group-item d-flex flex-wrap align-items-center gap-2"><span class="me-auto"><b>${esc(p.name)}</b>${p.principal ? ' <span class="badge text-bg-light border">Principal</span>' : ''}<span class="d-block small text-body-secondary">${p.stages.map((e) => esc(e.n)).join(' → ')}</span><span class="d-block small text-body-secondary">${num(p.abiertas)} abiertas · ${money(p.valor_abierto)}${Object.keys(p.autos || {}).length ? ` · <i class="bi bi-lightning-charge"></i> ${num(Object.values(p.autos).reduce((a, l) => a + l.length, 0))} disparadores` : ''}</span></span>
            <button class="btn btn-sm btn-outline-primary" data-ed="${p.id}"><i class="bi bi-pencil me-1"></i>Editar</button>${p.principal ? '' : `<button class="btn btn-sm btn-outline-danger" data-rm="${p.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>`}</div>`).join('')}</div></div>
          <div class="modal-footer border-0 pt-0"><button class="btn btn-primary" data-ed="0"><i class="bi bi-plus-lg me-1"></i>Crear pipeline</button></div>`;
      }
      async function editor(p) {
        const copia = (l) => (l || []).map((a) => ({ ...a, variables: [...(a.variables || [])] }));
        let et = p ? p.stages.map((e) => ({ ...e, autos: copia(p.autos?.[e.k]) })) : PRESETS.llamada[1].map((n) => ({ n, autos: [] }));
        const fin = { ganado: copia(p?.autos?.ganado), perdido: copia(p?.autos?.perdido) };
        const was = (await waBandejas()).filter((b) => b.canal === 'whatsapp'), T = {};
        let abierto = null;   // etapa con sus disparadores a la vista: su posición, 'ganado' o 'perdido'
        g.innerHTML = `${cab(p ? 'Editar pipeline' : 'Crear pipeline')}<form><div class="modal-body">
          <label class="form-label small mb-1">Nombre del pipeline</label><input class="form-control mb-3" name="name" required maxlength="60" value="${esc(p?.name || '')}" placeholder="Mi nuevo pipeline">
          ${p ? '' : `<label class="form-label small mb-1">Empezar con</label><select class="form-select mb-3" name="pre">${Object.entries(PRESETS).map(([k, [l, e]]) => `<option value="${k}">${esc(l)} (${e.length + 1} etapas)</option>`).join('')}</select>`}
          <div class="small fw-semibold mb-1">Etapas</div><p class="small text-body-secondary mb-2">El rayo <i class="bi bi-lightning-charge"></i> define qué pasa solo cuando una oportunidad entra a la etapa: crear una tarea, dejar el próximo seguimiento o enviar un WhatsApp.</p><div data-et></div>
          <button type="button" class="btn btn-sm btn-outline-primary" data-add><i class="bi bi-plus-lg me-1"></i>Agregar etapa</button>
          <p class="small text-body-secondary mt-3 mb-0">${p ? 'Si quitas una etapa, sus oportunidades pasan a la primera.' : ''}</p></div>
          <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-back>Volver</button><button class="btn btn-primary">${p ? 'Guardar' : 'Crear pipeline'}</button></div></form>`;
        const f = $('form', g), box = $('[data-et]', g);
        const listaDe = (id) => (id === 'ganado' || id === 'perdido' ? fin[id] : et[id]?.autos);
        const pedirTpl = (id) => { if (!id || id in T) return; T[id] = null; waPlantillas(id).then((r) => { T[id] = r; }).catch((x) => { T[id] = []; toast(x.message, false); }).finally(() => { leer(); filas(); }); };
        const rayo = (id, n) => `<button type="button" class="btn btn-sm ${n ? 'btn-warning' : 'btn-light'}" data-au="${id}" title="Qué pasa al entrar a esta etapa" aria-label="Disparadores"><i class="bi bi-lightning-charge"></i>${n || ''}</button>`;
        const accion = (a, j) => {
          const quitar = `<button type="button" class="btn btn-sm btn-outline-danger" data-rmau="${j}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button>`, dias = `<input class="form-control form-control-sm" type="number" min="0" max="365" data-f="dias" value="${Number(a.dias) || 0}" style="width:70px" aria-label="Días">`;
          if (a.tipo === 'tarea') return `<div class="mk-et" data-j="${j}"><i class="bi bi-check2-square"></i><input class="form-control form-control-sm" data-f="texto" maxlength="200" value="${esc(a.texto || '')}" placeholder="Llamar a {nombre}"><span class="small text-nowrap">en</span>${dias}<span class="small">días</span>${quitar}</div>`;
          if (a.tipo === 'seguimiento') return `<div class="mk-et" data-j="${j}"><i class="bi bi-alarm"></i><span class="small text-nowrap">Seguimiento en</span>${dias}<span class="small">días</span><input class="form-control form-control-sm" data-f="nota" maxlength="100" value="${esc(a.nota || '')}" placeholder="Qué sigue: llamada, reunión…">${quitar}</div>`;
          pedirTpl(a.bandeja_id);
          const tp = T[a.bandeja_id] || [], sel = tp.find((x) => x.nombre === a.plantilla && x.idioma === a.idioma);
          return `<div class="mk-et flex-wrap" data-j="${j}"><i class="bi bi-whatsapp"></i><select class="form-select form-select-sm w-auto" data-f="bandeja_id">${was.map((b) => `<option value="${b.id}" ${b.id === a.bandeja_id ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select>
            <select class="form-select form-select-sm w-auto" data-f="tpl">${T[a.bandeja_id] ? '<option value="">Elige la plantilla…</option>' : '<option value="">Cargando…</option>'}${tp.map((x) => `<option value="${esc(x.nombre)}|${esc(x.idioma)}" ${x === sel ? 'selected' : ''}>${esc(x.nombre)} (${esc(x.idioma)})</option>`).join('')}${a.plantilla && !sel ? `<option value="${esc(a.plantilla)}|${esc(a.idioma)}" selected>${esc(a.plantilla)}</option>` : ''}</select>
            ${Array.from({ length: sel ? sel.variables : (a.variables || []).length }, (_, i) => `<input class="form-control form-control-sm" style="width:130px" data-v value="${esc(a.variables?.[i] ?? (i ? '' : '{nombre}'))}" placeholder="Variable {{${i + 1}}}" aria-label="Variable ${i + 1}">`).join('')}${quitar}</div>`;
        };
        const panel = (id) => { const l = listaDe(id); return abierto !== id ? '' : `<div class="mk-au"><div class="small text-body-secondary mb-2">Al entrar a esta etapa:</div>${l.map(accion).join('') || '<div class="small text-body-secondary mb-2">Nada todavía.</div>'}
          <div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-addau="tarea"><i class="bi bi-plus-lg"></i> Tarea</button><button type="button" class="btn btn-sm btn-outline-secondary" data-addau="seguimiento"><i class="bi bi-plus-lg"></i> Próximo seguimiento</button><button type="button" class="btn btn-sm btn-outline-secondary" data-addau="plantilla" ${was.length ? '' : 'disabled title="Conecta WhatsApp en Mensajes"'}><i class="bi bi-plus-lg"></i> WhatsApp</button></div></div>`; };
        function leer() {
          $$('[data-n]', box).forEach((i, n) => { et[n].n = i.value; });
          const l = abierto === null ? null : listaDe(abierto);
          if (l) $$('[data-j]', box).forEach((row) => {
            const a = l[+row.dataset.j]; if (!a) return;
            const v = (k) => $(`[data-f="${k}"]`, row)?.value;
            if (a.tipo !== 'plantilla') { a.dias = Number(v('dias')) || 0; if (a.tipo === 'tarea') a.texto = v('texto'); else a.nota = v('nota'); return; }
            a.bandeja_id = Number(v('bandeja_id')) || a.bandeja_id;
            if (v('tpl')) [a.plantilla, a.idioma] = v('tpl').split('|');
            a.variables = $$('[data-v]', row).map((x) => x.value);
          });
        }
        function filas() {
          box.innerHTML = et.map((e, i) => `<div class="mk-et"><button type="button" class="btn btn-sm btn-light" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Subir"><i class="bi bi-arrow-up"></i></button><button type="button" class="btn btn-sm btn-light" data-dn="${i}" ${i < et.length - 1 ? '' : 'disabled'} aria-label="Bajar"><i class="bi bi-arrow-down"></i></button><input class="form-control" data-n maxlength="40" value="${esc(e.n || '')}" placeholder="Nombre de la etapa" aria-label="Etapa ${i + 1}">${rayo(i, e.autos.length)}<button type="button" class="btn btn-sm btn-outline-danger" data-x="${i}" ${et.length > 1 ? '' : 'disabled'} aria-label="Quitar"><i class="bi bi-trash"></i></button></div>${panel(i)}`).join('')
            + ['ganado', 'perdido'].map((k) => `<div class="mk-et"><span class="form-control bg-body-tertiary text-body-secondary">${k === 'ganado' ? 'Ganado' : 'Perdido'} <span class="small">· siempre al final</span></span>${rayo(k, fin[k].length)}</div>${panel(k)}`).join('');
        }
        filas();
        if (f.pre) f.pre.onchange = () => { et = PRESETS[f.pre.value][1].map((n) => ({ n, autos: [] })); abierto = null; filas(); };
        box.onchange = (e) => { if (e.target.matches('[data-f="bandeja_id"], [data-f="tpl"]')) { leer(); const row = e.target.closest('[data-j]'), a = listaDe(abierto)[+row.dataset.j]; if (e.target.dataset.f === 'bandeja_id') { a.plantilla = a.idioma = ''; a.variables = []; } else { const tp = (T[a.bandeja_id] || []).find((x) => x.nombre === a.plantilla && x.idioma === a.idioma); a.variables = Array.from({ length: tp?.variables || 0 }, (_, i) => a.variables[i] ?? (i ? '' : '{nombre}')); } filas(); } };
        box.onclick = (e) => {
          const b = e.target.closest('button'); if (!b) return; leer();
          const d = b.dataset, mover = (i, j) => { [et[i], et[j]] = [et[j], et[i]]; abierto = null; };
          if (d.up) mover(+d.up, +d.up - 1); else if (d.dn) mover(+d.dn, +d.dn + 1); else if (d.x) { et.splice(+d.x, 1); abierto = null; }
          else if (d.au) { const id = d.au === 'ganado' || d.au === 'perdido' ? d.au : +d.au; abierto = abierto === id ? null : id; }
          else if (d.addau) { const l = listaDe(abierto); if (l.length >= 5) return toast('Máximo 5 por etapa', false); l.push(d.addau === 'tarea' ? { tipo: 'tarea', texto: '', dias: 0 } : d.addau === 'seguimiento' ? { tipo: 'seguimiento', dias: 1, nota: '' } : { tipo: 'plantilla', bandeja_id: was[0].id, plantilla: '', idioma: '', variables: [] }); }
          else if (d.rmau) listaDe(abierto).splice(+d.rmau, 1);
          filas();
        };
        $('[data-add]', g).onclick = () => { leer(); if (et.length >= 15) return toast('Máximo 15 etapas', false); et.push({ n: '', autos: [] }); filas(); $$('[data-n]', box).pop().focus(); };
        $('[data-back]', g).onclick = lista;
        f.onsubmit = async (e) => {
          e.preventDefault(); leer();
          const stages = et.filter((x) => String(x.n || '').trim());
          if (!stages.length) return toast('Agrega al menos una etapa', false);
          if ([...stages.flatMap((x) => x.autos), ...fin.ganado, ...fin.perdido].some((a) => (a.tipo === 'tarea' && !String(a.texto || '').trim()) || (a.tipo === 'plantilla' && !a.plantilla))) return toast('Hay un disparador sin terminar: escribe la tarea o elige la plantilla', false);
          const body = { name: f.name.value, stages: stages.map(({ k, n }) => ({ k, n })), autos: { ...Object.fromEntries(stages.filter((x) => x.k).map((x) => [x.k, x.autos])), ...fin }, autos_nuevas: Object.fromEntries(stages.map((x, i) => [i, x]).filter(([, x]) => !x.k && x.autos.length).map(([i, x]) => [i, x.autos])) };
          try { const out = await api(p ? `${B}/pipelines/${p.id}` : `${B}/pipelines`, { method: p ? 'PATCH' : 'POST', body }); if (!p) { pid = out.id; try { localStorage.setItem('dw_mk_pipe', pid); } catch {} } toast(p ? 'Guardado' : 'Pipeline creado'); lista(); } catch (x) { toast(x.message, false); }
        };
      }
      g.addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-ed]'), rm = e.target.closest('[data-rm]');
        if (ed) editor(ps.find((p) => String(p.id) === ed.dataset.ed) || null).catch((x) => toast(x.message, false));
        if (rm) { const p = ps.find((x) => String(x.id) === rm.dataset.rm); if (!(await confirm(`¿Borrar el pipeline «${p.name}»?`))) return; try { await api(`${B}/pipelines/${p.id}`, { method: 'DELETE' }); toast('Borrado'); lista(); } catch (x) { toast(x.message, false); } }
      });
      lista();
    }

    $('[data-new]', el)?.addEventListener('click', () => ficha(null));
    $('[data-pipes]', el)?.addEventListener('click', gestionar);
    $('[data-inf]', el).addEventListener('click', informe);
    $('[data-pipe]', el).onchange = (e) => { pid = Number(e.target.value); try { localStorage.setItem('dw_mk_pipe', pid); } catch {} pintar(); };
    $('[data-per]', el).onchange = pintar; $('[data-q]', el).oninput = pintar;
    el.addEventListener('click', (e) => { const c = e.target.closest('.dw-kcard'); if (c) ficha(rows.find((r) => String(r.id) === c.dataset.id)); });
    el.addEventListener('dragstart', (e) => { const c = e.target.closest('.dw-kcard'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
    el.addEventListener('dragover', (e) => { const col = e.target.closest('.dw-kcol'); if (!col) return; e.preventDefault(); $$('.dw-kcol.sobre', el).forEach((x) => x !== col && x.classList.remove('sobre')); col.classList.add('sobre'); });
    el.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) $$('.dw-kcol.sobre', el).forEach((x) => x.classList.remove('sobre')); });
    el.addEventListener('drop', async (e) => {
      const col = e.target.closest('.dw-kcol'); if (!col) return;
      e.preventDefault(); col.classList.remove('sobre');
      const r = rows.find((x) => String(x.id) === e.dataTransfer.getData('text/plain'));
      if (!r || etapaDe(P(), r) === col.dataset.stage) return;
      try { await api(`${B}/deals/${r.id}`, { method: 'PATCH', body: { stage: col.dataset.stage, pipeline_id: P().id } }); toast(`Movida a ${[...P().stages, ...cierres].find((x) => x.k === col.dataset.stage)?.n || col.dataset.stage}`); load(); } catch (x) { toast(x.message, false); }
    });
    load().catch((x) => { $('[data-k]', el).innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; });
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
            <div class="small text-body-secondary text-truncate mb-2" title="${esc(l.target)}">Lleva a: ${/^\/c\//.test(l.target) ? `<i class="bi bi-person-vcard me-1"></i>Tarjeta ` : ''}${esc(l.target)}</div>
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
          const tarjetas = await api(`${B}/cards`).then((r) => r.rows).catch(() => []);
          const ultimo = d.links[d.links.length - 1]?.target || '/matricula', esTarjeta = tarjetas.some((t) => ultimo === `/c/${t.slug}`);
          const out = await C.form({ title: `Link para ${label}`, base: B, okText: 'Crear link', values: { tarjeta: esTarjeta ? ultimo : '', target: esTarjeta ? '' : ultimo },
            fields: [...(tarjetas.length ? [{ k: 'tarjeta', label: 'Llevar a una de tus tarjetas (cuenta sus vistas)', type: 'select', full: true, options: [['', '— Otra página —'], ...tarjetas.map((t) => [`/c/${t.slug}`, `Tarjeta · ${t.name} (/c/${t.slug})`])] }] : []),
              { k: 'target', label: 'O escribe a qué página lleva (https://… o /matricula). Los UTM se agregan solos.', full: true }] });
          if (!out) return;
          const destino = out.tarjeta || out.target;
          if (!destino) { toast('Elige una tarjeta o escribe la página', false); return; }
          try {
            const r = await api(`${B}/campaigns/${id}/links`, { method: 'POST', body: { platform: pl.dataset.plat, target: destino } });
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

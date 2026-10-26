// IA: el módulo general de IA del negocio. Chats de clientes (se despliegan en tarjetas, webs y demás), conversaciones, asistente,
// agentes, consumo y conexiones (MCP, claves de API y webhooks). Reemplaza a «Configuración».
// Ver: todo el equipo; configurar: propietario y administrador.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal, table, empty, fecha } = window.App;
  // Secciones de arriba: botones pequeños solo con palabras (igual en todas las apps, sin depender del crud.js de cada una)
  function segBtn(el, items, onPick, initial) {
    if (!document.getElementById('dw-segb-css')) document.head.insertAdjacentHTML('beforeend', `<style id="dw-segb-css">${'.dw-segb{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}.dw-segb .btn{flex:none;white-space:nowrap}.dw-segb .btn.active{background:var(--dw-p);border-color:var(--dw-p);color:#fff}@media(max-width:767.98px){.dw-segb{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.dw-segb::-webkit-scrollbar{display:none}}'}</style>`);
    el.className = 'dw-segb'; el.hidden = false;
    el.innerHTML = items.map(([k, l]) => `<button type="button" class="btn btn-sm btn-outline-secondary ${k === initial ? 'active' : ''}" data-k="${k}">${esc(l)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; el.querySelectorAll('.btn').forEach((x) => x.classList.toggle('active', x === b)); onPick(b.dataset.k); };
  }
  // Diseño de «IA» de Diwilo Admin, igual en todas las apps (sus colores salen del tema de cada app)
  document.body.classList.add('ia-page');
  if (!document.getElementById('ia-admin-css')) document.head.insertAdjacentHTML('beforeend', `<style id="ia-admin-css">
body.ia-page{--hi:var(--bs-emphasis-color);--ink:var(--bs-body-color);--ink2:var(--bs-secondary-color);--ink3:var(--bs-tertiary-color);--lilac:#a78bfa;--violet:#6d28d9;--fill:rgba(var(--bs-emphasis-color-rgb),.05);--hair:inset 0 0 0 1px var(--bs-border-color);--edge:var(--bs-border-color);--line:var(--bs-border-color);--good:#16a34a;--warn:#d97706;--bad:#dc2626;--sky:#0284c7}
.ia-page .dw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ia-page .grow{flex:1}.ia-page .hubbar{gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end}
.ia-page .st{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:12px;white-space:nowrap;box-shadow:inset 0 0 0 1px currentColor}.ia-page .st::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.ia-page .st.ok{color:var(--good)}.ia-page .st.soon{color:var(--warn)}.ia-page .st.bad{color:var(--bad)}.ia-page .st.free{color:var(--ink3)}
.ia-page .ia-caps{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px;line-height:1.5}.ia-page .ia-caps b{color:var(--hi);font-weight:500;white-space:nowrap}.ia-page .ia-caps span{color:var(--ink2)}
.ia-page .agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.ia-page .acard{display:grid;gap:10px;align-content:start}.ia-page .acard.off{opacity:.6}.ia-page .acard b{color:var(--hi);font-weight:500}
.ia-page .aico{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#a855f7,#6d28d9);color:#fff;font-size:19px;flex:none}.ia-page .aitext{margin:0;font-size:12.5px;line-height:1.5;min-height:38px}
.ia-page .tplgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:10px}
.ia-page .tplbtn{display:grid;gap:6px;text-align:left;padding:14px;border-radius:14px;border:0;cursor:pointer;background:var(--fill);color:var(--ink);box-shadow:var(--hair);font-size:13px}.ia-page .tplbtn i{font-size:22px;color:var(--lilac)}.ia-page .tplbtn b{color:var(--hi);font-weight:500}.ia-page .tplbtn span{font-size:12px;color:var(--ink3);line-height:1.45}.ia-page .tplbtn:hover{box-shadow:inset 0 0 0 1px var(--line)}
.ia-page .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;margin-top:6px}.ia-page .tchk{display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:10px;background:var(--fill);font-size:12px;cursor:pointer}.ia-page .tchk b{display:block;color:var(--hi);font-weight:500;text-transform:capitalize}.ia-page .tchk small{color:var(--ink3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ia-page .arun{padding:12px 0;box-shadow:inset 0 -1px 0 var(--edge);display:grid;gap:8px}.ia-page .aout{font-size:13.5px;line-height:1.6;color:var(--ink2)}.ia-page .aacts{display:grid;gap:6px}
.ia-page .aact{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(124,58,237,.08);font-size:13px}.ia-page .aact i{margin-right:6px;color:var(--lilac)}.ia-page .aact>span:first-child{min-width:0;overflow-wrap:anywhere}
.ia-page .kpi .v{font-size:1.5rem;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums;color:var(--hi)}.ia-page .kpi .l{color:var(--ink2);font-size:.85rem;margin-top:2px}
.ia-page .meter{display:inline-block;width:calc(100% - 44px);height:7px;border-radius:9px;background:var(--fill);vertical-align:middle;margin-right:6px;overflow:hidden}.ia-page .meter i{display:block;height:100%;background:var(--good);border-radius:9px}.ia-page .meter.warn i{background:var(--warn)}.ia-page .meter.over i{background:var(--bad)}
.ia-page .ubars{display:flex;align-items:flex-end;gap:3px;height:170px;padding-bottom:18px}.ia-page .ubars>div{flex:1;min-width:0;height:100%;display:flex;flex-direction:column-reverse;position:relative;border-radius:4px 4px 0 0}.ia-page .ubars>div:hover{background:rgba(var(--bs-emphasis-color-rgb),.04)}
.ia-page .ubars i{display:block;background:linear-gradient(180deg,var(--lilac),var(--violet))}.ia-page .ubars b{display:block;background:rgba(var(--bs-emphasis-color-rgb),.55);border-radius:3px 3px 0 0}.ia-page .ubars span{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--ink3)}
.ia-page .legend{display:flex;gap:14px;margin-top:10px;font-size:12px;color:var(--ink3);flex-wrap:wrap}.ia-page .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}.ia-page .legend .ba{background:linear-gradient(180deg,var(--lilac),var(--violet))}.ia-page .legend .bb{background:rgba(var(--bs-emphasis-color-rgb),.55)}
.ia-page .dw-field{display:grid;gap:5px;font-size:.8rem;color:var(--bs-secondary-color);margin-bottom:10px}
</style>`);
  const C = window.App.Crud;
  const B = '/api/ai', M = '/api/marca';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CAN = me.canManage && !me.business.readOnly;
  // «Modelo de IA» (qué IA responde en TODAS las apps) solo existe en Diwilo Admin: el negocio de Diwilo dentro del panel
  const ES_DIWILO = me.app?.id === 'diwilo' && me.business?.id === 'diwilo' && me.canManage;
  const VIEWS = [['agentes', 'Agentes', 'bi-lightning-charge'], ['asistente', 'IA Diwilo', 'bi-stars'], ['consumo', 'Consumo', 'bi-speedometer2'], ['chats', 'Chats y conversaciones', 'bi-chat-dots'],
    ['conexiones', 'Conexiones y API', 'bi-plug'], ...(ES_DIWILO ? [['modelo', 'Modelo de IA', 'bi-cpu']] : [])];
  let view = (location.hash || '#agentes').slice(1), filtroChat = null;
  if (view === 'conversaciones') view = 'chats';
  if (!VIEWS.some(([k]) => k === view)) view = 'agentes';
  const hasMkt = me.modules.some((m) => m.id === 'marketing');
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { prompt('Copia el texto:', t); } };
  const ago = (ts) => (ts ? fecha(ts, true) : '—');

  // Paso a paso visible: mientras trabaja y, al terminar, queda debajo de la respuesta (con lo que devolvió cada herramienta)
  const etiqueta = (h) => { const [m, ...r] = String(h).split('.'); return r.length ? `${m.charAt(0).toUpperCase()}${m.slice(1)} · ${r.join(' ').replace(/_/g, ' ')}` : String(h).replace(/_/g, ' '); };
  const ICO = { consultada: ['text-success', 'bi-check-circle-fill', 'Consultado'], hecha: ['text-success', 'bi-check-circle-fill', 'Hecho'], propuesta: ['text-warning', 'bi-hourglass-split', 'Por confirmar'], rechazada: ['text-danger', 'bi-x-circle-fill', 'Descartado'], error: ['text-danger', 'bi-x-circle-fill', 'No se pudo'] };
  const pintarPasos = (pasos, actual) => ((pasos?.length || actual) ? `<div class="mt-2 p-2 rounded-3 small" style="background:rgba(var(--bs-body-color-rgb),.05)"><div class="fw-semibold text-uppercase text-body-secondary" style="font-size:11px;letter-spacing:.04em">Paso a paso</div><ol class="list-unstyled mb-0">${(pasos || []).map((p) => { const [c, ic, t] = ICO[p.estado] || ['text-body-secondary', 'bi-dot', '']; return `<li class="d-flex gap-2 align-items-baseline"><i class="bi ${ic} ${c}"></i><span>${esc(etiqueta(p.herramienta))} <span class="text-body-secondary">${t}</span>${p.resultado ? `<div class="text-body-secondary" style="font-size:11.5px">${esc(String(p.resultado).slice(0, 140))}</div>` : ''}</span></li>`; }).join('')}${actual ? `<li class="d-flex gap-2 align-items-baseline text-primary fw-semibold"><span class="spinner-border spinner-border-sm"></span><span>${esc(actual)}</span></li>` : ''}</ol></div>` : '');
  // Consulta el avance cada segundo mientras dura la llamada `trabajo` y lo pinta con `pintar(pasos, actual)`
  async function conAvance(pid, pintar, trabajo) {
    const t = setInterval(async () => { try { const g = await api(`${B}/asistente/progreso?id=${pid}`); if (g.pasos?.length || g.actual) pintar(g.pasos, g.actual); } catch (_) {} }, 900);
    try { return await trabajo(); } finally { clearInterval(t); }
  }
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  function render() {
    history.replaceState(null, '', `#${view}`);
    const old = $('[data-view]'), el = old.cloneNode(false); old.replaceWith(el);
    ({ chats: chatsYConversaciones, asistente, agentes, consumo, conexiones, modelo })[view](el);
  }
  const go = (k) => { view = k; $$('[data-seg] .btn').forEach((b) => b.classList.toggle('active', b.dataset.k === k)); render(); };

  /* ================= Chats de clientes ================= */
  async function chats(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let rows;
    try { rows = (await api(`${B}/chats`)).rows; } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Cada chat atiende a tus clientes con IA, usa el tono de tu marca y guarda sus conversaciones. Lo puedes mostrar en <b>tarjetas de presentación</b>
        (${hasMkt ? 'Marca → Tarjetas' : 'con Marketing'}), en tu <b>web</b> o compartir su enlace. Puedes tener varios: soporte, ventas, una landing…</div>
      ${CAN ? '<div class="mb-3"><button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nuevo chat</button></div>' : ''}
      <div class="row g-3">${rows.length ? rows.map((c) => `<div class="col-lg-6"><div class="dw-card h-100" data-id="${c.id}">
        <div class="d-flex align-items-start gap-2"><div class="flex-grow-1" style="min-width:0"><h2 class="h6 mb-0 text-truncate">${esc(c.nombre)}</h2><a class="small font-monospace" href="${esc(c.ruta)}" target="_blank" rel="noopener">${esc(location.host)}${esc(c.ruta)}</a></div>
          <span class="badge ${c.activo ? 'text-bg-success' : 'text-bg-secondary'}">${c.activo ? 'Activo' : 'En pausa'}</span></div>
        <div class="small text-body-secondary mt-2">${c.saludo ? `“${esc(c.saludo)}”` : 'Saludo predeterminado'} · ${c.usar_marca ? 'usa el tono de la marca' : 'sin tono de marca'}${c.capturar_leads ? ' · guarda leads' : ''}${c.webhook_url ? ' · con webhook' : ''}</div>
        <div class="small mt-2"><i class="bi bi-chat-left-text me-1"></i>${c.conversaciones} conversación${c.conversaciones === 1 ? '' : 'es'}${c.ultima ? ` · última ${esc(ago(c.ultima))}` : ''}</div>
        <div class="d-flex flex-wrap gap-1 mt-3">${CAN ? '<button class="btn btn-sm btn-primary" data-edit><i class="bi bi-gear me-1"></i>Ajustes</button>' : ''}<button class="btn btn-sm btn-outline-primary" data-code><i class="bi bi-code-slash me-1"></i>Código</button>
          <button class="btn btn-sm btn-outline-primary" data-conv><i class="bi bi-chat-left-text me-1"></i>Conversaciones</button><a class="btn btn-sm btn-outline-primary" href="${esc(c.ruta)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i></a>
          ${CAN && c.webhook_url ? '<button class="btn btn-sm btn-outline-secondary" data-hook>Probar webhook</button>' : ''}</div></div></div>`).join('')
        : `<div class="col-12">${empty('bi-chat-dots', 'Aún no tienes chats. Crea el primero y muéstralo en tu tarjeta o tu web.', CAN ? '<button class="btn btn-primary" data-new>Crear mi primer chat</button>' : '')}</div>`}</div>`;
    const editar = async (c) => {
      const v = await C.form({ title: c ? `Ajustes · ${c.nombre}` : 'Nuevo chat', okText: 'Guardar', values: c || { activo: 1, usar_marca: 1, capturar_leads: hasMkt ? 1 : 0, saludo: `¡Hola! Soy el asistente de ${me.business.name}. ¿En qué te puedo ayudar?` },
        fields: [{ k: 'nombre', label: 'Nombre del chat', required: true, placeholder: 'Soporte, Ventas, Landing…' }, { k: 'activo', label: 'Estado', type: 'bool', check: 'Activo (si lo pausas, deja de responder)' },
          { k: 'saludo', label: 'Saludo (lo primero que ve el cliente)', type: 'long', full: true },
          { k: 'instrucciones', label: 'Qué sabe y cómo responde', type: 'long', full: true, hint: 'máx. 4000 letras', placeholder: 'Servicios, precios que puede decir, horarios, qué hacer si no sabe…' },
          { k: 'usar_marca', label: 'Tono', type: 'bool', check: 'Usar el tono de la marca y sus plantillas de chat' },
          { k: 'capturar_leads', label: 'Leads', type: 'bool', check: hasMkt ? 'Guardar en Marketing a quien deje sus datos' : 'Guardar leads (requiere Marketing)' },
          { k: 'whatsapp', label: 'WhatsApp de respaldo', placeholder: '573001234567', hint: 'botón «Seguir por WhatsApp»' }, { k: 'limite_dia', label: 'Tope de mensajes por día', type: 'int', hint: 'vacío = el del negocio (200)' },
          { k: 'webhook_url', label: 'Webhook (opcional)', type: 'url', full: true, hint: 'https; recibe chat_iniciado y lead_capturado' }],
        onDelete: c ? async () => { await api(`${B}/chats/${c.id}`, { method: 'DELETE' }); } : null });
      if (v === null) return;
      if (v !== 'deleted') {
        const body = { ...v, limite_dia: v.limite_dia === '' ? null : v.limite_dia };
        try { await api(c ? `${B}/chats/${c.id}` : `${B}/chats`, { method: c ? 'PATCH' : 'POST', body }); toast('Chat guardado'); } catch (x) { toast(x.message, false); return; }
      }
      chats(el);
    };
    const codigo = (c) => {
      const url = `${location.origin}${c.ruta}`;
      const piezas = [['Burbuja flotante (para tu web)', `<script src="${url}/widget.js" defer></script>`, 'Pégalo antes de </body>: aparece una burbuja que abre el chat.'],
        ['Incrustado (iframe)', `<iframe src="${url}?embed=1" title="${c.nombre}" style="width:100%;max-width:420px;height:560px;border:0;border-radius:16px"></iframe>`, 'Para una sección de tu página.'], ['Enlace directo', url, 'Para compartir por WhatsApp, redes o un QR.']];
      modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Código de «${esc(c.nombre)}»</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body d-grid gap-3">${piezas.map(([t, code, a], i) => `<div><div class="d-flex align-items-center gap-2"><div class="flex-grow-1"><b class="small">${esc(t)}</b><div class="small text-body-secondary">${esc(a)}</div></div><button class="btn btn-sm btn-outline-primary" data-cp="${i}"><i class="bi bi-clipboard me-1"></i>Copiar</button></div>
          <pre class="small mt-1 mb-0 p-2 rounded-3" style="white-space:pre-wrap;word-break:break-all;background:rgba(var(--bs-body-color-rgb),.06)">${esc(code)}</pre></div>`).join('')}
          <div class="small text-body-secondary"><i class="bi bi-person-vcard me-1"></i>En una <b>tarjeta de presentación</b>: ${hasMkt ? 'Marca → Tarjetas → editar la tarjeta → «Chat de IA de la tarjeta».' : 'necesitas el módulo Marketing.'}</div></div>`, { size: 'modal-lg' }).el
        .addEventListener('click', (e) => { const b = e.target.closest('[data-cp]'); if (b) copiar(piezas[+b.dataset.cp][1]); });
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-blank]')) return editar(null);
      if (e.target.closest('[data-new]')) {   // elegir una plantilla (luego se cambia todo) o empezar en blanco
        if (!st.length) return editar(null);
        const { el: pk, m: pm } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Nuevo agente</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body"><p class="text-body-secondary small">Elige una plantilla (luego puedes cambiar todo) o empieza en blanco.</p><div class="tplgrid">${st.map((t, i) => `<button type="button" class="tplbtn" data-st2="${i}"><i class="bi bi-robot"></i><b>${esc(t.nombre)}</b><span>${esc(String(t.instrucciones || '').split('\n')[0].slice(0, 110))}</span></button>`).join('')}<button type="button" class="tplbtn" data-blank2><i class="bi bi-plus-circle"></i><b>En blanco</b><span>Defines el rol, las herramientas y cuándo trabaja.</span></button></div></div>`, { size: 'modal-lg' });
        pk.addEventListener('click', (ev) => { const b2 = ev.target.closest('[data-st2],[data-blank2]'); if (!b2) return; pm.hide(); b2.dataset.blank2 !== undefined ? editar(null) : editar(null, { programacion: 'manual', autonomia: 'proponer', activo: 1, herramientas: [], ...st[+b2.dataset.st2] }); });
        return;
      }
      const card = e.target.closest('[data-id]'); if (!card) return;
      const c = rows.find((x) => String(x.id) === card.dataset.id);
      if (e.target.closest('[data-edit]')) return editar(c);
      if (e.target.closest('[data-code]')) return codigo(c);
      if (e.target.closest('[data-conv]')) { filtroChat = c.id; return render(); }
      if (e.target.closest('[data-hook]')) { try { const r = await api(`${B}/chats/${c.id}/webhook-prueba`, { method: 'POST' }); toast(r.ok ? 'Evento de prueba enviado' : `El webhook no respondió: ${r.error || r.status}`, !!r.ok); } catch (x) { toast(x.message, false); } }
    };
  }

  // Los chats (con sus ajustes) y sus conversaciones van en el mismo lugar
  function chatsYConversaciones(el) {
    el.innerHTML = '<div data-chats></div><h2 class="h6 mt-4 mb-2"><i class="bi bi-chat-left-text me-1"></i>Conversaciones</h2><div data-convs></div>';
    chats($('[data-chats]', el)); conversaciones($('[data-convs]', el));
    if (ES_DIWILO) { el.insertAdjacentHTML('beforeend', '<h2 class="h6 mt-4 mb-2"><i class="bi bi-globe2 me-1"></i>Chat del sitio diwilo.com</h2><div data-sitio></div>'); sitioDiwilo($('[data-sitio]', el)); }
  }

  /* ================= Chat del sitio diwilo.com (solo Diwilo Admin): sus conversaciones y su configuración ================= */
  async function sitioDiwilo(el) {
    const sitio = async (path, opts = {}) => {
      const r = await fetch(`/admin/api/${path}`, { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(opts.method ? { 'x-app': '1' } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Error ${r.status}`); return d;
    };
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let chatsSitio, st;
    try { [chatsSitio, st] = await Promise.all([sitio('chats'), sitio('settings')]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="row g-3"><div class="col-lg-5"><div class="d-grid gap-2" style="max-height:70vh;overflow:auto" data-lista>${chatsSitio.length ? chatsSitio.map((c) => `<button class="btn text-start border p-2" data-c="${esc(c.id)}"><span class="d-block fw-semibold text-truncate">${esc(c.first || '(sin mensajes)')}</span><span class="small text-body-secondary">${esc(ago(c.last_at))} · ${c.msg_count} mensajes${c.country ? ` · ${esc(c.country)}` : ''} ${esc(c.device || '')}</span></button>`).join('') : '<p class="text-body-secondary dw-card mb-0">Aún no hay conversaciones.</p>'}</div></div>
      <div class="col-lg-7"><form class="dw-card" data-aj><div class="d-flex flex-wrap justify-content-between gap-2 mb-2"><span class="text-body-secondary small">Motor de IA: <span class="badge text-bg-secondary fw-normal">${esc(st.ai_provider)}</span></span>
          <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="chat_enabled" id="sitEn" ${st.chat_enabled ? 'checked' : ''}><label class="form-check-label" for="sitEn">Chat activo en el sitio</label></div></div>
        <label class="form-label small mb-1">Instrucciones del asistente (qué sabe y cómo responde)</label><textarea class="form-control" name="chat_prompt" rows="12" style="font-family:var(--bs-font-monospace);font-size:12px">${esc(st.chat_prompt)}</textarea>
        <div class="d-flex gap-2 mt-3"><button class="btn btn-primary">Guardar</button><button type="button" class="btn btn-outline-secondary" data-reset>Restaurar texto original</button></div></form></div></div>`;
    el.querySelector('[data-aj]').onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await sitio('settings', { method: 'POST', body: { chat_prompt: f.chat_prompt.value, chat_enabled: f.chat_enabled.checked ? '1' : '0' } }); toast('Ajustes guardados'); } catch (x) { toast(x.message, false); } };
    el.querySelector('[data-reset]').onclick = () => { el.querySelector('[name=chat_prompt]').value = st.default_prompt; };
    el.querySelector('[data-lista]').onclick = async (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      const { el: mo, m: mm } = modal('<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Conversación del sitio</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body" data-cuerpo></div>', { size: 'modal-lg' });
      const box = mo.querySelector('[data-cuerpo]'); box.innerHTML = '<p class="text-body-secondary mb-0">Cargando…</p>';
      try {
        const ms = await sitio(`chats?chat=${encodeURIComponent(b.dataset.c)}`);
        box.innerHTML = `<div class="d-flex flex-column gap-2" style="max-height:60vh;overflow:auto">${ms.map((m) => `<div class="p-2 px-3 rounded-4 ${m.role === 'user' ? 'align-self-end text-white' : 'align-self-start'}" style="max-width:90%;white-space:pre-wrap;${m.role === 'user' ? 'background:var(--dw-p)' : 'background:rgba(var(--bs-body-color-rgb),.07)'}">${esc(m.content)}<div class="small opacity-75">${esc(ago(m.ts))}</div></div>`).join('')}</div>
          ${CAN ? '<div class="mt-3"><button class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Borrar conversación</button></div>' : ''}`;
        box.querySelector('[data-del]')?.addEventListener('click', async () => {
          if (!(await confirm({ title: '¿Borrar esta conversación?', text: 'No se puede deshacer.', ok: 'Borrar' }))) return;
          try { await sitio(`chats?chat=${encodeURIComponent(b.dataset.c)}`, { method: 'DELETE' }); mm.hide(); toast('Conversación borrada'); sitioDiwilo(el); } catch (x) { toast(x.message, false); }
        });
      } catch (x) { box.innerHTML = `<p class="text-danger mb-0">${esc(x.message)}</p>`; }
    };
  }

  /* ================= Conversaciones ================= */
  async function conversaciones(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let rows, cs;
    try { [rows, cs] = await Promise.all([api(`${B}/conversaciones${filtroChat ? `?chat=${filtroChat}` : ''}`).then((r) => r.rows), api(`${B}/chats`).then((r) => r.rows)]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3 align-items-center"><select class="form-select w-auto" data-chat><option value="">Todos los chats</option>${cs.map((c) => `<option value="${c.id}" ${filtroChat === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
        <span class="small text-body-secondary">${rows.length} conversación${rows.length === 1 ? '' : 'es'}</span></div>
      <div class="row g-3"><div class="col-12"><div class="d-grid gap-2" data-list style="max-height:70vh;overflow:auto">${rows.length ? rows.map((v) => `<button class="btn text-start border p-2" data-id="${esc(v.id)}"><span class="d-block text-truncate fw-semibold">${esc(v.primero || '(sin mensajes)')}</span>
          <span class="small text-body-secondary">${esc(v.chat)} · ${esc(ago(v.last_at))} · ${v.msg_count} mensajes${v.dispositivo ? ` · ${esc(v.dispositivo)}` : ''}${v.lead_id ? ' · <b>lead</b>' : ''}</span></button>`).join('') : empty('bi-chat-left-text', 'Aún no hay conversaciones.')}</div></div>
      </div>`;
    $('[data-chat]', el).onchange = (e) => { filtroChat = Number(e.target.value) || null; conversaciones(el); };
    $('[data-list]', el).onclick = async (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      $$('[data-id]', el).forEach((x) => x.classList.toggle('border-primary', x === b));
      const { el: mo, m: mm } = modal('<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Conversación del chat</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body" data-conv></div>', { size: 'modal-lg' });
      const box = mo.querySelector('[data-conv]'); box.innerHTML = '<p class="text-body-secondary mb-0">Cargando…</p>';
      try {
        const d = await api(`${B}/conversaciones/${encodeURIComponent(b.dataset.id)}`);
        box.innerHTML = `<div class="d-flex align-items-center mb-2"><div class="flex-grow-1 small text-body-secondary">${esc(ago(d.conversacion.started_at))}${d.conversacion.pagina ? ` · ${esc(d.conversacion.pagina.slice(0, 60))}` : ''}${d.conversacion.pais ? ` · ${esc(d.conversacion.pais)}` : ''}</div>${CAN ? '<button class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash"></i></button>' : ''}</div>
          <div class="d-flex flex-column gap-2" style="max-height:60vh;overflow:auto">${d.mensajes.map((m) => `<div class="p-2 px-3 rounded-4 ${m.rol === 'user' ? 'align-self-end text-white' : 'align-self-start'}" style="max-width:85%;white-space:pre-wrap;${m.rol === 'user' ? 'background:var(--dw-p)' : 'background:rgba(var(--bs-body-color-rgb),.08)'}">${esc(m.contenido)}<div style="font-size:.7rem;opacity:.65">${esc(fecha(m.ts, true))}</div></div>`).join('')}</div>`;
        $('[data-del]', box)?.addEventListener('click', async () => {
          if (!(await confirm({ title: '¿Borrar esta conversación?', text: 'No se puede deshacer.', ok: 'Borrar' }))) return;
          try { await api(`${B}/conversaciones/${encodeURIComponent(b.dataset.id)}`, { method: 'DELETE' }); mm.hide(); toast('Conversación borrada'); conversaciones(el); } catch (x) { toast(x.message, false); }
        });
      } catch (x) { box.innerHTML = `<p class="text-danger mb-0">${esc(x.message)}</p>`; }
    };
  }

  /* ================= IA Diwilo: el asistente (botón flotante) ================= */
  function asistente(el) {
    const fab = () => { for (const w of [window, window.parent, window.top]) { try { const b = w.document.getElementById('iaFab'); if (b) return { b, ia: w.DwIA }; } catch (_) {} } return {}; };
    el.innerHTML = `<div class="dw-grid" style="--min:340px">
      <div class="dw-card"><h2 class="h6"><i class="bi bi-robot"></i> IA Diwilo</h2>
        <p class="text-body-secondary" style="font-size:13px;line-height:1.6">Asistente del negocio (botón flotante abajo a la derecha). Responde con los datos reales de tus módulos activos y, mientras trabaja, te muestra el paso a paso de lo que va haciendo.
        Las acciones que cambian datos te piden confirmar antes de ejecutarse y quedan en la bitácora.</p>
        <button class="btn btn-primary" data-open><i class="bi bi-chat-dots me-1"></i>Abrir IA Diwilo</button></div>
      <div class="dw-card" data-caps><h2 class="h6">Qué puede hacer</h2><p class="text-body-secondary mb-0">Cargando…</p></div>
      <div class="dw-card"><h2 class="h6">Modelo de IA</h2><p class="text-body-secondary" style="font-size:13px;line-height:1.6" data-provider>…</p></div>
      <div class="dw-card" data-fl hidden><h2 class="h6"><i class="bi bi-diagram-3"></i> Flujos de trabajo</h2><p class="text-body-secondary" style="font-size:13px">Toca uno y la IA lo hace paso a paso (te pide confirmar antes de cambiar datos).</p><div class="d-flex flex-wrap gap-2" data-fl-btns></div></div></div>`;
    $('[data-open]', el).onclick = () => { const f = fab(); if (f.b) f.b.click(); else toast('El botón de IA Diwilo no está en esta pantalla', false); };
    api(`${B}/uso`).then((u) => { $('[data-provider]', el).textContent = `Usa ${u.motor}. Los chats de clientes, el asistente y los agentes comparten este modelo.`; }).catch(() => {});
    api(`${B}/herramientas`).then((r) => {
      const hs = r.herramientas.filter((t) => t.modulo !== 'ai' || t.tipo === 'lectura'), chip = (t) => `<span class="badge text-bg-light border fw-normal">${esc(etiqueta(t.name))}</span>`;
      const lect = hs.filter((t) => t.tipo !== 'escritura'), escr = hs.filter((t) => t.tipo === 'escritura');
      $('[data-caps]', el).innerHTML = `<h2 class="h6">Qué puede hacer</h2><div class="ia-caps"><b>Consulta</b><span class="d-flex flex-wrap gap-1">${lect.map(chip).join('') || '—'}</span>
        <b>Con tu confirmación</b><span class="d-flex flex-wrap gap-1">${escr.map(chip).join('') || '—'}</span>
        <b>No hace</b><span>Borrar datos, cambiar dueños o permisos, ni registrar pagos de suscripciones.</span></div>`;
    }).catch(() => {});
    // Flujos: los de cada módulo y los que cruzan varios (el mismo estándar del MCP y de los agentes)
    api(`${B}/guias`).then((r) => {
      const fl = [...(r.entre || []).map((f) => ({ ...f, modulo: f.modulos.join(' + ') })), ...r.modulos.flatMap((g) => g.flujos.map((f) => ({ ...f, modulo: g.nombre })))];
      if (!fl.length) return;
      const box = $('[data-fl]', el); box.hidden = false;
      $('[data-fl-btns]', el).innerHTML = fl.map((f, i) => `<button class="btn btn-sm btn-outline-secondary" data-fl="${i}" title="${esc(f.descripcion)}">${esc(f.modulo)} · ${esc(f.nombre)}</button>`).join('');
      $('[data-fl-btns]', el).onclick = (e) => { const b = e.target.closest('[data-fl]'); if (!b) return; const f = fab(); if (f.ia?.ask) f.ia.ask(fl[+b.dataset.fl].prompt); else { navigator.clipboard?.writeText(fl[+b.dataset.fl].prompt); toast('Flujo copiado: pégalo en IA Diwilo'); f.b?.click(); } };
    }).catch(() => {});
  }

  /* ================= Agentes ================= */
  const PROG = { manual: 'Cuando yo lo pida', diario: 'Todos los días', semanal: 'Los lunes' }, AUTO = { proponer: 'Propone y yo apruebo', ejecutar: 'Ejecuta solo' };
  async function agentes(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let rows, herr, st, flujos;
    try { [rows, herr, st, flujos] = await Promise.all([api(`${B}/agentes`).then((r) => r.rows), api(`${B}/herramientas`).then((r) => r.herramientas), CAN ? api(`${B}/starters`).then((r) => r.agente) : [], CAN ? api(`${B}/guias`).then((r) => r.modulos.flatMap((g) => g.flujos.map((f) => ({ ...f, modulo: g.nombre })))).catch(() => []) : []]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const ICON = (a) => (/cobr|cartera/i.test(a.nombre) ? 'bi-cash-coin' : /lead|contact|cliente/i.test(a.nombre) ? 'bi-person-plus' : /blog|texto|escrib/i.test(a.nombre) ? 'bi-journal-text' : /renov|venc/i.test(a.nombre) ? 'bi-arrow-clockwise' : /anali|resumen|informe/i.test(a.nombre) ? 'bi-graph-up' : 'bi-robot');
    el.innerHTML = `<div class="dw-row hubbar"><p class="text-body-secondary grow" style="margin:0;font-size:13px;max-width:760px">Cada agente tiene un rol, las herramientas que puede usar y cuándo trabaja. Si «propone», lo que cambie datos espera tu aprobación; si «actúa solo», lo hace y queda en la bitácora.</p>
        ${CAN ? '<button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nuevo agente</button>' : ''}</div>
      ${CAN && flujos.length ? `<div class="mb-3 d-flex flex-wrap gap-2 align-items-center"><span class="small text-body-secondary"><i class="bi bi-diagram-3 me-1"></i>Desde un flujo de tus módulos:</span>${flujos.map((f, i) => `<button class="btn btn-sm btn-outline-secondary" data-fl="${i}" title="${esc(f.descripcion)}">${esc(f.modulo)} · ${esc(f.nombre)}</button>`).join('')}</div>` : ''}
      ${rows.length ? `<div class="agrid">${rows.map((a) => `<article class="dw-card acard ${a.activo ? '' : 'off'}" data-id="${a.id}">
          <div class="dw-row" style="gap:10px"><span class="aico"><i class="bi ${ICON(a)}"></i></span><div style="flex:1;min-width:0"><b>${esc(a.nombre)}</b><br><span class="text-body-secondary" style="font-size:12px">${a.herramientas.length} herramienta${a.herramientas.length === 1 ? '' : 's'}</span></div>
            ${a.ultima?.pendientes ? `<span class="badge text-bg-primary" title="Ejecuciones con acciones por aprobar">${a.ultima.pendientes}</span>` : ''}</div>
          <p class="text-body-secondary aitext">${esc(a.instrucciones.slice(0, 160))}${a.instrucciones.length > 160 ? '…' : ''}</p>
          <div class="dw-row" style="gap:6px;flex-wrap:wrap"><span class="st ${a.activo ? 'ok' : 'free'}">${a.activo ? PROG[a.programacion] : 'Pausado'}</span><span class="st ${a.autonomia === 'ejecutar' ? 'ok' : 'soon'}">${AUTO[a.autonomia]}</span></div>
          <span class="text-body-secondary" style="font-size:12px">${a.ultima ? `Última vez: ${esc(ago(a.ultima.created_at))}${a.ultima.estado === 'error' ? ' · con error' : ''}` : 'Aún no ha trabajado'}</span>
          <div class="dw-row" style="gap:6px">${CAN ? '<button class="btn btn-sm btn-primary" data-run><i class="bi bi-play-fill"></i> Ejecutar ahora</button>' : ''}<button class="btn btn-sm btn-outline-secondary" data-hist>Historial</button>${CAN ? '<button class="btn btn-sm btn-outline-secondary" data-edit>Editar</button>' : ''}</div>
        </article>`).join('')}</div>`
      : `<div class="dw-card"><h2 class="h6">Empieza con una plantilla</h2>${CAN ? `<div class="tplgrid">${st.map((t, i) => `<button class="tplbtn" data-st="${i}"><i class="bi ${ICON(t)}"></i><b>${esc(t.nombre)}</b><span>${esc(String(t.instrucciones || '').split('\n')[0].slice(0, 110))}</span></button>`).join('')}<button class="tplbtn" data-blank><i class="bi bi-plus-circle"></i><b>En blanco</b><span>Defines el rol, las herramientas y cuándo trabaja.</span></button></div>` : '<p class="text-body-secondary mb-0">Aún no hay agentes.</p>'}</div>`}`;
    const grupos = Object.entries(herr.reduce((g, t) => { (g[t.modulo] ||= []).push(t); return g; }, {}));
    const editar = (a, base) => {
      const d = a || base || { programacion: 'manual', autonomia: 'proponer', activo: 1, herramientas: [] };
      const { el: m, m: mm } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${a ? 'Editar agente' : 'Nuevo agente'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><div class="row g-2"><div class="col-md-8"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="nombre" value="${esc(d.nombre || '')}" required maxlength="80"></div>
          <div class="col-md-4 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="activo" id="agAct" ${d.activo ? 'checked' : ''}><label class="form-check-label" for="agAct">Activo</label></div></div>
          <div class="col-12"><label class="form-label small mb-1">Qué hace (rol, qué revisar, qué hacer y cómo responder)</label><textarea class="form-control" name="instrucciones" rows="5" required maxlength="4000">${esc(d.instrucciones || '')}</textarea></div>
          <div class="col-md-6"><label class="form-label small mb-1">Cuándo trabaja</label><select class="form-select" name="programacion">${Object.entries(PROG).map(([k, l]) => `<option value="${k}" ${d.programacion === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="col-md-6"><label class="form-label small mb-1">Permiso para escribir</label><select class="form-select" name="autonomia">${Object.entries(AUTO).map(([k, l]) => `<option value="${k}" ${d.autonomia === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="col-12"><div class="small fw-semibold mt-2 mb-1">Herramientas que puede usar</div>${grupos.length ? grupos.map(([mod, ts]) => `<div class="mb-2"><div class="small text-body-secondary text-uppercase" style="font-size:.7rem">${esc(mod)}</div><div class="d-flex flex-wrap gap-2">${ts.map((t) => `<label class="border rounded-3 px-2 py-1 small d-flex align-items-center gap-1" title="${esc(t.description)}" style="cursor:pointer"><input type="checkbox" class="form-check-input mt-0" name="h" value="${esc(t.name)}" ${(d.herramientas || []).includes(t.name) ? 'checked' : ''}>${esc(t.name.split('.')[1])}<span class="badge ${t.tipo === 'escritura' ? 'text-bg-warning' : 'text-bg-light'} fw-normal">${t.tipo === 'escritura' ? 'escribe' : 'lee'}</span></label>`).join('')}</div></div>`).join('') : '<p class="small text-body-secondary">No hay herramientas disponibles.</p>'}</div></div>
          <div class="small text-danger mt-2" data-err></div></div>
        <div class="modal-footer border-0 pt-0 justify-content-between"><span>${a ? '<button type="button" class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span><span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar</button></span></div></form>`, { size: 'modal-lg' });
      $('[data-del]', m)?.addEventListener('click', async () => {
        if (!(await confirm({ title: `¿Borrar el agente «${a.nombre}»?`, text: 'Se borra también su historial.', ok: 'Borrar' }))) return;
        try { await api(`${B}/agentes/${a.id}`, { method: 'DELETE' }); mm.hide(); toast('Agente borrado'); agentes(el); } catch (x) { $('[data-err]', m).textContent = x.message; }
      });
      $('form', m).onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        const body = { nombre: f.nombre.value.trim(), instrucciones: f.instrucciones.value.trim(), programacion: f.programacion.value, autonomia: f.autonomia.value, activo: f.activo.checked, herramientas: JSON.stringify($$('[name=h]:checked', f).map((x) => x.value)) };
        try { await api(a ? `${B}/agentes/${a.id}` : `${B}/agentes`, { method: a ? 'PATCH' : 'POST', body }); mm.hide(); toast('Agente guardado'); agentes(el); } catch (x) { $('[data-err]', m).textContent = x.message; }
      };
    };
    const historial = async (a) => {
      const { el: m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Historial · ${esc(a.nombre)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body" data-body><p class="text-body-secondary">Cargando…</p></div>`, { size: 'modal-lg' });
      const pintar = async () => {
        let ej; try { ej = (await api(`${B}/ejecuciones?agente=${a.id}`)).rows; } catch (x) { $('[data-body]', m).innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
        $('[data-body]', m).innerHTML = ej.length ? ej.map((e) => `<div class="border rounded-3 p-3 mb-2"><div class="d-flex gap-2 align-items-center"><b class="small">${esc(ago(e.created_at))}</b><span class="badge ${e.estado === 'ok' ? 'text-bg-success' : e.estado === 'error' ? 'text-bg-danger' : 'text-bg-secondary'}">${esc(e.estado)}</span><span class="small text-body-secondary">${esc(e.disparador)}${e.por ? ` · ${esc(e.por)}` : ''}</span></div>
          <p class="small mt-2 mb-2" style="white-space:pre-wrap">${esc(e.resumen || '')}</p>
          ${e.pasos.map((p, i) => `<div class="small d-flex align-items-start gap-2 py-1 border-top"><code class="flex-shrink-0">${esc(p.herramienta)}</code><span class="flex-grow-1 text-body-secondary" style="word-break:break-word">${esc(JSON.stringify(p.args))}${p.resultado ? ` → ${esc(String(p.resultado).slice(0, 160))}` : ''}</span>
            ${p.estado === 'propuesta' && CAN ? `<span class="d-flex gap-1"><button class="btn btn-sm btn-primary py-0" data-ap="${e.id}:${i}">Aprobar</button><button class="btn btn-sm btn-light py-0" data-re="${e.id}:${i}">Rechazar</button></span>` : `<span class="badge ${p.estado === 'hecha' ? 'text-bg-success' : p.estado === 'error' ? 'text-bg-danger' : p.estado === 'propuesta' ? 'text-bg-warning' : 'text-bg-light'} fw-normal">${esc(p.estado)}</span>`}</div>`).join('')}</div>`).join('') : '<p class="text-body-secondary">Aún no ha corrido.</p>';
      };
      m.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-ap],[data-re]'); if (!b) return;
        const [id, indice] = (b.dataset.ap || b.dataset.re).split(':'); b.disabled = true;
        try { await api(`${B}/ejecuciones/${id}/aprobar`, { method: 'POST', body: { indice: Number(indice), aprobar: !!b.dataset.ap } }); toast(b.dataset.ap ? 'Aprobada y ejecutada' : 'Rechazada'); await pintar(); } catch (x) { toast(x.message, false); b.disabled = false; }
      });
      pintar();
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return editar(null);
      const s = e.target.closest('[data-st]'); if (s) return editar(null, { ...st[+s.dataset.st], programacion: 'manual', autonomia: 'proponer', activo: 1, herramientas: [] });
      const fl = e.target.closest('[data-fl]');
      if (fl) { // un flujo de un módulo (el mismo estándar del MCP): su prompt y sus herramientas
        const f = flujos[+fl.dataset.fl];
        return editar(null, { nombre: f.nombre, instrucciones: f.prompt, programacion: 'manual', autonomia: 'proponer', activo: 1, herramientas: f.pasos.map((p) => herr.find((t) => t.name.replace(/\./g, '_') === p)?.name).filter(Boolean) });
      }
      const card = e.target.closest('[data-id]'); if (!card) return;
      const a = rows.find((x) => String(x.id) === card.dataset.id);
      if (e.target.closest('[data-edit]')) return editar(a);
      if (e.target.closest('[data-hist]')) return historial(a);
      const run = e.target.closest('[data-run]');
      if (run) {   // ejecutar ahora: pedido puntual opcional y paso a paso en vivo (queda visible al terminar)
        const { el: mo, m: mm } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Ejecutar «${esc(a.nombre)}»</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><label class="form-label small mb-1">¿Algo puntual para esta vez? <span class="text-body-secondary">(opcional)</span></label><input class="form-control" name="pedido" maxlength="500" placeholder="Ej.: revisa solo lo de esta semana"><div data-avance class="mt-3"></div></div>
          <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cerrar</button><button class="btn btn-primary" data-go><i class="bi bi-play-fill me-1"></i>Ejecutar</button></div></form>`);
        mo.querySelector('form').onsubmit = async (ev) => {
          ev.preventDefault(); const go = mo.querySelector('[data-go]'), av = mo.querySelector('[data-avance]'); go.disabled = true; go.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Trabajando…';
          const pid = nuevoId();
          try {
            const r = await conAvance(pid, (pasos, actual) => { av.innerHTML = pintarPasos(pasos, actual); }, () => api(`${B}/agentes/${a.id}/ejecutar`, { method: 'POST', body: { progreso: pid, pedido: mo.querySelector('[name=pedido]').value } }));
            av.innerHTML = `<div class="${r.estado === 'error' ? 'text-danger' : ''} small mb-2" style="white-space:pre-wrap">${esc(r.resumen || '')}</div>${pintarPasos(r.pasos)}${r.pendientes ? `<div class="alert alert-warning py-2 small mt-2 mb-0">${r.pendientes} propuesta(s) por aprobar en el historial del agente.</div>` : ''}`;
            go.innerHTML = 'Listo'; mo.addEventListener('hidden.bs.modal', () => agentes(el), { once: true });
          } catch (x) { av.innerHTML = `<div class="text-danger small">${esc(x.message)}</div>`; go.disabled = false; go.innerHTML = 'Reintentar'; }
        };
      }
    };
  }

  /* ================= Consumo ================= */
  async function consumo(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let u; try { u = await api(`${B}/uso`); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const n = (x) => Number(x || 0).toLocaleString('es-CO'), aj = u.ajustes, FUENTE = { chat: 'Chats de clientes', agente: 'Agentes', asistente: 'Asistente', informes: 'Informes' };
    const tok = (x) => (x >= 1e6 ? `${(x / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 2 })} M` : x >= 1000 ? `${(x / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} k` : String(x || 0));
    const cop = (usd) => `$${Math.round(usd * aj.usd_cop).toLocaleString('es-CO')}`, usd = (x) => `US$${x.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: x < 1 ? 3 : 2 })}`;
    const hoyT = u.hoy.tin + u.hoy.tout, mesT = u.mes.tin + u.mes.tout, pct = aj.tope_tokens ? Math.min(100, Math.round((hoyT / aj.tope_tokens) * 100)) : 0;
    const max = Math.max(1, ...u.dias.map((d) => d.tin + d.tout)), puede = CAN && me.canManage;
    const meter = (v, m) => { const p = m ? Math.round((v / m) * 100) : 0; return `<div class="meter ${p > 100 ? 'over' : p >= 80 ? 'warn' : ''}"><i style="width:${Math.min(100, p)}%"></i></div><span class="text-body-secondary" style="font-size:12px">${p}%</span>`; };
    const kpi = (l, v, sub) => `<div class="dw-card kpi"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="text-body-secondary" style="font-size:12px;margin-top:4px">${sub}</div>` : ''}</div>`;
    el.innerHTML = `<p class="text-body-secondary" style="margin:0 0 12px;font-size:13px;max-width:820px">Cada vez que la IA responde se cuentan los tokens (lo que lee + lo que escribe). Motor actual: <b>${esc(u.motor)}</b>. Los costos son estimados.</p>
      ${pct >= 80 ? `<div class="dw-card" style="border-color:var(--${pct >= 100 ? 'bad' : 'warn'});margin-bottom:12px"><b><i class="bi bi-exclamation-triangle"></i> ${pct >= 100 ? 'La IA está en pausa hasta mañana: se llegó al tope diario.' : `Llevas el ${pct}% del tope diario de tokens.`}</b></div>` : ''}
      <div class="dw-grid" style="--min:200px">
        ${kpi('Tokens hoy', tok(hoyT), aj.tope_tokens ? `${meter(hoyT, aj.tope_tokens)}<br>Tope diario: ${tok(aj.tope_tokens)}` : 'Sin tope diario')}
        ${kpi('Costo hoy', cop(u.hoy.usd), `${usd(u.hoy.usd)} · ${n(u.hoy.calls)} de ${n(u.tope_dia)} llamadas`)}
        ${u.neuronas_gratis ? kpi('Cuota gratis de Cloudflare hoy', n(u.hoy.neuronas), `${meter(u.hoy.neuronas, u.neuronas_gratis)}<br>de ${n(u.neuronas_gratis)} neuronas · se renueva 7:00 p. m.`) : ''}
        ${kpi('Tokens del mes', tok(mesT), `${tok(u.mes.tin)} leídos · ${tok(u.mes.tout)} escritos`)}
        ${kpi('Costo del mes', cop(u.mes.usd), `${usd(u.mes.usd)} · proyección ${cop(u.mes.proyeccion_usd)}`)}</div>
      <div class="dw-grid" style="--min:360px;margin-top:14px">
        <div class="dw-card"><h2 class="h6">Últimos 30 días</h2>${u.dias.length ? `<div class="ubars">${u.dias.map((d, i) => `<div title="${esc(d.day)} · ${tok(d.tin + d.tout)} tokens · ${cop(d.usd)}"><i style="height:${(d.tin / max * 100).toFixed(1)}%"></i><b style="height:${(d.tout / max * 100).toFixed(1)}%"></b><span>${i % 5 === 4 || i === u.dias.length - 1 ? +d.day.slice(8) : ''}</span></div>`).join('')}</div>
          <div class="legend"><span><i class="ba"></i>Leídos (entrada)</span><span><i class="bb"></i>Escritos (salida)</span><span class="text-body-secondary">Día más alto: ${tok(max)} tokens</span></div>` : '<p class="text-body-secondary mb-0">Aún no hay consumo.</p>'}</div>
        <div class="dw-card"><h2 class="h6">Quién gasta este mes</h2>${u.fuentes.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Origen</th><th>Llamadas</th><th>Tokens</th><th>Costo</th></tr></thead><tbody>${u.fuentes.map((f) => `<tr><td>${esc(FUENTE[f.fuente] || f.fuente)}</td><td>${n(f.calls)}</td><td>${tok(f.tin + f.tout)}</td><td>${cop(f.usd)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-body-secondary mb-0">Aún no hay consumo este mes.</p>'}</div></div>
      <div class="dw-grid" style="--min:360px;margin-top:14px">
        <form class="dw-card" data-topes><h2 class="h6">Topes y precios</h2>
          <label class="dw-field"><span>Tope diario de tokens (entre todo)</span><input class="form-control" name="tope_tokens" type="number" min="0" step="10000" value="${aj.tope_tokens}" ${puede ? '' : 'disabled'}><small class="text-body-secondary">0 = sin tope. Al llegar, la IA se pausa hasta mañana y los chats pasan a WhatsApp.</small></label>
          <label class="dw-field"><span>Tope por ejecución de un agente (tokens)</span><input class="form-control" name="tope_ejecucion" type="number" min="5000" step="5000" value="${aj.tope_ejecucion}" ${puede ? '' : 'disabled'}><small class="text-body-secondary">Al llegar, el agente para y entrega lo que alcanzó.</small></label>
          <label class="dw-field"><span>Dólar en pesos</span><input class="form-control" name="usd_cop" type="number" min="1000" step="10" value="${aj.usd_cop}" ${puede ? '' : 'disabled'}></label>
          ${puede ? '<div class="dw-row" style="justify-content:flex-end;margin-top:10px"><button class="btn btn-primary">Guardar</button></div>' : ''}</form>
        <div class="dw-card"><h2 class="h6">Qué te protege de gastar de más</h2><div class="ia-caps">
          <b>Tope diario</b><span>Nada llama a la IA cuando se llega al tope del día (y máximo ${n(u.tope_dia)} llamadas).</span>
          <b>Tope por agente</b><span>Cada ejecución tiene su límite de tokens y de pasos (16).</span>
          <b>Sin repeticiones</b><span>Si un agente pide lo mismo dos veces, se le recuerda que ya lo tiene.</span>
          <b>Memoria recortada</b><span>En cada paso los resultados viejos se resumen para no pagarlos otra vez.</span>
          <b>Uno a la vez</b><span>Un agente no corre dos veces al mismo tiempo; las ejecuciones cortadas se cierran solas a los 15 minutos.</span>
          <b>Chats</b><span>Máximo 20 mensajes por visitante cada 10 minutos y un tope diario por chat.</span></div></div>
      </div>`;
    el.querySelector('[data-topes]')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      try { await api(`${B}/uso`, { method: 'PATCH', body: { tope_tokens: f.tope_tokens.value, tope_ejecucion: f.tope_ejecucion.value, usd_cop: f.usd_cop.value } }); toast('Topes guardados'); consumo(el); }
      catch (x) { toast(x.message, false); }
    });
  }

  /* ================= Modelo de IA de la plataforma (solo Diwilo Admin) ================= */
  async function modelo(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let m; try { m = await api(`${B}/proveedor`); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const OPC = [['auto', 'Automático', 'Gemini si tiene clave y, si no, Workers AI.', 'bi-magic'], ['claude', 'Claude', 'Anthropic · el más capaz para agentes y textos largos.', 'bi-stars'], ['gemini', 'Gemini', 'Google · rápido y económico.', 'bi-gem'], ['workers-ai', 'Workers AI', 'Cloudflare · cuota gratis diaria, sin clave.', 'bi-cloud']];
    const SERV = { claude: m.proveedores.claude, gemini: m.proveedores.gemini, higgsfield: { ...(m.servicios?.higgsfield || { nombre: 'Higgsfield (videos)', claves: [] }), por_secreto: false } };
    const estado = (k) => (k === 'auto' ? '' : m.proveedores[k]?.configurado ? '<span class="badge text-bg-success ms-1">Clave lista</span>' : `<span class="badge text-bg-danger ms-1">Falta la clave</span>`);
    el.innerHTML = `<div class="dw-card mb-3"><h2 class="h6"><i class="bi bi-cpu me-1"></i>Qué IA responde en todas las apps</h2>
        <p class="small text-body-secondary">Aplica a los chats de clientes, el asistente y los agentes de <b>todas las apps</b> y al chat y la IA del panel. Esta sección solo se ve aquí, en Diwilo Admin. Si la elegida falla, responde Gemini o Workers AI como respaldo (Claude nunca es respaldo porque cuesta más).</p>
        <div class="row g-2 mb-3" data-opc>${OPC.map(([k, n, d, ic]) => `<div class="col-md-6 col-xl-3"><label class="dw-card h-100 d-block ${m.proveedor === k ? 'border-primary' : ''}" style="cursor:pointer"><input type="radio" class="form-check-input me-2" name="prov" value="${k}" ${m.proveedor === k ? 'checked' : ''}><b><i class="bi ${ic} me-1"></i>${n}</b>${estado(k)}<div class="small text-body-secondary mt-1">${d}</div></label></div>`).join('')}</div>
        <div class="row g-3 mb-3"><div class="col-md-6"><label class="form-label small mb-1">Modelo de Claude</label><input class="form-control" list="mcl" name="modelo_claude" value="${esc(m.proveedores.claude.modelo)}" placeholder="claude-sonnet-5-5"><datalist id="mcl">${m.proveedores.claude.modelos.map((x) => `<option value="${x}">`).join('')}</datalist><div class="form-text">Usa el tipo chat (API de mensajes). Sonnet 5.5 es el predeterminado.</div></div>
          <div class="col-md-6"><label class="form-label small mb-1">Modelo de Gemini</label><input class="form-control" list="mgm" name="modelo_gemini" value="${esc(m.proveedores.gemini.modelo)}" placeholder="gemini-2.5-flash"><datalist id="mgm">${m.proveedores.gemini.modelos.map((x) => `<option value="${x}">`).join('')}</datalist></div></div>
        <div class="d-flex flex-wrap gap-2 align-items-center"><button class="btn btn-primary" data-save>Guardar</button><button class="btn btn-outline-secondary" data-test><i class="bi bi-lightning-charge me-1"></i>Probar el elegido</button><span class="small" data-res></span></div>
        <p class="small text-body-secondary mt-3 mb-0">Responde ahora: <b>${esc(m.activo)}</b>.</p></div>
      <div class="dw-card"><h2 class="h6"><i class="bi bi-key me-1"></i>Claves de IA</h2>
        <p class="small text-body-secondary">Pega aquí tus claves de Claude o Gemini. Puedes poner <b>varias por proveedor</b>: se usa la primera y, si falla o llega a su límite, pasa a la siguiente. Se guardan cifradas y nunca se vuelven a mostrar completas.</p>
        ${m.cifrado ? '' : '<div class="alert alert-warning small">Antes de la primera clave hay que crear <b>una sola vez</b> el secreto maestro que las cifra. En la terminal, en la carpeta <b>Diwilo Modulos</b>: <code>npx wrangler secret put CLAVES_KEK</code> y pega cualquier texto largo y privado (guárdalo; si lo cambias, las claves guardadas dejan de servir). Después todo se hace aquí.</div>'}
        ${['claude', 'gemini'].map((k) => `<div class="mb-3"><div class="fw-semibold small mb-1">${esc(SERV[k].nombre)}${SERV[k].por_secreto ? ' <span class="badge text-bg-secondary ms-1">además hay un secreto de Cloudflare</span>' : ''}</div>
          ${SERV[k].claves.length ? `<ul class="list-group list-group-flush small">${SERV[k].claves.map((c, n) => `<li class="list-group-item d-flex flex-wrap align-items-center gap-2 px-0 bg-transparent"><span class="badge text-bg-${n ? 'secondary' : 'success'}">${n ? 'respaldo ' + n : 'principal'}</span><b>${esc(c.nombre)}</b><span class="font-monospace text-body-secondary">${esc(c.prefijo)}…</span><span class="ms-auto d-flex gap-1">${k === 'higgsfield' ? '' : `<button class="btn btn-sm btn-outline-secondary" data-ktest="${k}" data-i="${n}">Probar</button>`}<button class="btn btn-sm btn-outline-danger" data-kdel="${c.id}" data-n="${esc(c.nombre)}">Quitar</button></span><span class="w-100 small" data-kres="${k}${n}"></span></li>`).join('')}</ul>` : '<div class="small text-body-secondary">Sin claves guardadas aquí.</div>'}</div>`).join('')}
        <form class="row g-2 align-items-end" data-kadd>
          <div class="col-sm-3"><label class="form-label small mb-1">Proveedor</label><select class="form-select" name="proveedor"><option value="gemini">Gemini</option><option value="claude">Claude</option></select></div>
          <div class="col-sm-3"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="nombre" maxlength="60" placeholder="ej. Gemini principal"></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Clave</label><input class="form-control font-monospace" type="password" name="clave" autocomplete="off" required placeholder="AIza…, AQ.… o sk-ant-…"></div>
          <div class="col-sm-2"><button class="btn btn-primary w-100" ${m.cifrado ? '' : 'disabled'}><i class="bi bi-plus-lg me-1"></i>Agregar</button></div></form>
        <p class="small text-body-secondary mt-3 mb-0">Dónde sacarlas: Gemini en aistudio.google.com → Get API key · Claude en console.anthropic.com → API keys. Después de agregar, elige el proveedor arriba, toca «Guardar» y «Probar el elegido».</p></div>
      <div class="dw-card mt-3"><h2 class="h6"><i class="bi bi-camera-reels me-1"></i>Video (Higgsfield)${SERV.higgsfield.claves.length ? ' <span class="badge text-bg-success ms-1">Clave lista</span>' : ' <span class="badge text-bg-danger ms-1">Falta la clave</span>'}</h2>
        <p class="small text-body-secondary">Con esta clave los agentes y la pestaña <b>Videos</b> de Diwilo Admin crean videos para redes. Pega la clave completa de open.higgsfield.ai/api-keys, con la forma <code>id:secreto</code> (los dos textos separados por dos puntos). Se guarda cifrada y no se vuelve a mostrar.</p>
        ${m.cifrado ? '' : '<div class="alert alert-warning small">Falta el secreto maestro <code>CLAVES_KEK</code> en Diwilo Modulos (<code>npx wrangler secret put CLAVES_KEK</code>).</div>'}
        ${SERV.higgsfield.claves.length ? `<ul class="list-group list-group-flush small mb-2">${SERV.higgsfield.claves.map((c) => `<li class="list-group-item d-flex flex-wrap align-items-center gap-2 px-0 bg-transparent"><b>${esc(c.nombre)}</b><span class="font-monospace text-body-secondary">${esc(c.prefijo)}…</span><button class="btn btn-sm btn-outline-danger ms-auto" data-kdel="${c.id}" data-n="${esc(c.nombre)}">Quitar</button></li>`).join('')}</ul>` : ''}
        <form class="row g-2 align-items-end" data-hadd>
          <div class="col-sm-3"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="nombre" maxlength="60" placeholder="ej. Higgsfield principal"></div>
          <div class="col-sm-7"><label class="form-label small mb-1">Clave (id:secreto)</label><input class="form-control font-monospace" type="password" name="clave" autocomplete="off" required placeholder="xxxxxxxx-xxxx-…:xxxxxxxx…"></div>
          <div class="col-sm-2"><button class="btn btn-primary w-100" ${m.cifrado ? '' : 'disabled'}><i class="bi bi-plus-lg me-1"></i>Guardar</button></div></form></div>`;
    const val = (n) => el.querySelector(`[name=${n}]`).value.trim(), elegido = () => el.querySelector('[name=prov]:checked')?.value;
    el.querySelector('[data-save]').onclick = async () => {
      try { await api(`${B}/proveedor`, { method: 'PUT', body: { proveedor: elegido(), modelo_claude: val('modelo_claude'), modelo_gemini: val('modelo_gemini') } }); toast('Guardado: ya responde con el modelo elegido'); modelo(el); }
      catch (x) { toast(x.message, false); }
    };
    el.querySelector('[data-kadd]').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try { await api(`${B}/proveedor/claves`, { method: 'POST', body: { proveedor: f.proveedor.value, nombre: f.nombre.value, clave: f.clave.value } }); toast('Clave guardada (cifrada)'); modelo(el); }
      catch (x) { toast(x.message, false); }
    };
    el.querySelector('[data-hadd]').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try { await api(`${B}/proveedor/claves`, { method: 'POST', body: { proveedor: 'higgsfield', nombre: f.nombre.value, clave: f.clave.value } }); toast('Clave de Higgsfield guardada (cifrada)'); modelo(el); }
      catch (x) { toast(x.message, false); }
    };
    el.onclick = async (e) => {
      const d = e.target.closest('[data-kdel]'), t = e.target.closest('[data-ktest]');
      if (d) {
        if (!(await confirm({ title: `¿Quitar la clave «${d.dataset.n}»?`, text: 'Si era la única de su proveedor, ese proveedor dejará de responder.', ok: 'Quitar' }))) return;
        try { await api(`${B}/proveedor/claves/${d.dataset.kdel}`, { method: 'DELETE' }); toast('Clave quitada'); modelo(el); } catch (x) { toast(x.message, false); }
      } else if (t) {
        const res = el.querySelector(`[data-kres="${t.dataset.ktest}${t.dataset.i}"]`); res.textContent = 'Probando…';
        try { const r = await api(`${B}/proveedor/probar`, { method: 'POST', body: { proveedor: t.dataset.ktest, indice: Number(t.dataset.i) } }); res.innerHTML = r.ok ? `<span class="text-success">✓ responde (${r.ms} ms)</span>` : `<span class="text-danger">✕ ${esc(r.error || 'no responde')}</span>`; }
        catch (x) { res.innerHTML = `<span class="text-danger">✕ ${esc(x.message)}</span>`; }
      }
    };
    el.querySelector('[data-test]').onclick = async () => {
      const res = el.querySelector('[data-res]'); res.textContent = 'Probando…';
      try { const r = await api(`${B}/proveedor/probar`, { method: 'POST', body: { proveedor: elegido() } }); res.innerHTML = r.ok ? `<span class="text-success">✓ ${esc(r.proveedor)} · ${esc(r.modelo)} respondió en ${r.ms} ms</span>` : `<span class="text-danger">✕ ${esc(r.proveedor)}: ${esc(r.error || 'no respondió')}</span>`; }
      catch (x) { res.innerHTML = `<span class="text-danger">✕ ${esc(x.message)}</span>`; }
    };
  }

  /* ================= Conexiones: MCP, claves de API y webhooks ================= */
  async function conexiones(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let tk, claves = [];
    try { tk = await api('/api/ia/tokens').catch(() => null); if (me.canManage) claves = (await api(`${B}/claves`)).rows; } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const { tokens, url } = tk || { tokens: [], url: '' }, host = location.origin;   // sin tokens MCP (p. ej. dentro de Diwilo Admin) solo salen las claves de API
    el.innerHTML = `<div class="dw-card mb-3"><h2 class="h6">Asistente externo (MCP)</h2>
        <p class="small text-body-secondary mb-2">Con una conexión, tu asistente (Claude u otro compatible con MCP) puede consultar y registrar datos de este negocio con <b>tu mismo rol</b>. Antes de cambiar algo, el asistente te pide confirmación, y todo queda en la bitácora.</p>
        <div class="small mb-3">${tk ? `Dirección del servidor: <code>${esc(url)}</code>` : 'Las conexiones MCP se crean desde cada app (aquí no aplican).'}</div>
        ${CAN && tk ? '<form class="d-flex gap-2 needs-validation" data-new novalidate><input class="form-control" name="name" placeholder="Nombre (ej. «Claude de Ana»)" maxlength="60" required aria-label="Nombre de la conexión"><button class="btn btn-primary text-nowrap"><i class="bi bi-plus-lg me-1"></i>Crear conexión</button></form>' : ''}</div>
      <div class="dw-card p-0 p-md-2 mb-3" data-list></div>
      ${me.canManage ? `<div class="dw-card mb-3"><h2 class="h6">API del negocio</h2><p class="small text-body-secondary mb-2">Lee tus conversaciones y contactos desde otros sistemas con una clave (solo lectura).</p>
        ${CAN ? '<form class="d-flex gap-2 mb-3" data-key><input class="form-control" name="nombre" placeholder="Nombre de la clave (ej. «Mi CRM»)" maxlength="60" required aria-label="Nombre de la clave"><button class="btn btn-primary text-nowrap"><i class="bi bi-key me-1"></i>Crear clave</button></form>' : ''}<div data-newkey></div>
        <div class="table-responsive"><table class="table table-sm align-middle mb-3"><thead><tr><th>Clave</th><th>Creada</th><th>Último uso</th><th></th></tr></thead><tbody>${claves.length ? claves.map((k) => `<tr ${k.revocada ? 'class="opacity-50"' : ''}><td>${esc(k.nombre)} <span class="font-monospace small text-body-secondary">${esc(k.prefijo)}…</span></td><td>${esc(fecha(k.created_at))}</td><td>${k.last_used ? esc(fecha(k.last_used, true)) : 'Nunca'}</td><td class="text-end">${k.revocada ? '<span class="badge text-bg-secondary">revocada</span>' : CAN ? `<button class="btn btn-sm btn-outline-danger" data-rev="${k.id}" data-n="${esc(k.nombre)}">Revocar</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="4" class="text-body-secondary">Sin claves.</td></tr>'}</tbody></table></div>
        <pre class="small p-2 rounded-3 mb-0" style="white-space:pre-wrap;background:rgba(var(--bs-body-color-rgb),.06)">GET ${esc(host)}/v1/conversaciones?desde=&lt;ms&gt;&amp;limite=100
GET ${esc(host)}/v1/conversaciones/&lt;id&gt;      mensajes de una conversación
GET ${esc(host)}/v1/contactos?desde=&lt;ms&gt;      leads y clientes de Marketing

curl -H "Authorization: Bearer dwi_xxx" ${esc(host)}/v1/conversaciones</pre></div>
      <div class="dw-card"><h2 class="h6">Webhooks</h2><p class="small text-body-secondary mb-0">Cada chat puede avisar a otro sistema cuando alguien empieza a chatear (<code>chat_iniciado</code>) o deja sus datos (<code>lead_capturado</code>). Se configura en el chat: pestaña Chats → Ajustes → Webhook, y ahí mismo lo puedes probar.</p></div>` : ''}`;
    $('[data-list]', el).innerHTML = tokens.length ? table([
      { label: 'Conexión', main: true, html: (t) => `${esc(t.name)}<div class="small text-body-secondary fw-normal">${esc(t.email)}</div>` }, { label: 'Creada', html: (t) => fecha(t.created_at) },
      { label: 'Último uso', html: (t) => (t.last_used_at ? fecha(t.last_used_at, true) : 'Nunca') },
      { label: 'Estado', html: (t) => (t.revoked_at ? '<span class="badge text-bg-secondary">Revocada</span>' : '<span class="badge text-bg-success">Activa</span>') },
      { label: '', cls: 'text-end', html: (t) => (t.revoked_at || !CAN ? '' : `<button class="btn btn-sm btn-outline-danger" data-revoke="${esc(t.id)}" data-name="${esc(t.name)}">Revocar</button>`) },
    ], tokens) : empty('bi-plug', 'Aún no hay conexiones de IA.');
    const f = $('[data-new]', el);
    if (f) f.onsubmit = async (e) => {
      e.preventDefault(); f.classList.add('was-validated'); if (!f.checkValidity()) return;
      try {
        const r = await api('/api/ia/tokens', { method: 'POST', body: { name: f.name.value } });
        const { el: mo } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Conexión creada</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><p class="small">Copia el token ahora: <b>no se vuelve a mostrar</b>. Si lo pierdes, revoca esta conexión y crea otra.</p>
          <div class="input-group mb-3"><input class="form-control font-monospace small" readonly value="${esc(r.token)}"><button class="btn btn-primary" data-copy aria-label="Copiar token"><i class="bi bi-clipboard"></i></button></div>
          <p class="small text-body-secondary mb-1">En tu asistente agrega un servidor MCP remoto con:</p><ul class="small text-body-secondary mb-0"><li>URL: <code>${esc(r.url)}</code></li><li>Encabezado: <code>Authorization: Bearer &lt;token&gt;</code></li></ul></div>`);
        mo.querySelector('[data-copy]').onclick = () => copiar(r.token);
        conexiones(el);
      } catch (x) { toast(x.message, false); }
    };
    $('[data-list]', el).onclick = async (e) => {
      const b = e.target.closest('[data-revoke]');
      if (!b || !(await confirm({ title: `¿Revocar «${b.dataset.name}»?`, text: 'El asistente conectado con ese token dejará de tener acceso de inmediato.', ok: 'Revocar' }))) return;
      try { await api(`/api/ia/tokens/${b.dataset.revoke}`, { method: 'DELETE' }); toast('Conexión revocada'); conexiones(el); } catch (x) { toast(x.message, false); }
    };
    const kf = $('[data-key]', el);
    if (kf) kf.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api(`${B}/claves`, { method: 'POST', body: { nombre: kf.nombre.value } });
        $('[data-newkey]', el).innerHTML = `<div class="alert alert-success small"><div class="mb-1">Copia esta clave ahora, no se volverá a mostrar:</div><div class="input-group"><input class="form-control font-monospace small" readonly value="${esc(r.key)}"><button class="btn btn-primary" data-cpk><i class="bi bi-clipboard"></i></button></div></div>`;
        $('[data-cpk]', el).onclick = () => copiar(r.key); kf.reset();
      } catch (x) { toast(x.message, false); }
    };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rev]'); if (!b) return;
      if (!(await confirm({ title: `¿Revocar la clave «${b.dataset.n}»?`, text: 'Los sistemas que la usan dejarán de funcionar.', ok: 'Revocar' }))) return;
      try { await api(`${B}/claves/${b.dataset.rev}`, { method: 'DELETE' }); toast('Clave revocada'); conexiones(el); } catch (x) { toast(x.message, false); }
    });
  }

  segBtn($('[data-seg]'), VIEWS, (k) => { view = k; render(); }, view);
  render();
});

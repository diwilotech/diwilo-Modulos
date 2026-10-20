// IA: el módulo general de IA del negocio. Chats de clientes (se despliegan en tarjetas, webs y demás), conversaciones, asistente,
// agentes, plantillas, consumo, conexiones (MCP, claves de API y webhooks) y bitácora. Reemplaza a «Configuración».
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
  const C = window.App.Crud;
  const B = '/api/ai', M = '/api/marca';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CAN = me.canManage && !me.business.readOnly;
  const VIEWS = [['chats', 'Chats', 'bi-chat-dots'], ['conversaciones', 'Conversaciones', 'bi-chat-left-text'], ['asistente', 'Asistente', 'bi-stars'], ['agentes', 'Agentes', 'bi-lightning-charge'],
    ['plantillas', 'Plantillas', 'bi-file-earmark-text'], ['consumo', 'Consumo', 'bi-speedometer2'], ['conexiones', 'Conexiones', 'bi-plug'], ...(me.canManage ? [['bitacora', 'Bitácora', 'bi-journal-text']] : [])];
  let view = (location.hash || '#chats').slice(1), filtroChat = null;
  if (!VIEWS.some(([k]) => k === view)) view = 'chats';
  const hasMkt = me.modules.some((m) => m.id === 'marketing');
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { prompt('Copia el texto:', t); } };
  const ago = (ts) => (ts ? fecha(ts, true) : '—');

  function render() {
    history.replaceState(null, '', `#${view}`);
    const old = $('[data-view]'), el = old.cloneNode(false); old.replaceWith(el);
    ({ chats, conversaciones, asistente, agentes, plantillas, consumo, conexiones, bitacora })[view](el);
  }
  const go = (k) => { view = k; $$('[data-seg] .btn').forEach((b) => b.classList.toggle('active', b.dataset.k === k)); render(); };

  /* ================= Chats de clientes ================= */
  async function chats(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let rows;
    try { rows = (await api(`${B}/chats`)).rows; } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Cada chat atiende a tus clientes con IA, usa el tono de tu marca y guarda sus conversaciones. Lo puedes mostrar en <b>tarjetas de presentación</b>
        (${hasMkt ? 'Marketing → Tarjetas' : 'con Marketing'}), en tu <b>web</b> o compartir su enlace. Puedes tener varios: soporte, ventas, una landing…</div>
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
          <div class="small text-body-secondary"><i class="bi bi-person-vcard me-1"></i>En una <b>tarjeta de presentación</b>: ${hasMkt ? 'Marketing → Tarjetas → editar la tarjeta → «Chat de IA de la tarjeta».' : 'necesitas el módulo Marketing.'}</div></div>`, { size: 'modal-lg' }).el
        .addEventListener('click', (e) => { const b = e.target.closest('[data-cp]'); if (b) copiar(piezas[+b.dataset.cp][1]); });
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return editar(null);
      const card = e.target.closest('[data-id]'); if (!card) return;
      const c = rows.find((x) => String(x.id) === card.dataset.id);
      if (e.target.closest('[data-edit]')) return editar(c);
      if (e.target.closest('[data-code]')) return codigo(c);
      if (e.target.closest('[data-conv]')) { filtroChat = c.id; return go('conversaciones'); }
      if (e.target.closest('[data-hook]')) { try { const r = await api(`${B}/chats/${c.id}/webhook-prueba`, { method: 'POST' }); toast(r.ok ? 'Evento de prueba enviado' : `El webhook no respondió: ${r.error || r.status}`, !!r.ok); } catch (x) { toast(x.message, false); } }
    };
  }

  /* ================= Conversaciones ================= */
  async function conversaciones(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let rows, cs;
    try { [rows, cs] = await Promise.all([api(`${B}/conversaciones${filtroChat ? `?chat=${filtroChat}` : ''}`).then((r) => r.rows), api(`${B}/chats`).then((r) => r.rows)]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3 align-items-center"><select class="form-select w-auto" data-chat><option value="">Todos los chats</option>${cs.map((c) => `<option value="${c.id}" ${filtroChat === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
        <span class="small text-body-secondary">${rows.length} conversación${rows.length === 1 ? '' : 'es'}</span></div>
      <div class="row g-3"><div class="col-lg-5"><div class="d-grid gap-2" data-list style="max-height:70vh;overflow:auto">${rows.length ? rows.map((v) => `<button class="btn text-start border p-2" data-id="${esc(v.id)}"><span class="d-block text-truncate fw-semibold">${esc(v.primero || '(sin mensajes)')}</span>
          <span class="small text-body-secondary">${esc(v.chat)} · ${esc(ago(v.last_at))} · ${v.msg_count} mensajes${v.dispositivo ? ` · ${esc(v.dispositivo)}` : ''}${v.lead_id ? ' · <b>lead</b>' : ''}</span></button>`).join('') : empty('bi-chat-left-text', 'Aún no hay conversaciones.')}</div></div>
        <div class="col-lg-7"><div class="dw-card" data-conv><p class="text-body-secondary mb-0">Elige una conversación.</p></div></div></div>`;
    $('[data-chat]', el).onchange = (e) => { filtroChat = Number(e.target.value) || null; conversaciones(el); };
    $('[data-list]', el).onclick = async (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      $$('[data-id]', el).forEach((x) => x.classList.toggle('border-primary', x === b));
      const box = $('[data-conv]', el); box.innerHTML = '<p class="text-body-secondary mb-0">Cargando…</p>';
      try {
        const d = await api(`${B}/conversaciones/${encodeURIComponent(b.dataset.id)}`);
        box.innerHTML = `<div class="d-flex align-items-center mb-2"><div class="flex-grow-1 small text-body-secondary">${esc(ago(d.conversacion.started_at))}${d.conversacion.pagina ? ` · ${esc(d.conversacion.pagina.slice(0, 60))}` : ''}${d.conversacion.pais ? ` · ${esc(d.conversacion.pais)}` : ''}</div>${CAN ? '<button class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash"></i></button>' : ''}</div>
          <div class="d-flex flex-column gap-2" style="max-height:60vh;overflow:auto">${d.mensajes.map((m) => `<div class="p-2 px-3 rounded-4 ${m.rol === 'user' ? 'align-self-end text-white' : 'align-self-start'}" style="max-width:85%;white-space:pre-wrap;${m.rol === 'user' ? 'background:var(--dw-p)' : 'background:rgba(var(--bs-body-color-rgb),.08)'}">${esc(m.contenido)}<div style="font-size:.7rem;opacity:.65">${esc(fecha(m.ts, true))}</div></div>`).join('')}</div>`;
        $('[data-del]', box)?.addEventListener('click', async () => {
          if (!(await confirm({ title: '¿Borrar esta conversación?', text: 'No se puede deshacer.', ok: 'Borrar' }))) return;
          try { await api(`${B}/conversaciones/${encodeURIComponent(b.dataset.id)}`, { method: 'DELETE' }); toast('Conversación borrada'); conversaciones(el); } catch (x) { toast(x.message, false); }
        });
      } catch (x) { box.innerHTML = `<p class="text-danger mb-0">${esc(x.message)}</p>`; }
    };
  }

  /* ================= Asistente del negocio ================= */
  let hist = [];
  function asistente(el) {
    const pintarPasos = (pasos) => (pasos?.length ? `<details class="mt-1"><summary class="small text-body-secondary" style="cursor:pointer">Lo que consultó (${pasos.length})</summary><ul class="small mb-0 ps-3">${pasos.map((p) => `<li><code>${esc(p.herramienta)}</code> ${esc(p.estado)}${p.resultado ? ` · ${esc(String(p.resultado).slice(0, 120))}` : ''}</li>`).join('')}</ul></details>` : '');
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Pregúntale a la IA por los datos de tu negocio (clientes, ventas, cuentas…). Consulta con las herramientas de tus módulos activos; si quiere <b>crear o cambiar</b> algo, te lo propone y tú lo apruebas.</div>
      <div class="d-flex flex-wrap gap-2 mb-3" data-flujos></div>
      <div class="dw-card"><div data-log class="d-flex flex-column gap-2 mb-3" style="min-height:160px;max-height:55vh;overflow:auto"></div>
        <form class="d-flex gap-2" data-f><input class="form-control" name="q" maxlength="2000" placeholder="Ej.: ¿Cuántos leads nuevos tuve esta semana?" autocomplete="off" required aria-label="Pregunta"><button class="btn btn-primary text-nowrap"><i class="bi bi-send me-1"></i>Preguntar</button><button type="button" class="btn btn-light" data-clear title="Empezar de nuevo"><i class="bi bi-eraser"></i></button></form></div>`;
    // Flujos sugeridos: salen de la guía de cada módulo (el mismo estándar del MCP y de los agentes)
    api(`${B}/guias`).then((r) => {
      const fl = r.modulos.flatMap((g) => g.flujos.map((f) => ({ ...f, modulo: g.nombre })));
      $('[data-flujos]', el).innerHTML = fl.length ? `<span class="small text-body-secondary align-self-center"><i class="bi bi-diagram-3 me-1"></i>Flujos:</span>${fl.map((f, i) => `<button type="button" class="btn btn-sm btn-outline-secondary" data-fl="${i}" title="${esc(f.descripcion)}">${esc(f.modulo)} · ${esc(f.nombre)}</button>`).join('')}` : '';
      $('[data-flujos]', el).onclick = (e) => { const b = e.target.closest('[data-fl]'); if (b) { const q = $('[data-f] [name=q]', el); q.value = fl[+b.dataset.fl].prompt; q.focus(); } };
    }).catch(() => {});
    const log = $('[data-log]', el);
    const burbuja = (rol, html) => { const d = document.createElement('div'); d.className = `p-2 px-3 rounded-4 ${rol === 'user' ? 'align-self-end text-white' : 'align-self-start'}`; d.style.cssText = `max-width:90%;white-space:pre-wrap;${rol === 'user' ? 'background:var(--dw-p)' : 'background:rgba(var(--bs-body-color-rgb),.08)'}`; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
    for (const m of hist) burbuja(m.role, m.role === 'user' ? esc(m.content) : esc(m.content) + (m.pasosHtml || ''));
    if (!hist.length) burbuja('assistant', `¡Hola! Soy la IA de ${esc(me.business.name)}. ¿Qué quieres saber o hacer?`);
    $('[data-clear]', el).onclick = () => { hist = []; asistente(el); };
    $('[data-f]', el).onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, q = f.q.value.trim(); if (!q) return; f.q.value = '';
      hist.push({ role: 'user', content: q }); burbuja('user', esc(q));
      const w = burbuja('assistant', '<span class="text-body-secondary">Pensando…</span>'); f.querySelector('.btn-primary').disabled = true;
      try {
        const r = await api(`${B}/asistente`, { method: 'POST', body: { mensajes: hist.map(({ role, content }) => ({ role, content })) } });
        const props = r.pasos.filter((p) => p.estado === 'propuesta');
        const pasosHtml = pintarPasos(r.pasos.filter((p) => p.estado !== 'propuesta'));
        w.innerHTML = esc(r.respuesta) + pasosHtml;
        hist.push({ role: 'assistant', content: r.respuesta, pasosHtml });
        for (const p of props) {
          const card = document.createElement('div'); card.className = 'border rounded-3 p-2 mt-2 bg-body';
          card.innerHTML = `<div class="small"><b><i class="bi bi-hourglass-split me-1"></i>Propuesta:</b> <code>${esc(p.herramienta)}</code></div><pre class="small mb-2" style="white-space:pre-wrap">${esc(JSON.stringify(p.args, null, 2))}</pre>
            <div class="d-flex gap-2"><button class="btn btn-sm btn-primary" data-ok>Aprobar</button><button class="btn btn-sm btn-light" data-no>Descartar</button></div>`;
          w.appendChild(card);
          $('[data-no]', card).onclick = () => card.remove();
          $('[data-ok]', card).onclick = async (ev) => {
            ev.target.disabled = true;
            try { await api(`${B}/asistente/aprobar`, { method: 'POST', body: { herramienta: p.herramienta, args: p.args } }); card.innerHTML = '<span class="small text-success"><i class="bi bi-check-lg me-1"></i>Hecho</span>'; }
            catch (x) { card.innerHTML = `<span class="small text-danger">${esc(x.message)}</span>`; }
          };
        }
      } catch (x) { w.innerHTML = `<span class="text-danger">${esc(x.message)}</span>`; hist.pop(); }
      f.querySelector('.btn-primary').disabled = false; log.scrollTop = log.scrollHeight;
    };
  }

  /* ================= Agentes ================= */
  const PROG = { manual: 'Cuando yo lo pida', diario: 'Todos los días', semanal: 'Los lunes' }, AUTO = { proponer: 'Propone y yo apruebo', ejecutar: 'Ejecuta solo' };
  async function agentes(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let rows, herr, st, flujos;
    try { [rows, herr, st, flujos] = await Promise.all([api(`${B}/agentes`).then((r) => r.rows), api(`${B}/herramientas`).then((r) => r.herramientas), CAN ? api(M).then((r) => r.starters.agente) : [], CAN ? api(`${B}/guias`).then((r) => r.modulos.flatMap((g) => g.flujos.map((f) => ({ ...f, modulo: g.nombre })))).catch(() => []) : []]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Un <b>agente</b> es una IA que trabaja sola con las herramientas de tus módulos: revisa, prepara y propone. Corre cuando tú lo pidas, cada día o cada lunes.
        Lo que <b>escribe</b> (crear contactos, tareas…) queda como propuesta para que tú la apruebes, o se ejecuta solo si así lo configuras.</div>
      ${CAN ? '<div class="mb-3 d-flex flex-wrap gap-2 align-items-center"><button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nuevo agente</button>' + (st.length ? `<span class="small text-body-secondary">o empieza con:</span>${st.map((s, i) => `<button class="btn btn-sm btn-outline-primary" data-st="${i}">${esc(s.nombre)}</button>`).join('')}` : '') + '</div>' + (flujos.length ? `<div class="mb-3 d-flex flex-wrap gap-2 align-items-center"><span class="small text-body-secondary"><i class="bi bi-diagram-3 me-1"></i>Desde un flujo de tus módulos:</span>${flujos.map((f, i) => `<button class="btn btn-sm btn-outline-secondary" data-fl="${i}" title="${esc(f.descripcion)}">${esc(f.modulo)} · ${esc(f.nombre)}</button>`).join('')}</div>` : '') : ''}
      <div class="row g-3">${rows.length ? rows.map((a) => `<div class="col-lg-6"><div class="dw-card h-100 ${a.activo ? '' : 'opacity-75'}" data-id="${a.id}">
        <div class="d-flex align-items-start gap-2"><div class="flex-grow-1" style="min-width:0"><h2 class="h6 mb-0 text-truncate">${esc(a.nombre)}</h2><div class="small text-body-secondary">${PROG[a.programacion]} · ${AUTO[a.autonomia]} · ${a.herramientas.length} herramienta${a.herramientas.length === 1 ? '' : 's'}</div></div>
          ${a.ultima?.pendientes ? `<span class="badge text-bg-warning">${a.ultima.pendientes} por aprobar</span>` : ''}<span class="badge ${a.activo ? 'text-bg-success' : 'text-bg-secondary'}">${a.activo ? 'Activo' : 'Pausado'}</span></div>
        <p class="small text-body-secondary mt-2 mb-1" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(a.instrucciones)}</p>
        <div class="small">${a.ultima ? `<i class="bi bi-clock-history me-1"></i>${esc(ago(a.ultima.created_at))} · ${a.ultima.estado === 'error' ? '<span class="text-danger">con error</span>' : 'ok'}` : 'Aún no ha corrido'}</div>
        <div class="d-flex flex-wrap gap-1 mt-3">${CAN ? '<button class="btn btn-sm btn-primary" data-run><i class="bi bi-play-fill me-1"></i>Ejecutar ahora</button><button class="btn btn-sm btn-outline-primary" data-edit><i class="bi bi-pencil me-1"></i>Editar</button>' : ''}<button class="btn btn-sm btn-outline-primary" data-hist><i class="bi bi-clock-history me-1"></i>Historial</button></div></div></div>`).join('')
        : `<div class="col-12">${empty('bi-lightning-charge', 'Aún no tienes agentes.', CAN ? '<button class="btn btn-primary" data-new>Crear mi primer agente</button>' : '')}</div>`}</div>`;
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
      if (run) {
        run.disabled = true; run.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Trabajando…';
        try { const r = await api(`${B}/agentes/${a.id}/ejecutar`, { method: 'POST' }); toast(r.estado === 'error' ? `Terminó con error: ${r.resumen}` : r.pendientes ? `Listo: ${r.pendientes} propuesta(s) por aprobar` : 'Listo', r.estado !== 'error'); agentes(el); historial(a); } catch (x) { toast(x.message, false); agentes(el); }
      }
    };
  }

  /* ================= Plantillas de IA ================= */
  const CANAL = { chat: ['Chat del negocio', 'bi-chat-dots', 'Lo usan los chats de clientes que activan el tono de la marca.'], mcp: ['Asistente externo (MCP)', 'bi-plug', 'Lo lee tu asistente externo (Claude u otro) con la herramienta «guía de marca».'],
    agente: ['Agentes y automatizaciones', 'bi-lightning-charge', 'Instrucciones para los agentes de IA que trabajan solos.'] };
  async function plantillas(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let D; try { D = await api(M); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const rows = D.plantillas;
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Las <b>plantillas</b> son instrucciones reutilizables para la IA de tu negocio. El <b>tono</b> de tu marca (Marketing → Tarjetas → Marca) se aplica siempre a los chats.</div>
      <div class="row g-3">${Object.entries(CANAL).map(([k, [nombre, icono, ayuda]]) => `<div class="col-xl-4 col-md-6"><div class="dw-card h-100" data-canal="${k}">
        <div class="d-flex align-items-start gap-2 mb-2"><div class="flex-grow-1"><h2 class="h6 mb-0"><i class="bi ${icono} me-1"></i>${nombre}</h2><div class="small text-body-secondary">${ayuda}</div></div>${CAN ? `<button class="btn btn-sm btn-primary" data-new="${k}"><i class="bi bi-plus-lg me-1"></i>Agregar</button>` : ''}</div>
        <div class="d-grid gap-2" data-list></div>
        ${CAN ? `<div class="mt-3"><div class="small text-body-secondary mb-1">Empezar con un ejemplo</div><div class="d-flex flex-wrap gap-1">${D.starters[k].map((s, i) => `<button class="btn btn-sm btn-outline-primary" data-starter="${k}:${i}">${esc(s.nombre)}</button>`).join('')}</div></div>` : ''}
        <details class="mt-3"><summary class="small text-body-secondary" style="cursor:pointer">Lo que recibe la IA</summary><pre class="small mt-2 mb-0 p-2 rounded-3" style="white-space:pre-wrap;background:rgba(var(--bs-body-color-rgb),.06)" data-ctx>Cargando…</pre></details></div></div>`).join('')}</div>`;
    for (const k of Object.keys(CANAL)) {
      const box = $(`[data-canal="${k}"]`, el), list = rows.filter((r) => r.canal === k);
      $('[data-list]', box).innerHTML = list.length ? list.map((r) => `<div class="border rounded-3 p-2 d-flex gap-2 align-items-start ${r.activa ? '' : 'opacity-50'}" data-id="${r.id}">
          <div class="flex-grow-1" style="min-width:0"><div class="fw-semibold text-truncate">${esc(r.nombre)}</div><div class="small text-body-secondary" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(r.instrucciones)}</div></div>
          ${CAN ? `<div class="form-check form-switch m-0" title="Activa"><input class="form-check-input" type="checkbox" data-act ${r.activa ? 'checked' : ''} aria-label="Activa"></div><button class="btn btn-sm btn-outline-primary" data-edit aria-label="Editar"><i class="bi bi-pencil"></i></button>` : ''}</div>`).join('')
        : '<p class="small text-body-secondary mb-0">Aún no hay plantillas. Agrega una o empieza con un ejemplo.</p>';
      api(`${M}/ia/contexto?canal=${k}`).then((d) => { $('[data-ctx]', box).textContent = d.prompt; }).catch(() => {});
    }
    const editar = async (r, base) => {
      const v = await C.form({ title: r ? 'Editar plantilla' : 'Nueva plantilla', okText: 'Guardar', values: r || base || { canal: 'chat', activa: 1 },
        fields: [{ k: 'nombre', label: 'Nombre', required: true, full: true }, { k: 'canal', label: 'Para', type: 'select', options: Object.entries(CANAL).map(([k, x]) => [k, x[0]]) },
          { k: 'activa', label: 'Estado', type: 'bool', check: 'Activa' }, { k: 'instrucciones', label: 'Instrucciones para la IA', type: 'long', required: true, hint: 'máx. 2000 letras' }],
        onDelete: r ? async () => { await api(`${M}/plantillas/${r.id}`, { method: 'DELETE' }); } : null });
      if (v === null) return;
      if (v !== 'deleted') { try { await api(r ? `${M}/plantillas/${r.id}` : `${M}/plantillas`, { method: r ? 'PATCH' : 'POST', body: v }); toast('Plantilla guardada'); } catch (x) { toast(x.message, false); return; } }
      plantillas(el);
    };
    el.onclick = (e) => {
      const n = e.target.closest('[data-new]'); if (n) return editar(null, { canal: n.dataset.new, activa: 1 });
      const s = e.target.closest('[data-starter]'); if (s) { const [k, i] = s.dataset.starter.split(':'); return editar(null, { ...D.starters[k][+i], canal: k, activa: 1 }); }
      const ed = e.target.closest('[data-edit]'); if (ed) return editar(rows.find((x) => String(x.id) === ed.closest('[data-id]').dataset.id));
    };
    el.onchange = async (e) => {
      const sw = e.target.closest('[data-act]'); if (!sw) return;
      try { await api(`${M}/plantillas/${sw.closest('[data-id]').dataset.id}`, { method: 'PATCH', body: { activa: sw.checked } }); toast(sw.checked ? 'Plantilla activada' : 'Plantilla desactivada'); plantillas(el); } catch (x) { toast(x.message, false); sw.checked = !sw.checked; }
    };
  }

  /* ================= Consumo ================= */
  async function consumo(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let u; try { u = await api(`${B}/uso`); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const pct = Math.min(100, Math.round((u.hoy.calls / u.tope_dia) * 100)), max = Math.max(1, ...u.dias.map((d) => d.calls));
    const FUENTE = { chat: 'Chats de clientes', agente: 'Agentes', asistente: 'Asistente' }, n = (x) => Number(x || 0).toLocaleString('es-CO');
    el.innerHTML = `<div class="row g-3 mb-3"><div class="col-md-6"><div class="dw-card h-100"><div class="small text-body-secondary">Hoy</div><div class="fs-3 fw-bold">${n(u.hoy.calls)} <span class="fs-6 fw-normal text-body-secondary">de ${n(u.tope_dia)} llamadas</span></div>
        <div class="progress mt-2" style="height:8px"><div class="progress-bar ${pct > 85 ? 'bg-danger' : ''}" style="width:${pct}%"></div></div><div class="small text-body-secondary mt-2">Al llegar al tope, los chats responden con un aviso y pasan a WhatsApp. Se reinicia a la medianoche (hora de Colombia).</div></div></div>
        <div class="col-md-6"><div class="dw-card h-100"><div class="small text-body-secondary">Motor de IA</div><div class="fs-5 fw-semibold">${esc(u.motor)}</div><div class="small text-body-secondary mt-2">Tokens de hoy: ${n(u.hoy.tin)} de entrada · ${n(u.hoy.tout)} de salida. El consumo lo paga Diwilo dentro de tu plan.</div></div></div></div>
      <div class="row g-3"><div class="col-lg-7"><div class="dw-card"><h2 class="h6 mb-3">Últimos 30 días</h2>${u.dias.length ? `<div class="d-flex align-items-end gap-1" style="height:120px">${u.dias.map((d) => `<div title="${esc(d.day)}: ${n(d.calls)} llamadas" style="flex:1;min-width:3px;height:${Math.max(3, Math.round((d.calls / max) * 100))}%;background:var(--dw-p);border-radius:3px 3px 0 0"></div>`).join('')}</div><div class="d-flex justify-content-between small text-body-secondary mt-1"><span>${esc(u.dias[0].day)}</span><span>${esc(u.dias[u.dias.length - 1].day)}</span></div>` : '<p class="text-body-secondary mb-0">Aún no hay consumo.</p>'}</div></div>
        <div class="col-lg-5"><div class="dw-card"><h2 class="h6 mb-3">Por uso (30 días)</h2>${u.fuentes.length ? u.fuentes.map((f) => `<div class="d-flex justify-content-between small py-1 border-bottom"><span>${esc(FUENTE[f.fuente] || f.fuente)}</span><b>${n(f.calls)}</b></div>`).join('') : '<p class="text-body-secondary mb-0">Sin datos.</p>'}</div></div></div>`;
  }

  /* ================= Conexiones: MCP, claves de API y webhooks ================= */
  async function conexiones(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let tk, claves = [];
    try { tk = await api('/api/ia/tokens'); if (me.canManage) claves = (await api(`${B}/claves`)).rows; } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const { tokens, url } = tk, host = location.origin;
    el.innerHTML = `<div class="dw-card mb-3"><h2 class="h6">Asistente externo (MCP)</h2>
        <p class="small text-body-secondary mb-2">Con una conexión, tu asistente (Claude u otro compatible con MCP) puede consultar y registrar datos de este negocio con <b>tu mismo rol</b>. Antes de cambiar algo, el asistente te pide confirmación, y todo queda en la bitácora.</p>
        <div class="small mb-3">Dirección del servidor: <code>${esc(url)}</code></div>
        ${CAN ? '<form class="d-flex gap-2 needs-validation" data-new novalidate><input class="form-control" name="name" placeholder="Nombre (ej. «Claude de Ana»)" maxlength="60" required aria-label="Nombre de la conexión"><button class="btn btn-primary text-nowrap"><i class="bi bi-plus-lg me-1"></i>Crear conexión</button></form>' : ''}</div>
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

  /* ================= Bitácora ================= */
  async function bitacora(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let items; try { ({ items } = await api('/api/settings/bitacora')); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const ORIGEN = { app: 'App', mcp: 'IA (MCP)', diwilo: 'Diwilo' };
    el.innerHTML = `<div class="dw-card p-0 p-md-2">${items.length ? table([{ label: 'Cuándo', html: (a) => fecha(a.created_at, true) }, { label: 'Quién', html: (a) => esc(a.email || '—') },
      { label: 'Qué', main: true, html: (a) => esc(a.accion) }, { label: 'Desde', html: (a) => `<span class="badge text-bg-light">${ORIGEN[a.origen] || esc(a.origen)}</span>` }], items) : empty('bi-journal-text', 'Aún no hay movimientos registrados.')}</div>`;
  }

  segBtn($('[data-seg]'), VIEWS, (k) => { view = k; render(); }, view);
  render();
});

// WhatsApp: bandejas de entrada (Cloud API de Meta), sus agentes de IA y las conversaciones.
// Ver: todo el equipo; configurar: propietario y administrador.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal, empty, fecha } = window.App;
  const B = '/api/whatsapp', CAN = me.canManage && !me.business.readOnly;
  const $ = (s, el = document) => el.querySelector(s);
  const VIEWS = [['bandejas', 'Bandejas'], ['agentes', 'Agentes de IA'], ['conversaciones', 'Conversaciones']];
  let view = (location.hash || '#bandejas').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'bandejas';
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { prompt('Copia el texto:', t); } };
  const cab = (t) => `<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${t}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>`;
  const campo = (n, l, v = '', extra = '') => `<label class="small text-body-secondary d-grid gap-1">${l}<input class="form-control" name="${n}" value="${esc(v)}" ${extra}></label>`;
  const hora = (ts) => (ts ? fecha(ts, true) : '—');

  function nav() {
    const el = $('[data-seg]'); el.className = 'd-flex flex-wrap gap-2 list-unstyled mb-3'; el.hidden = false;
    el.innerHTML = VIEWS.map(([k, l]) => `<button type="button" class="btn btn-sm btn-outline-secondary ${k === view ? 'active' : ''}" data-k="${k}">${esc(l)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; view = b.dataset.k; location.hash = view; nav(); render(); };
  }
  function render() { const old = $('[data-view]'), el = old.cloneNode(false); old.replaceWith(el); ({ bandejas, agentes, conversaciones })[view](el); }

  /* ---------- bandejas ---------- */
  async function bandejas(el) {
    let rows; try { rows = (await api(`${B}/bandejas`)).rows; } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Cada bandeja es un número de WhatsApp Business conectado por la Cloud API de Meta. Copia la <b>URL del webhook</b> y el <b>token de verificación</b> en Meta (WhatsApp → Configuración → Webhook) y suscríbete al campo <b>messages</b>.</div>
      ${CAN ? '<div class="mb-3"><button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nueva bandeja</button></div>' : ''}
      <div class="row g-3">${rows.length ? rows.map((b) => `<div class="col-lg-6"><div class="dw-card h-100" data-id="${b.id}">
        <div class="d-flex align-items-start gap-2"><i class="bi bi-whatsapp fs-4 text-success"></i><div class="flex-grow-1" style="min-width:0"><h2 class="h6 mb-0 text-truncate">${esc(b.nombre)}</h2><span class="small text-body-secondary">${esc(b.telefono)}</span></div>
          <span class="badge ${b.activo ? 'text-bg-success' : 'text-bg-secondary'}">${b.activo ? 'Activa' : 'En pausa'}</span></div>
        <div class="small mt-2 d-grid gap-1">
          <div>ID de número: <span class="font-monospace">${esc(b.phone_number_id)}</span> · Cuenta: <span class="font-monospace">${esc(b.waba_id)}</span></div>
          <div>Clave API: ${b.tiene_clave ? '<span class="text-success">guardada</span>' : '<span class="text-danger">falta</span>'}${b.tiene_secreto ? ' · firma del webhook validada' : ''}</div>
          <div class="d-flex align-items-center gap-1"><span class="text-body-secondary">URL del webhook</span><button class="btn btn-sm btn-link p-0 ms-auto" data-cp="${esc(b.webhook_url)}"><i class="bi bi-clipboard"></i> Copiar</button></div>
          <div class="font-monospace small text-break p-2 rounded-3" style="background:rgba(var(--bs-body-color-rgb),.06)">${esc(b.webhook_url)}</div>
          ${b.verify_token ? `<div class="d-flex align-items-center gap-1"><span class="text-body-secondary">Token de verificación</span><button class="btn btn-sm btn-link p-0 ms-auto" data-cp="${esc(b.verify_token)}"><i class="bi bi-clipboard"></i> Copiar</button></div>
          <div class="font-monospace small text-break p-2 rounded-3" style="background:rgba(var(--bs-body-color-rgb),.06)">${esc(b.verify_token)}</div>` : ''}</div>
        ${CAN ? `<div class="d-flex flex-wrap gap-1 mt-3"><button class="btn btn-sm btn-primary" data-edit><i class="bi bi-gear me-1"></i>Ajustes</button>
          <button class="btn btn-sm btn-outline-secondary" data-act>${b.activo ? 'Pausar' : 'Activar'}</button>
          <button class="btn btn-sm btn-outline-success" data-probar><i class="bi bi-patch-check me-1"></i>Probar conexión</button>
          <button class="btn btn-sm btn-outline-secondary" data-tok>Nuevo token</button><button class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash"></i></button></div>` : ''}</div></div>`).join('')
        : `<div class="col-12">${empty('bi-whatsapp', 'Aún no tienes bandejas. Conecta tu primer número de WhatsApp.', CAN ? '<button class="btn btn-primary" data-new>Crear mi primera bandeja</button>' : '')}</div>`}</div>`;
    const form = (b) => {
      const { el: mo, m: mm } = modal(`${cab(b ? 'Ajustes de la bandeja' : 'Nueva bandeja')}<form class="modal-body d-grid gap-3" autocomplete="off">
        ${campo('nombre', 'Nombre de la bandeja de entrada', b?.nombre, 'required maxlength="80" placeholder="Ventas"')}
        ${campo('telefono', 'Número de teléfono', b?.telefono || '+57', 'required placeholder="+57 300 123 4567" inputmode="tel"')}
        ${campo('phone_number_id', 'ID del número de teléfono', b?.phone_number_id, 'required inputmode="numeric"')}
        ${campo('waba_id', 'ID de la cuenta de WhatsApp Business', b?.waba_id, 'required inputmode="numeric"')}
        ${campo('api_key', 'Clave API (token de acceso de Meta)', '', `type="password" autocomplete="new-password" placeholder="${b?.tiene_clave ? 'Guardada — déjalo vacío para conservarla' : 'EAAG…'}"`)}
        ${campo('app_secret', 'Secreto de la app de Meta (opcional, valida la firma del webhook)', '', `type="password" autocomplete="new-password" placeholder="${b?.tiene_secreto ? 'Guardado — déjalo vacío para conservarlo' : ''}"`)}
        <button class="btn btn-primary">${b ? 'Guardar' : 'Crear bandeja'}</button></form>`);
      mo.querySelector('form').onsubmit = async (e) => {
        e.preventDefault(); const f = e.target, v = (n) => f[n].value.trim(), btn = f.querySelector('button'); btn.disabled = true;
        const core = { nombre: v('nombre'), telefono: v('telefono'), phone_number_id: v('phone_number_id'), waba_id: v('waba_id') };
        try {
          if (b) {
            await api(`${B}/bandejas/${b.id}`, { method: 'PATCH', body: core });
            const cred = {}; if (v('api_key')) cred.api_key = v('api_key'); if (v('app_secret')) cred.app_secret = v('app_secret');
            if (Object.keys(cred).length) await api(`${B}/bandejas/${b.id}/credenciales`, { method: 'POST', body: cred });
          } else await api(`${B}/bandejas`, { method: 'POST', body: { ...core, ...(v('api_key') ? { api_key: v('api_key') } : {}), ...(v('app_secret') ? { app_secret: v('app_secret') } : {}) } });
          mm.hide(); toast(b ? 'Bandeja guardada' : 'Bandeja creada'); render();
        } catch (x) { toast(x.message, false); btn.disabled = false; }
      };
    };
    // Verificador: revisa la clave y los IDs contra Meta y, si pones un número, manda un mensaje de prueba
    const probar = (b) => {
      const { el: mo } = modal(`${cab('Probar conexión')}<form class="modal-body d-grid gap-3">
        <p class="small text-body-secondary mb-0">Revisa la clave API, el ID del número y la cuenta con Meta. Si escribes un número, también le enviamos un mensaje de prueba (la plantilla «hello_world»).</p>
        ${campo('para', 'Número que recibe el mensaje de prueba (opcional)', '+57', 'placeholder="+57 300 123 4567" inputmode="tel"')}
        <button class="btn btn-success">Probar</button><div data-res></div></form>`);
      mo.querySelector('form').onsubmit = async (ev) => {
        ev.preventDefault(); const f = ev.target, btn = f.querySelector('button'), res = f.querySelector('[data-res]'), p = f.para.value.trim();
        btn.disabled = true; res.innerHTML = '<div class="small text-body-secondary">Probando…</div>';
        try {
          const r = await api(`${B}/bandejas/${b.id}/probar`, { method: 'POST', body: p.replace(/\D/g, '').length > 3 ? { para: p } : {} });
          res.innerHTML = `<div class="alert ${r.ok ? 'alert-success' : 'alert-danger'} small mb-2">${r.ok ? 'Todo bien: la bandeja está conectada.' : 'Hay algo por corregir.'}</div>`
            + r.pasos.map((x) => `<div class="small d-flex gap-2 mb-1"><i class="bi ${x.ok ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-danger'}"></i><div><b>${esc(x.nombre)}</b><div class="text-body-secondary">${esc(x.detalle)}</div></div></div>`).join('')
            + '<div class="small text-body-secondary mt-2">El webhook se verifica desde Meta (botón «Verificar y guardar»); los mensajes que lleguen aparecerán en Conversaciones.</div>';
        } catch (x) { res.innerHTML = `<div class="text-danger small">${esc(x.message)}</div>`; }
        btn.disabled = false;
      };
    };
    el.onclick = async (e) => {
      const cp = e.target.closest('[data-cp]'); if (cp) return copiar(cp.dataset.cp);
      if (e.target.closest('[data-new]')) return form(null);
      const card = e.target.closest('[data-id]'); if (!card) return;
      const b = rows.find((x) => x.id === +card.dataset.id), id = b.id;
      try {
        if (e.target.closest('[data-edit]')) form(b);
        else if (e.target.closest('[data-act]')) { await api(`${B}/bandejas/${id}`, { method: 'PATCH', body: { activo: !b.activo } }); toast(b.activo ? 'Bandeja en pausa' : 'Bandeja activada'); render(); }
        else if (e.target.closest('[data-probar]')) probar(b);
        else if (e.target.closest('[data-tok]')) { if (!(await confirm({ title: '¿Generar otro token?', text: 'Tendrás que ponerlo también en Meta o la verificación del webhook fallará.', ok: 'Generar' }))) return; await api(`${B}/bandejas/${id}/token`, { method: 'POST' }); toast('Token nuevo'); render(); }
        else if (e.target.closest('[data-del]')) { if (!(await confirm({ title: `¿Borrar «${b.nombre}»?`, text: 'Se borran también sus agentes y conversaciones. No se puede deshacer.', ok: 'Borrar' }))) return; await api(`${B}/bandejas/${id}`, { method: 'DELETE' }); toast('Bandeja borrada'); render(); }
      } catch (x) { toast(x.message, false); }
    };
  }

  /* ---------- agentes ---------- */
  async function agentes(el) {
    let rows, bands; try { [rows, bands] = await Promise.all([api(`${B}/agentes`).then((r) => r.rows), api(`${B}/bandejas`).then((r) => r.rows)]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const nom = (id) => bands.find((b) => b.id === id)?.nombre || '—';
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-robot me-1"></i>Un agente de IA contesta solo los mensajes de su bandeja con las instrucciones que le des. En cada bandeja responde <b>un solo agente</b> a la vez: al activar uno se apagan los otros. Desactívalo cuando quieras atender tú.</div>
      ${CAN && bands.length ? '<div class="mb-3"><button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nuevo agente</button></div>' : ''}
      <div class="row g-3">${rows.length ? rows.map((a) => `<div class="col-lg-6"><div class="dw-card h-100" data-id="${a.id}">
        <div class="d-flex align-items-start gap-2"><div class="flex-grow-1" style="min-width:0"><h2 class="h6 mb-0 text-truncate">${esc(a.nombre)}</h2><span class="small text-body-secondary"><i class="bi bi-whatsapp me-1"></i>${esc(nom(a.bandeja_id))}</span></div>
          ${CAN ? `<div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" data-sw aria-label="Activar agente" ${a.activo ? 'checked' : ''}></div>` : `<span class="badge ${a.activo ? 'text-bg-success' : 'text-bg-secondary'}">${a.activo ? 'Activo' : 'Apagado'}</span>`}</div>
        <p class="small text-body-secondary mt-2 mb-0" style="white-space:pre-wrap">${esc((a.instrucciones || 'Sin instrucciones: responde con el tono de la marca.').slice(0, 220))}</p>
        ${CAN ? '<div class="d-flex gap-1 mt-3"><button class="btn btn-sm btn-primary" data-edit><i class="bi bi-pencil me-1"></i>Editar</button><button class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash"></i></button></div>' : ''}</div></div>`).join('')
        : `<div class="col-12">${empty('bi-robot', bands.length ? 'Aún no tienes agentes de IA.' : 'Crea primero una bandeja para poder ponerle un agente.')}</div>`}</div>`;
    const form = (a) => {
      const { el: mo, m: mm } = modal(`${cab(a ? 'Editar agente' : 'Nuevo agente')}<form class="modal-body d-grid gap-3">
        ${campo('nombre', 'Nombre del agente', a?.nombre, 'required maxlength="80" placeholder="Asesor de ventas"')}
        <label class="small text-body-secondary d-grid gap-1">Bandeja<select class="form-select" name="bandeja_id" ${a ? 'disabled' : ''}>${bands.map((b) => `<option value="${b.id}" ${a?.bandeja_id === b.id ? 'selected' : ''}>${esc(b.nombre)} · ${esc(b.telefono)}</option>`).join('')}</select></label>
        <label class="small text-body-secondary d-grid gap-1">Instrucciones (qué sabe y cómo responde)<textarea class="form-control" name="instrucciones" rows="6" maxlength="4000" placeholder="Atiendes consultas sobre cursos. Horario: lunes a viernes 8-5. Si piden precio, ofrece que un asesor los contacte.">${esc(a?.instrucciones || '')}</textarea></label>
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="usar_marca" id="wam" ${!a || a.usar_marca ? 'checked' : ''}><label class="form-check-label small" for="wam">Usar el tono de la marca</label></div>
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="activo" id="waa" ${!a || a.activo ? 'checked' : ''}><label class="form-check-label small" for="waa">Activo (apaga el otro agente de la bandeja)</label></div>
        <button class="btn btn-primary">${a ? 'Guardar' : 'Crear agente'}</button></form>`);
      mo.querySelector('form').onsubmit = async (e) => {
        e.preventDefault(); const f = e.target, btn = f.querySelector('button'); btn.disabled = true;
        const body = { nombre: f.nombre.value.trim(), instrucciones: f.instrucciones.value, usar_marca: f.usar_marca.checked, activo: f.activo.checked };
        try { if (a) await api(`${B}/agentes/${a.id}`, { method: 'PATCH', body }); else await api(`${B}/agentes`, { method: 'POST', body: { ...body, bandeja_id: +f.bandeja_id.value } }); mm.hide(); toast('Agente guardado'); render(); }
        catch (x) { toast(x.message, false); btn.disabled = false; }
      };
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return form(null);
      const card = e.target.closest('[data-id]'); if (!card) return;
      const a = rows.find((x) => x.id === +card.dataset.id);
      try {
        if (e.target.closest('[data-edit]')) form(a);
        else if (e.target.closest('[data-del]')) { if (!(await confirm({ title: `¿Borrar «${a.nombre}»?`, text: 'No se puede deshacer.', ok: 'Borrar' }))) return; await api(`${B}/agentes/${a.id}`, { method: 'DELETE' }); toast('Agente borrado'); render(); }
      } catch (x) { toast(x.message, false); }
    };
    el.onchange = async (e) => {
      const sw = e.target.closest('[data-sw]'); if (!sw) return;
      const a = rows.find((x) => x.id === +sw.closest('[data-id]').dataset.id);
      try { await api(`${B}/agentes/${a.id}`, { method: 'PATCH', body: { activo: sw.checked } }); toast(sw.checked ? 'Agente activado' : 'Agente desactivado'); render(); } catch (x) { toast(x.message, false); sw.checked = !sw.checked; }
    };
  }

  /* ---------- conversaciones ---------- */
  async function conversaciones(el) {
    let rows; try { rows = (await api(`${B}/conversaciones`)).rows; } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="list-group">${rows.length ? rows.map((v, i) => `<button type="button" class="list-group-item list-group-item-action" data-i="${i}">
      <div class="d-flex justify-content-between gap-2"><b class="text-truncate">${esc(v.nombre || '+' + v.contacto)}</b><span class="small text-body-secondary text-nowrap">${esc(hora(v.ultimo))}</span></div>
      <div class="small text-body-secondary text-truncate">${esc(v.ultimo_texto || '')}</div><div class="small text-body-secondary">${esc(v.bandeja)} · ${v.mensajes} mensajes</div></button>`).join('') : empty('bi-chat-left-text', 'Aún no ha escrito nadie por WhatsApp.')}</div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return; const v = rows[+b.dataset.i];
      const { el: mo, m: mm } = modal(`${cab(esc(v.nombre || '+' + v.contacto))}<div class="modal-body"><div data-log class="d-grid gap-2" style="max-height:55vh;overflow:auto"></div>
        ${me.business.readOnly ? '' : `<form class="d-flex gap-2 mt-3" data-send><input class="form-control" name="texto" maxlength="4000" placeholder="Responder por WhatsApp…" required><button class="btn btn-primary">Enviar</button></form>`}
        ${CAN ? '<button class="btn btn-sm btn-outline-danger mt-3" data-del>Borrar conversación</button>' : ''}</div>`, { size: 'modal-lg' });
      const url = `${B}/conversaciones/${v.bandeja_id}/${v.contacto}`, log = mo.querySelector('[data-log]');
      const pintar = async () => {
        const ms = (await api(url)).mensajes;
        log.innerHTML = ms.map((m) => `<div class="p-2 rounded-3 ${m.rol === 'user' ? 'bg-body-secondary' : 'text-bg-success'}" style="max-width:85%;white-space:pre-wrap;${m.rol === 'user' ? '' : 'margin-left:auto'}">${esc(m.contenido)}<div class="small opacity-75">${m.rol === 'assistant' ? 'Agente IA' : m.rol === 'humano' ? 'Equipo' : ''} ${esc(hora(m.ts))}${m.estado && m.estado !== 'enviado' ? ` · ${m.estado === 'sin_clave' ? 'sin clave API' : 'no se envió'}` : ''}</div></div>`).join('');
        log.scrollTop = log.scrollHeight;
      };
      pintar().catch((x) => toast(x.message, false));
      const f = mo.querySelector('[data-send]');
      if (f) f.onsubmit = async (ev) => { ev.preventDefault(); const t = f.texto.value.trim(); if (!t) return; try { await api(`${B}/bandejas/${v.bandeja_id}/enviar`, { method: 'POST', body: { para: v.contacto, texto: t } }); f.texto.value = ''; } catch (x) { toast(x.message, false); } pintar(); };
      const d = mo.querySelector('[data-del]');
      if (d) d.onclick = async () => { if (!(await confirm({ title: '¿Borrar esta conversación?', text: 'No se puede deshacer.', ok: 'Borrar' }))) return; await api(url, { method: 'DELETE' }); mm.hide(); toast('Conversación borrada'); render(); };
    };
  }

  nav(); render();
});

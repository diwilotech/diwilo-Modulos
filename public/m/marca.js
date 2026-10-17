// Marca e IA: la marca del negocio (color, tipografía y tono de conversación) y las plantillas de su IA (chat y MCP).
// Ver: todo el equipo; cambiar: propietario y administrador. El color «de mi app» sigue a Configuración → Apariencia.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm } = window.App;
  const C = window.App.Crud;
  const B = '/api/marca';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CAN = me.canManage && !me.business.readOnly;
  const VIEWS = [['marca', 'Marca', 'bi-palette'], ['ia', 'Asistente IA', 'bi-robot'], ['kit', 'Usar en otros lados', 'bi-box-arrow-up-right']];
  const CANAL = { chat: ['Chat del negocio', 'bi-chat-dots', 'Lo usa el asistente de IA dentro de la app.'], mcp: ['Asistente externo (MCP)', 'bi-plug', 'Lo lee tu asistente externo (Claude u otro) con la herramienta «guía de marca».'],
    agente: ['Agentes y automatizaciones', 'bi-lightning-charge', 'Instrucciones para los agentes de IA que trabajan solos (seguimiento, recordatorios, publicaciones).'] };
  let D = null, view = 'marca';

  const load = async () => {
    try { D = await api(B); } catch (x) { $('[data-view]').innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    render();
  };
  const render = () => ({ marca, ia, kit })[view]($('[data-view]'));

  /* ---------- Marca ---------- */
  let fontsOn = false;
  const loadFonts = () => {
    if (fontsOn) return; fontsOn = true;
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${D.opciones.fuentes.map((f) => `family=${f.google}`).join('&')}&display=swap`;
    document.head.appendChild(l);
  };

  function marca(el) {
    loadFonts();
    const O = D.opciones, m = D.marca;
    const st = { color: m.color, tipografia: m.tipografia, tono: m.tono, tono_notas: m.tono_notas || '' };
    const temaApp = O.temas.find((t) => t.id === m.tema_app) || O.temas[0];
    const efectivo = () => O.temas.find((t) => t.id === (st.color === 'app' ? m.tema_app : st.color)) || temaApp;
    const dirty = () => ['color', 'tipografia', 'tono', 'tono_notas'].some((k) => st[k] !== (k === 'tono_notas' ? (m.tono_notas || '') : m[k]));

    el.innerHTML = `<div class="row g-3"><div class="col-lg-7 d-grid gap-3 align-content-start">
        <div class="dw-card"><h2 class="h6 mb-1">Color</h2><p class="small text-body-secondary mb-3">Lo ven tus clientes en las tarjetas de presentación y en lo que envías.</p>
          <div data-color></div></div>
        <div class="dw-card"><h2 class="h6 mb-1">Tipografía</h2><p class="small text-body-secondary mb-3">La letra de tus tarjetas y de lo que ven tus clientes.</p><div class="row g-2" data-fuentes></div></div>
        <div class="dw-card"><h2 class="h6 mb-1">Tono de conversación</h2><p class="small text-body-secondary mb-3">Cómo habla tu negocio. Lo usan el chat y los asistentes de IA al escribirle a tus clientes.</p>
          <div class="d-grid gap-2" data-tonos></div>
          <label class="form-label small mt-3 mb-1" for="mcNotas">Indicaciones propias <span class="text-body-secondary">(opcional)</span></label>
          <textarea class="form-control" id="mcNotas" rows="2" maxlength="500" placeholder="Ej.: Siempre despídete con «Un abrazo». No uses la palabra «problema»." ${CAN ? '' : 'disabled'}>${esc(st.tono_notas)}</textarea></div>
        ${CAN ? '<div class="d-flex align-items-center gap-2"><button class="btn btn-primary" data-save disabled><i class="bi bi-check-lg me-1"></i>Guardar marca</button><span class="small text-danger" data-err></span></div>'
          : '<p class="small text-body-secondary mb-0"><i class="bi bi-lock me-1"></i>Solo el propietario o un administrador cambia la marca.</p>'}
      </div>
      <div class="col-lg-5"><div class="position-sticky" style="top:76px"><div class="small text-body-secondary mb-2">Vista previa</div><div data-prev></div></div></div></div>`;

    const pintar = () => {
      const t = efectivo(), f = O.fuentes.find((x) => x.id === st.tipografia), tono = O.tonos.find((x) => x.id === st.tono);
      // Color
      $('[data-color]', el).innerHTML = `<button type="button" class="btn w-100 text-start d-flex align-items-center gap-3 p-3 mb-3 ${st.color === 'app' ? 'border-primary' : 'border'}" data-c="app" ${CAN ? '' : 'disabled'}
          style="${st.color === 'app' ? `outline:2px solid ${temaApp.color};outline-offset:1px` : ''}"><span class="rounded-circle d-grid flex-none" style="width:38px;height:38px;background:${temaApp.color};place-items:center;flex:none"><i class="bi bi-phone text-white"></i></span>
          <span><span class="fw-semibold d-block">Usar el color de mi app</span><span class="small text-body-secondary">Hoy: ${esc(temaApp.nombre)}. Si lo cambias en Configuración → Apariencia, cambia aquí también.</span></span></button>
        <div class="small text-body-secondary mb-2">O elige un color propio para tu marca</div>
        <div class="d-flex flex-wrap gap-3">${O.temas.map((x) => `<button type="button" class="btn p-0 text-center border-0" data-c="${x.id}" ${CAN ? '' : 'disabled'} title="${esc(x.nombre)}" aria-label="${esc(x.nombre)}" aria-pressed="${st.color === x.id}">
          <span class="rounded-circle d-grid mx-auto" style="width:40px;height:40px;background:${x.color};place-items:center;${st.color === x.id ? `outline:3px solid ${x.color};outline-offset:2px` : ''}">${st.color === x.id ? '<i class="bi bi-check-lg text-white"></i>' : ''}</span><span class="small d-block mt-1">${esc(x.nombre)}</span></button>`).join('')}</div>`;
      // Tipografía
      $('[data-fuentes]', el).innerHTML = O.fuentes.map((x) => `<div class="col-6 col-md-4"><button type="button" class="btn w-100 text-start p-3 border ${st.tipografia === x.id ? 'border-primary' : ''}" data-f="${x.id}" ${CAN ? '' : 'disabled'}
        style="${st.tipografia === x.id ? `outline:2px solid ${t.color};outline-offset:1px;` : ''}font-family:${x.familia}"><span class="d-block" style="font-size:1.6rem;line-height:1.1">Aa</span><span class="small">${esc(x.nombre)}</span></button></div>`).join('');
      // Tono
      $('[data-tonos]', el).innerHTML = O.tonos.map((x) => `<button type="button" class="btn text-start p-3 border ${st.tono === x.id ? 'border-primary' : ''}" data-t="${x.id}" ${CAN ? '' : 'disabled'}
        style="${st.tono === x.id ? `outline:2px solid ${t.color};outline-offset:1px` : ''}"><span class="fw-semibold">${esc(x.nombre)}</span><span class="d-block small text-body-secondary fst-italic">“${esc(x.ejemplo)}”</span></button>`).join('');
      // Vista previa
      const nombre = D.negocio.nombre || me.business.name || 'Tu negocio';
      $('[data-prev]', el).innerHTML = `<div class="dw-card p-0 overflow-hidden" style="font-family:${f.familia}">
        <div style="height:72px;background:linear-gradient(135deg,${t.color},#150B2B)"></div>
        <div class="p-3" style="margin-top:-30px"><span class="d-grid text-white fw-semibold" style="width:60px;height:60px;border-radius:50%;place-items:center;background:#150B2B;border:3px solid var(--bs-body-bg);font-size:1.2rem">${esc(nombre.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span>
          <div class="fw-semibold fs-5 mt-2">${esc(nombre)}</div><div class="small text-body-secondary">Tarjeta de presentación</div>
          <div class="d-grid gap-2 mt-3"><span class="btn text-white" style="background:${t.color};pointer-events:none"><i class="bi bi-whatsapp me-1"></i>Escríbenos</span><span class="btn border" style="pointer-events:none"><i class="bi bi-telephone me-1"></i>Llamar</span></div>
          <div class="mt-3 p-3 rounded-3" style="background:rgba(var(--bs-body-color-rgb),.06)"><div class="small text-body-secondary mb-1"><i class="bi bi-chat-dots me-1"></i>Así responde tu chat · ${esc(tono.nombre)}</div><div>${esc(tono.ejemplo)}</div></div></div></div>`;
      const b = $('[data-save]', el); if (b) b.disabled = !dirty();
    };
    pintar();
    $('[data-color]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { st.color = b.dataset.c; pintar(); } });
    $('[data-fuentes]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { st.tipografia = b.dataset.f; pintar(); } });
    $('[data-tonos]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { st.tono = b.dataset.t; pintar(); } });
    $('#mcNotas', el).addEventListener('input', (e) => { st.tono_notas = e.target.value; pintar(); });
    $('[data-save]', el)?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; $('[data-err]', el).textContent = '';
      try { await api(B, { method: 'PUT', body: st }); toast('Marca guardada'); await load(); }
      catch (x) { $('[data-err]', el).textContent = x.message; b.disabled = false; }
    });
  }

  /* ---------- Asistente IA: plantillas del chat y del MCP ---------- */
  function ia(el) {
    const rows = D.plantillas;
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Las <b>plantillas</b> son instrucciones para la IA de tu negocio. El <b>tono</b> de la pestaña Marca se aplica siempre.
        Para conectar tu asistente externo ve a Configuración → IA · Conexiones: allí creas el acceso y él lee esta guía con la herramienta <i>marca.guia_de_marca</i>.</div>
      <div class="row g-3">${Object.entries(CANAL).map(([k, [nombre, icono, ayuda]]) => `<div class="col-xl-4 col-md-6"><div class="dw-card h-100" data-canal="${k}">
        <div class="d-flex align-items-start gap-2 mb-2"><div class="flex-grow-1"><h2 class="h6 mb-0"><i class="bi ${icono} me-1"></i>${nombre}</h2><div class="small text-body-secondary">${ayuda}</div></div>
          ${CAN ? `<button class="btn btn-sm btn-primary" data-new="${k}"><i class="bi bi-plus-lg me-1"></i>Agregar</button>` : ''}</div>
        <div class="d-grid gap-2" data-list></div>
        ${CAN ? `<div class="mt-3"><div class="small text-body-secondary mb-1">Empezar con un ejemplo</div><div class="d-flex flex-wrap gap-1">${D.starters[k].map((s, i) => `<button class="btn btn-sm btn-outline-primary" data-starter="${k}:${i}">${esc(s.nombre)}</button>`).join('')}</div></div>` : ''}
        <details class="mt-3"><summary class="small text-body-secondary" style="cursor:pointer">Lo que recibe la IA</summary><pre class="small mt-2 mb-0 p-2 rounded-3" style="white-space:pre-wrap;background:rgba(var(--bs-body-color-rgb),.06)" data-ctx>Cargando…</pre></details></div></div>`).join('')}</div>`;
    for (const k of Object.keys(CANAL)) {
      const box = $(`[data-canal="${k}"]`, el), list = rows.filter((r) => r.canal === k);
      $('[data-list]', box).innerHTML = list.length ? list.map((r) => `<div class="border rounded-3 p-2 d-flex gap-2 align-items-start ${r.activa ? '' : 'opacity-50'}" data-id="${r.id}">
          <div class="flex-grow-1" style="min-width:0"><div class="fw-semibold text-truncate">${esc(r.nombre)}</div><div class="small text-body-secondary" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(r.instrucciones)}</div></div>
          ${CAN ? `<div class="form-check form-switch m-0" title="Activa"><input class="form-check-input" type="checkbox" data-act ${r.activa ? 'checked' : ''} aria-label="Activa"></div><button class="btn btn-sm btn-outline-primary" data-edit aria-label="Editar"><i class="bi bi-pencil"></i></button>` : ''}</div>`).join('')
        : '<p class="small text-body-secondary mb-0">Aún no hay plantillas. Agrega una o empieza con un ejemplo.</p>';
      api(`${B}/ia/contexto?canal=${k}`).then((d) => { $('[data-ctx]', box).textContent = d.prompt; }).catch(() => {});
    }
    const editar = async (r, base) => {
      const v = await C.form({ title: r ? 'Editar plantilla' : 'Nueva plantilla', okText: 'Guardar', values: r || base || { canal: 'chat', activa: 1 },
        fields: [{ k: 'nombre', label: 'Nombre', required: true, full: true }, { k: 'canal', label: 'Para', type: 'select', options: Object.entries(CANAL).map(([k, x]) => [k, x[0]]) },
          { k: 'activa', label: 'Estado', type: 'bool', check: 'Activa' }, { k: 'instrucciones', label: 'Instrucciones para la IA', type: 'long', required: true, hint: 'máx. 2000 letras' }],
        onDelete: r ? async () => { await api(`${B}/plantillas/${r.id}`, { method: 'DELETE' }); } : null });
      if (v === null) return;
      if (v !== 'deleted') {
        try { await api(r ? `${B}/plantillas/${r.id}` : `${B}/plantillas`, { method: r ? 'PATCH' : 'POST', body: v }); toast('Plantilla guardada'); } catch (x) { toast(x.message, false); return; }
      }
      load();
    };
    el.onclick = (e) => {
      const n = e.target.closest('[data-new]'); if (n) return editar(null, { canal: n.dataset.new, activa: 1 });
      const s = e.target.closest('[data-starter]'); if (s) { const [k, i] = s.dataset.starter.split(':'); return editar(null, { ...D.starters[k][+i], canal: k, activa: 1 }); }
      const ed = e.target.closest('[data-edit]'); if (ed) return editar(rows.find((x) => String(x.id) === ed.closest('[data-id]').dataset.id));
    };
    el.onchange = async (e) => {
      const sw = e.target.closest('[data-act]'); if (!sw) return;
      const id = sw.closest('[data-id]').dataset.id;
      try { await api(`${B}/plantillas/${id}`, { method: 'PATCH', body: { activa: sw.checked } }); toast(sw.checked ? 'Plantilla activada' : 'Plantilla desactivada'); load(); } catch (x) { toast(x.message, false); sw.checked = !sw.checked; }
    };
  }

  /* ---------- Usar en otros lados: el kit de marca para webs, apps, chats y agentes ---------- */
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { prompt('Copia el texto:', t); } };
  async function kit(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let K;
    try { K = await api(`${B}/kit`); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const piezas = [
      ['CSS de la marca', 'Pégalo en tu web o app: trae el color y la letra del negocio como variables.', K.css],
      ['Tipografía (HTML)', 'Va dentro del <head> de tu página.', K.tipografia.html],
      ['Prompt del chat', 'Para el asistente de IA dentro de una app o una web.', K.prompts.chat],
      ['Prompt del asistente externo (MCP)', 'Para Claude u otro asistente conectado al negocio.', K.prompts.mcp],
      ['Prompt de agentes y automatizaciones', 'Para agentes de IA que trabajan solos.', K.prompts.agente],
    ];
    const json = JSON.stringify(K, null, 2);
    el.innerHTML = `<div class="dw-card mb-3"><div class="d-flex flex-wrap align-items-center gap-3">
        <span class="rounded-circle d-grid" style="width:44px;height:44px;background:${esc(K.color.principal)};place-items:center"><i class="bi bi-palette text-white"></i></span>
        <div class="flex-grow-1"><div class="fw-semibold">${esc(K.color.nombre)} <span class="small text-body-secondary font-monospace">${esc(K.color.principal)}</span>${K.color.sigue_a_la_app ? ' <span class="badge text-bg-light">sigue a tu app</span>' : ''}</div>
          <div class="small text-body-secondary">${esc(K.tipografia.nombre)} · tono ${esc(K.tono.nombre.toLowerCase())}</div></div>
        <div class="d-flex gap-2"><button class="btn btn-primary btn-sm" data-json><i class="bi bi-clipboard me-1"></i>Copiar kit completo (JSON)</button><button class="btn btn-outline-primary btn-sm" data-down><i class="bi bi-download me-1"></i>Descargar</button></div></div></div>
      <div class="row g-3">${piezas.map(([t, a], i) => `<div class="col-lg-6"><div class="dw-card h-100"><div class="d-flex align-items-start gap-2"><div class="flex-grow-1"><h2 class="h6 mb-0">${esc(t)}</h2><div class="small text-body-secondary">${esc(a)}</div></div>
          <button class="btn btn-sm btn-outline-primary" data-cp="${i}"><i class="bi bi-clipboard me-1"></i>Copiar</button></div>
          <pre class="small mt-2 mb-0 p-2 rounded-3" style="white-space:pre-wrap;max-height:220px;overflow:auto;background:rgba(var(--bs-body-color-rgb),.06)">${esc(piezas[i][2])}</pre></div></div>`).join('')}
        <div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">Cómo sacar esta información</h2><ul class="small mb-0 ps-3 d-grid gap-1">
          <li><b>Aquí:</b> copia cada pieza o descarga el kit completo.</li>
          <li><b>API de la app:</b> <code>GET /api/marca/kit</code> con la sesión del negocio.</li>
          <li><b>Asistente externo (MCP):</b> la herramienta <code>marca_kit_de_marca</code>; pídele «crea mi landing con la marca del negocio».</li>
          <li><b>Otro Worker de Diwilo</b> (generador de webs o de agentes): <code>env.MODULOS.marca(app, businessId)</code>.</li></ul></div></div></div>`;
    el.onclick = (e) => {
      if (e.target.closest('[data-json]')) return copiar(json);
      if (e.target.closest('[data-down]')) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'kit-de-marca.json'; a.click(); URL.revokeObjectURL(a.href); return; }
      const b = e.target.closest('[data-cp]'); if (b) copiar(piezas[+b.dataset.cp][2]);
    };
  }

  C.seg($('[data-seg]'), VIEWS, (k) => { view = k; D && render(); }, view);
  load();
});

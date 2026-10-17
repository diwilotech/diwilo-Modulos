// Marca e IA: reemplaza a «Configuración» de las apps. Marca (color de la app, modo, logo, fondo, tipografía y tono),
// Asistente IA (plantillas del chat, de asistentes externos y de agentes), Conexiones (tokens MCP), Usar en otros lados (kit de marca) y Bitácora.
// Ver: todo el equipo; cambiar: propietario y administrador. El color y el modo los guarda la app (/api/settings/apariencia);
// el logo también (para su menú) y el módulo guarda una copia para el kit; lo demás vive en el módulo (/api/marca).
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal, table, empty, fecha } = window.App;
  const C = window.App.Crud;
  const B = '/api/marca';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CAN = me.canManage && !me.business.readOnly;
  const VIEWS = [['marca', 'Marca', 'bi-palette'], ['ia', 'Asistente IA', 'bi-robot'], ['conexiones', 'Conexiones', 'bi-plug'], ['kit', 'Usar en otros lados', 'bi-box-arrow-up-right'],
    ...(me.canManage ? [['bitacora', 'Bitácora', 'bi-journal-text']] : [])];
  const CANAL = { chat: ['Chat del negocio', 'bi-chat-dots', 'Lo usa el asistente de IA dentro de la app.'], mcp: ['Asistente externo (MCP)', 'bi-plug', 'Lo lee tu asistente externo (Claude u otro) con la herramienta «guía de marca».'],
    agente: ['Agentes y automatizaciones', 'bi-lightning-charge', 'Instrucciones para los agentes de IA que trabajan solos (seguimiento, recordatorios, publicaciones).'] };
  const TONOS_N = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  let D = null, view = (location.hash || '#marca').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'marca';

  const load = async () => {
    try { D = await api(B); } catch (x) { $('[data-view]').innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    render();
    espejoDelLogo();
  };
  const render = () => ({ marca, ia, conexiones, kit, bitacora })[view]($('[data-view]'));

  const tira = (P) => `<div class="d-flex rounded-3 overflow-hidden border">${TONOS_N.map((n) => `<span style="flex:1;height:34px;background:${P[n]}" title="${n} · ${P[n]}"></span>`).join('')}</div>
    <div class="d-flex flex-wrap gap-2 mt-2 small"><span class="rounded-pill px-3 py-1 border" style="background:${P.fondo};color:${P.texto}">Fondo claro · ${P.fondo}</span><span class="rounded-pill px-3 py-1" style="background:${P.fondo_oscuro};color:${P.texto_oscuro}">Fondo oscuro · ${P.fondo_oscuro}</span></div>`;

  // Reduce una imagen a un cuadrado de `size` px en PNG
  const shrink = (file, size) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), cv = document.createElement('canvas');
      cv.width = cv.height = Math.min(size, s);
      cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src); resolve(cv.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('No pude abrir esa imagen'));
    img.src = URL.createObjectURL(file);
  });
  const toDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  // Un negocio que ya tenía logo en la app: se copia al módulo (una sola vez) para que el kit lo traiga.
  let espejando = false;
  async function espejoDelLogo() {
    if (espejando || !CAN || !me.settings?.logo || D?.marca.tiene_logo) return;
    espejando = true;
    try { const r = await fetch(me.settings.logo, { credentials: 'same-origin' }); if (r.ok) await api(`${B}/logo`, { method: 'PUT', body: { dataUrl: await toDataUrl(await r.blob()) } }); } catch { /* sin copia: el kit sale sin logo */ }
  }

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
    const base = { tema: me.settings.tema, modo: me.settings.modo };
    // tema y modo los guarda la app; fondo, tipografía y tono, el módulo
    const st = { ...base, fondo: m.fondo, tipografia: m.tipografia, tono: m.tono, tono_notas: m.tono_notas || '' };
    const temaX = () => O.temas.find((t) => t.id === st.tema) || O.temas[0];
    const modoEf = () => (st.modo === 'dark' ? 'oscuro' : 'claro');
    const fondoEf = () => (st.fondo === 'app' ? modoEf() : st.fondo);
    const dirty = () => ['tema', 'modo'].some((k) => st[k] !== base[k]) || ['fondo', 'tipografia', 'tono'].some((k) => st[k] !== m[k]) || st.tono_notas !== (m.tono_notas || '');
    const logoSrc = me.settings.logo;

    el.innerHTML = `<div class="row g-3"><div class="col-lg-7 d-grid gap-3 align-content-start">
        <div class="dw-card"><h2 class="h6 mb-1">Color de tu app</h2><p class="small text-body-secondary mb-3">${CAN ? 'Es el color de tu marca: lo usan tu app, las tarjetas y todo lo que ven tus clientes. Toca uno para verlo en vivo.' : 'Solo el propietario o un administrador pueden cambiarlo.'}</p>
          <div class="d-flex flex-wrap gap-3" data-temas></div>
          <h3 class="h6 mt-4 mb-2">Modo</h3>
          <div class="btn-group" role="group" data-modos><button type="button" class="btn btn-outline-primary" data-modo="light" ${CAN ? '' : 'disabled'}><i class="bi bi-sun me-1"></i>Claro</button><button type="button" class="btn btn-outline-primary" data-modo="dark" ${CAN ? '' : 'disabled'}><i class="bi bi-moon me-1"></i>Oscuro</button></div>
          <div class="mt-4"><div class="small fw-semibold mb-1">Paleta de tu marca</div><div class="small text-body-secondary mb-2">Varias tonalidades y un fondo, calculadas de tu color: la app solo guarda el principal.</div><div data-paleta></div></div></div>
        <div class="dw-card"><h2 class="h6 mb-3">Logo</h2>
          <div class="d-flex align-items-center gap-3"><span class="dw-brand__logo" style="width:64px;height:64px;font-size:1.6rem">${logoSrc ? `<img src="${esc(logoSrc)}" alt="Logo">` : esc((me.business.name || 'D')[0])}</span>
            <div class="small text-body-secondary">PNG, JPG, WEBP o SVG, cuadrado, máx. 300 KB. Sale en el menú de la app y en el kit de marca.</div></div>
          ${CAN ? `<div class="mt-3 d-flex gap-2 flex-wrap"><label class="btn btn-outline-primary btn-sm mb-0"><i class="bi bi-upload me-1"></i>Subir logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden data-logo></label>${logoSrc ? '<button class="btn btn-outline-danger btn-sm" data-logo-del><i class="bi bi-trash me-1"></i>Quitar</button>' : ''}</div>` : ''}</div>
        <div class="dw-card"><h2 class="h6 mb-1">Fondo</h2><p class="small text-body-secondary mb-3">El fondo de tus tarjetas, tu web o tu app: negro, blanco o el mismo modo (claro u oscuro) que tiene tu app.</p><div class="row g-2" data-fondos></div></div>
        <div class="dw-card"><h2 class="h6 mb-1">Tipografía</h2><p class="small text-body-secondary mb-3">La letra de tus tarjetas y de lo que ven tus clientes.</p><div class="row g-2" data-fuentes></div></div>
        <div class="dw-card"><h2 class="h6 mb-1">Tono de conversación</h2><p class="small text-body-secondary mb-3">Cómo habla tu negocio. Lo usan el chat y los asistentes de IA al escribirle a tus clientes.</p>
          <div class="d-grid gap-2" data-tonos></div>
          <label class="form-label small mt-3 mb-1" for="mcNotas">Indicaciones propias <span class="text-body-secondary">(opcional)</span></label>
          <textarea class="form-control" id="mcNotas" rows="2" maxlength="500" placeholder="Ej.: Siempre despídete con «Un abrazo». No uses la palabra «problema»." ${CAN ? '' : 'disabled'}>${esc(st.tono_notas)}</textarea></div>
        ${CAN ? '<div class="d-flex align-items-center gap-2"><button class="btn btn-primary" data-save disabled><i class="bi bi-check-lg me-1"></i>Guardar</button><button class="btn btn-light" data-reset>Deshacer</button><span class="small text-danger" data-err></span></div>'
          : '<p class="small text-body-secondary mb-0"><i class="bi bi-lock me-1"></i>Solo el propietario o un administrador cambia la marca.</p>'}
      </div>
      <div class="col-lg-5"><div class="position-sticky" style="top:76px"><div class="small text-body-secondary mb-2">Vista previa</div><div data-prev></div></div></div></div>`;

    const pintar = () => {
      const t = temaX(), f = O.fuentes.find((x) => x.id === st.tipografia), tono = O.tonos.find((x) => x.id === st.tono), P = t.paleta;
      $('[data-temas]', el).innerHTML = O.temas.map((x) => `<button type="button" class="btn p-0 text-center border-0" data-c="${x.id}" ${CAN ? '' : 'disabled'} title="${esc(x.nombre)}" aria-label="${esc(x.nombre)}" aria-pressed="${st.tema === x.id}">
        <span class="rounded-circle d-grid mx-auto" style="width:40px;height:40px;background:${x.color};place-items:center;${st.tema === x.id ? `outline:3px solid ${x.color};outline-offset:2px` : ''}">${st.tema === x.id ? '<i class="bi bi-check-lg text-white"></i>' : ''}</span><span class="small d-block mt-1">${esc(x.nombre)}</span></button>`).join('');
      $$('[data-modo]', el).forEach((b) => b.classList.toggle('active', b.dataset.modo === st.modo));
      $('[data-paleta]', el).innerHTML = tira(P);
      const modoTxt = modoEf() === 'oscuro' ? 'negro' : 'blanco';
      $('[data-fondos]', el).innerHTML = O.fondos.map((x) => {
        const ef = x.id === 'app' ? modoEf() : x.id, bg = ef === 'claro' ? P.fondo : P.fondo_oscuro, tx = ef === 'claro' ? P.texto : P.texto_oscuro;
        return `<div class="col-4"><button type="button" class="btn w-100 p-0 border overflow-hidden text-start ${st.fondo === x.id ? 'border-primary' : ''}" data-fo="${x.id}" ${CAN ? '' : 'disabled'} style="${st.fondo === x.id ? `outline:2px solid ${t.color};outline-offset:1px` : ''}">
          <span class="d-block p-2" style="background:${bg};color:${tx};height:58px"><span class="d-block rounded-pill" style="width:60%;height:8px;background:${P[500]}"></span><span class="d-block mt-2 small" style="opacity:.7;font-size:.7rem">Aa texto</span></span>
          <span class="d-block p-2 small fw-semibold">${esc(x.nombre)}${x.id === 'app' ? `<span class="d-block fw-normal text-body-secondary" style="font-size:.7rem">Hoy: ${modoTxt}</span>` : ''}</span></button></div>`;
      }).join('');
      $('[data-fuentes]', el).innerHTML = O.fuentes.map((x) => `<div class="col-6 col-md-4"><button type="button" class="btn w-100 text-start p-3 border ${st.tipografia === x.id ? 'border-primary' : ''}" data-f="${x.id}" ${CAN ? '' : 'disabled'}
        style="${st.tipografia === x.id ? `outline:2px solid ${t.color};outline-offset:1px;` : ''}font-family:${x.familia}"><span class="d-block" style="font-size:1.6rem;line-height:1.1">Aa</span><span class="small">${esc(x.nombre)}</span></button></div>`).join('');
      $('[data-tonos]', el).innerHTML = O.tonos.map((x) => `<button type="button" class="btn text-start p-3 border ${st.tono === x.id ? 'border-primary' : ''}" data-t="${x.id}" ${CAN ? '' : 'disabled'}
        style="${st.tono === x.id ? `outline:2px solid ${t.color};outline-offset:1px` : ''}"><span class="fw-semibold">${esc(x.nombre)}</span><span class="d-block small text-body-secondary fst-italic">“${esc(x.ejemplo)}”</span></button>`).join('');
      const nombre = D.negocio.nombre || me.business.name || 'Tu negocio';
      const claro = fondoEf() === 'claro', bgP = claro ? P.fondo : P.fondo_oscuro, txP = claro ? P.texto : P.texto_oscuro;
      $('[data-prev]', el).innerHTML = `<div class="rounded-4 p-3" style="background:${bgP};color:${txP}"><div class="dw-card p-0 overflow-hidden" style="font-family:${f.familia};background:${claro ? '#fff' : 'rgba(255,255,255,.06)'};color:${txP};border-color:${claro ? 'rgba(15,23,42,.1)' : 'rgba(255,255,255,.12)'}">
        <div style="height:72px;background:linear-gradient(135deg,${P[500]},${P[900]})"></div>
        <div class="p-3" style="margin-top:-30px"><span class="d-grid text-white fw-semibold overflow-hidden" style="width:60px;height:60px;border-radius:50%;place-items:center;background:#150B2B;border:3px solid ${claro ? '#fff' : bgP};font-size:1.2rem">${logoSrc ? `<img src="${esc(logoSrc)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc(nombre.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span>
          <div class="fw-semibold fs-5 mt-2">${esc(nombre)}</div><div class="small" style="opacity:.7">Tarjeta de presentación</div>
          <div class="d-grid gap-2 mt-3"><span class="btn text-white" style="background:${P[500]};pointer-events:none"><i class="bi bi-whatsapp me-1"></i>Escríbenos</span><span class="btn" style="pointer-events:none;border:1px solid ${P[300]};color:${claro ? P[700] : P[300]}">Llamar</span></div>
          <div class="mt-3 p-3 rounded-3" style="background:${claro ? P[50] : 'rgba(255,255,255,.08)'};color:${txP}"><div class="small mb-1" style="color:${claro ? P[700] : P[300]}"><i class="bi bi-chat-dots me-1"></i>Así responde tu chat · ${esc(tono.nombre)}</div><div>${esc(tono.ejemplo)}</div></div></div></div></div>`;
      const b = $('[data-save]', el); if (b) b.disabled = !dirty();
      if (CAN) window.DW?.applyTheme?.({ tema: st.tema, modo: st.modo }); // el menú y los botones cambian en vivo
    };
    pintar();
    $('[data-temas]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b && CAN) { st.tema = b.dataset.c; pintar(); } });
    $('[data-modos]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-modo]'); if (b && CAN) { st.modo = b.dataset.modo; pintar(); } });
    $('[data-fondos]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-fo]'); if (b) { st.fondo = b.dataset.fo; pintar(); } });
    $('[data-fuentes]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { st.tipografia = b.dataset.f; pintar(); } });
    $('[data-tonos]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { st.tono = b.dataset.t; pintar(); } });
    $('#mcNotas', el).addEventListener('input', (e) => { st.tono_notas = e.target.value; pintar(); });
    if (!CAN) return;
    $('[data-reset]', el).onclick = () => { Object.assign(st, base, { fondo: m.fondo, tipografia: m.tipografia, tono: m.tono, tono_notas: m.tono_notas || '' }); $('#mcNotas', el).value = st.tono_notas; pintar(); };
    $('[data-save]', el).onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; $('[data-err]', el).textContent = '';
      try {
        if (st.tema !== base.tema || st.modo !== base.modo) me.settings = { ...me.settings, ...(await api('/api/settings/apariencia', { method: 'PUT', body: { tema: st.tema, modo: st.modo } })) };
        await api(B, { method: 'PUT', body: { color: 'app', fondo: st.fondo, tipografia: st.tipografia, tono: st.tono, tono_notas: st.tono_notas } });
        toast('Guardado para todo el equipo'); await load();
      } catch (x) { $('[data-err]', el).textContent = x.message; b.disabled = false; }
    };
    $('[data-logo]', el).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const dataUrl = file.type === 'image/svg+xml' ? await toDataUrl(file) : await shrink(file, 256);
        me.settings = { ...me.settings, ...(await api('/api/settings/logo', { method: 'PUT', body: { dataUrl } })) };
        await api(`${B}/logo`, { method: 'PUT', body: { dataUrl } }).catch(() => {});
        toast('Logo actualizado'); location.reload();
      } catch (x) { toast(x.message, false); }
    };
    $('[data-logo-del]', el)?.addEventListener('click', async () => {
      if (!(await confirm({ title: '¿Quitar el logo?', ok: 'Quitar' }))) return;
      try { await api('/api/settings/logo', { method: 'DELETE' }); await api(`${B}/logo`, { method: 'DELETE' }).catch(() => {}); location.reload(); } catch (x) { toast(x.message, false); }
    });
  }

  /* ---------- Asistente IA: plantillas del chat, del MCP y de los agentes ---------- */
  function ia(el) {
    const rows = D.plantillas;
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Las <b>plantillas</b> son instrucciones para la IA de tu negocio. El <b>tono</b> de la pestaña Marca se aplica siempre.
        Para conectar tu asistente externo ve a la pestaña <b>Conexiones</b>: allí creas el acceso y él lee esta guía con la herramienta <i>marca.guia_de_marca</i>.</div>
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

  /* ---------- Conexiones (MCP): el negocio conecta su propio asistente con un token ---------- */
  async function conexiones(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let tk;
    try { tk = await api('/api/ia/tokens'); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const { tokens, url } = tk;
    el.innerHTML = `<div class="dw-card mb-3"><h2 class="h6">Conecta tu asistente de IA</h2>
        <p class="small text-body-secondary mb-2">Con una conexión, tu asistente (Claude u otro compatible con MCP) puede consultar y registrar datos de este negocio con <b>tu mismo rol</b>. Antes de cambiar algo, el asistente te pide confirmación, y todo queda en la bitácora.</p>
        <div class="small mb-3">Dirección del servidor: <code>${esc(url)}</code></div>
        ${CAN ? '<form class="d-flex gap-2 needs-validation" data-new novalidate><input class="form-control" name="name" placeholder="Nombre (ej. «Claude de Ana»)" maxlength="60" required aria-label="Nombre de la conexión"><button class="btn btn-primary text-nowrap"><i class="bi bi-plus-lg me-1"></i>Crear conexión</button></form>' : ''}</div>
      <div class="dw-card p-0 p-md-2" data-list></div>`;
    $('[data-list]', el).innerHTML = tokens.length ? table([
      { label: 'Conexión', main: true, html: (t) => `${esc(t.name)}<div class="small text-body-secondary fw-normal">${esc(t.email)}</div>` },
      { label: 'Creada', html: (t) => fecha(t.created_at) },
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
          <p class="small text-body-secondary mb-1">En tu asistente agrega un servidor MCP remoto con:</p>
          <ul class="small text-body-secondary mb-0"><li>URL: <code>${esc(r.url)}</code></li><li>Encabezado: <code>Authorization: Bearer &lt;token&gt;</code></li></ul></div>`);
        mo.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(r.token); toast('Token copiado'); } catch { mo.querySelector('input').select(); } };
        conexiones(el);
      } catch (x) { toast(x.message, false); }
    };
    $('[data-list]', el).onclick = async (e) => {
      const b = e.target.closest('[data-revoke]');
      if (!b || !(await confirm({ title: `¿Revocar «${b.dataset.name}»?`, text: 'El asistente conectado con ese token dejará de tener acceso de inmediato.', ok: 'Revocar' }))) return;
      try { await api(`/api/ia/tokens/${b.dataset.revoke}`, { method: 'DELETE' }); toast('Conexión revocada'); conexiones(el); } catch (x) { toast(x.message, false); }
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
    const completo = async () => JSON.stringify(await api(`${B}/kit?logo=1`), null, 2); // con el logo incluido
    el.innerHTML = `<div class="dw-card mb-3"><div class="d-flex flex-wrap align-items-center gap-3">
        <span class="rounded-circle d-grid" style="width:44px;height:44px;background:${esc(K.color.principal)};place-items:center"><i class="bi bi-palette text-white"></i></span>
        <div class="flex-grow-1"><div class="fw-semibold">${esc(K.color.nombre)} <span class="small text-body-secondary font-monospace">${esc(K.color.principal)}</span>${K.color.sigue_a_la_app ? ' <span class="badge text-bg-light">sigue a tu app</span>' : ''}</div>
          <div class="small text-body-secondary">${esc(K.tipografia.nombre)} · fondo ${K.fondo.efectivo === 'claro' ? 'blanco' : 'negro'} · tono ${esc(K.tono.nombre.toLowerCase())}${K.logo ? ' · con logo' : ''}</div></div>
        <div class="d-flex gap-2"><button class="btn btn-primary btn-sm" data-json><i class="bi bi-clipboard me-1"></i>Copiar kit completo (JSON)</button><button class="btn btn-outline-primary btn-sm" data-down><i class="bi bi-download me-1"></i>Descargar</button></div></div><div class="mt-3">${tira(K.color.paleta)}</div></div>
      <div class="row g-3">${piezas.map(([t, a], i) => `<div class="col-lg-6"><div class="dw-card h-100"><div class="d-flex align-items-start gap-2"><div class="flex-grow-1"><h2 class="h6 mb-0">${esc(t)}</h2><div class="small text-body-secondary">${esc(a)}</div></div>
          <button class="btn btn-sm btn-outline-primary" data-cp="${i}"><i class="bi bi-clipboard me-1"></i>Copiar</button></div>
          <pre class="small mt-2 mb-0 p-2 rounded-3" style="white-space:pre-wrap;max-height:220px;overflow:auto;background:rgba(var(--bs-body-color-rgb),.06)">${esc(piezas[i][2])}</pre></div></div>`).join('')}
        <div class="col-lg-6"><div class="dw-card h-100"><h2 class="h6">Cómo sacar esta información</h2><ul class="small mb-0 ps-3 d-grid gap-1">
          <li><b>Aquí:</b> copia cada pieza o descarga el kit completo.</li>
          <li><b>API de la app:</b> <code>GET /api/marca/kit</code> con la sesión del negocio (<code>?logo=1</code> para incluir el logo).</li>
          <li><b>Asistente externo (MCP):</b> la herramienta <code>marca_kit_de_marca</code>; pídele «crea mi landing con la marca del negocio».</li>
          <li><b>Otro Worker de Diwilo</b> (generador de webs o de agentes): <code>env.MODULOS.marca(app, businessId)</code>.</li></ul></div></div></div>`;
    el.onclick = async (e) => {
      if (e.target.closest('[data-json]')) return copiar(await completo());
      if (e.target.closest('[data-down]')) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await completo()], { type: 'application/json' })); a.download = 'kit-de-marca.json'; a.click(); URL.revokeObjectURL(a.href); return; }
      const b = e.target.closest('[data-cp]'); if (b) copiar(piezas[+b.dataset.cp][2]);
    };
  }

  /* ---------- Bitácora: quién hizo qué (propietario y administrador) ---------- */
  async function bitacora(el) {
    el.innerHTML = '<p class="text-body-secondary">Cargando…</p>';
    let items;
    try { ({ items } = await api('/api/settings/bitacora')); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const ORIGEN = { app: 'App', mcp: 'IA (MCP)', diwilo: 'Diwilo' };
    el.innerHTML = `<div class="dw-card p-0 p-md-2">${items.length ? table([
      { label: 'Cuándo', html: (a) => fecha(a.created_at, true) },
      { label: 'Quién', html: (a) => esc(a.email || '—') },
      { label: 'Qué', main: true, html: (a) => esc(a.accion) },
      { label: 'Desde', html: (a) => `<span class="badge text-bg-light">${ORIGEN[a.origen] || esc(a.origen)}</span>` },
    ], items) : empty('bi-journal-text', 'Aún no hay movimientos registrados.')}</div>`;
  }

  C.seg($('[data-seg]'), VIEWS, (k) => { view = k; D && render(); }, view);
  load();
});

// Marca (pantalla del menú): Identidad (nombre, descripción, lema y todos los logos), color de la app, modo, fondo, tipografía, tono, tarjetas de presentación
// (con sus links de rastreo) y el kit de marca para webs, apps y agentes. La app puede sumar pestañas propias con
// window.DwMarcaTabs.push({ id, label, icon, mount(host, { me, can }) }) antes de cargar este archivo.
// Ver: todo el equipo; cambiar: propietario y administrador. El color y el modo los guarda la app (/api/settings/apariencia);
// el logo también (para su menú) y el módulo guarda una copia para el kit; lo demás vive en el módulo (/api/marca).
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud;
  const B = '/api/marca';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CAN = me.canManage && !me.business.readOnly;
  const TONOS_N = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  let D = null;

  const load = async () => {
    try { D = await api(B); } catch (x) { host.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    D.logoApp = me.settings.logo ? null : await api(`${B}/logo`).then((r) => r.data_url || null).catch(() => null);   // la copia del módulo (p. ej. dentro de Diwilo Admin)
    D.card = await api('/api/marketing/cards').then((r) => r.rows.find((c) => c.predeterminada) || r.rows[0] || null).catch(() => null);
    ({ kit, identidad }[tabAct] || marca)(host);
    espejoDelLogo();
  };

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
    const logoSrc = me.settings.logo || D.logoApp || null;

    el.innerHTML = `<div class="row g-3"><div class="col-lg-7 d-grid gap-3 align-content-start">
        <div class="dw-card"><h2 class="h6 mb-1">Color de tu app</h2><p class="small text-body-secondary mb-3">${CAN ? 'Es el color de tu marca: lo usan tu app, las tarjetas y todo lo que ven tus clientes. Toca uno para verlo en vivo.' : 'Solo el propietario o un administrador pueden cambiarlo.'}</p>
          <div class="d-flex flex-wrap gap-3" data-temas></div>
          <h3 class="h6 mt-4 mb-2">Modo</h3>
          <div class="btn-group" role="group" data-modos><button type="button" class="btn btn-outline-primary" data-modo="light" ${CAN ? '' : 'disabled'}><i class="bi bi-sun me-1"></i>Claro</button><button type="button" class="btn btn-outline-primary" data-modo="dark" ${CAN ? '' : 'disabled'}><i class="bi bi-moon me-1"></i>Oscuro</button></div>
          <div class="mt-4"><div class="small fw-semibold mb-1">Paleta de tu marca</div><div class="small text-body-secondary mb-2">Varias tonalidades y un fondo, calculadas de tu color: la app solo guarda el principal.</div><div data-paleta></div></div></div>
        <div class="dw-card"><h2 class="h6 mb-1">Fondo</h2><p class="small text-body-secondary mb-3">El fondo de tus tarjetas, tu web o tu app: negro, blanco o el mismo modo (claro u oscuro) que tiene tu app.</p><div class="row g-2" data-fondos></div></div>
        <div class="dw-card"><h2 class="h6 mb-1">Tipografía</h2><p class="small text-body-secondary mb-3">La letra de tus tarjetas y de lo que ven tus clientes.</p><div class="row g-2" data-fuentes></div></div>
        <div class="dw-card"><h2 class="h6 mb-1">Tono de conversación</h2><p class="small text-body-secondary mb-3">Cómo habla tu negocio. Lo usan el chat y los asistentes de IA al escribirle a tus clientes.</p>
          <div class="d-grid gap-2" data-tonos></div>
          <label class="form-label small mt-3 mb-1" for="mcNotas">Indicaciones propias <span class="text-body-secondary">(opcional)</span></label>
          <textarea class="form-control" id="mcNotas" rows="2" maxlength="500" placeholder="Ej.: Siempre despídete con «Un abrazo». No uses la palabra «problema»." ${CAN ? '' : 'disabled'}>${esc(st.tono_notas)}</textarea></div>
        ${CAN ? '<div class="d-flex align-items-center gap-2"><button class="btn btn-primary" data-save disabled><i class="bi bi-check-lg me-1"></i>Guardar</button><button class="btn btn-light" data-reset>Deshacer</button><span class="small text-danger" data-err></span></div>'
          : '<p class="small text-body-secondary mb-0"><i class="bi bi-lock me-1"></i>Solo el propietario o un administrador cambia la marca.</p>'}
      </div>
      <div class="col-lg-5 order-first order-lg-last"><div class="position-sticky" style="top:76px"><div class="small text-body-secondary mb-2">Tu tarjeta de negocio · en vivo</div><div data-prev></div></div></div></div>`;

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
      // La vista previa es la tarjeta REAL del negocio, con el color, el fondo y la letra que estás eligiendo (en vivo)
      const real = D.card;
      const pal = real && real.accent && real.accent !== 'app' ? (O.temas.find((x) => x.id === real.accent)?.paleta || P) : P;
      const tarjeta = tarjetaHtml(real || { name: nombre, company: nombre }, { P: pal, claro, familia: f.familia, logo: logoSrc });
      $('[data-prev]', el).innerHTML = `${tarjeta}
        <div class="mt-3 p-3 rounded-3" style="background:${claro ? P[50] : 'rgba(var(--bs-body-color-rgb),.06)'};color:${claro ? P.texto : 'var(--bs-body-color)'};font-family:${f.familia}"><div class="small mb-1" style="color:${claro ? P[700] : P[300]}"><i class="bi bi-chat-dots me-1"></i>Así responde tu chat · ${esc(tono.nombre)}</div><div>${esc(tono.ejemplo)}</div></div>
        ${real ? '<button type="button" class="btn btn-outline-primary btn-sm mt-3 w-100" data-edit-card><i class="bi bi-pencil me-1"></i>Editar los datos de la tarjeta</button>' : ''}`;
      $('[data-edit-card]', el)?.addEventListener('click', () => irAEditar(real.id));
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

  /* ---------- Identidad: nombre, qué hace el negocio y todos sus logos ---------- */
  // Dibujos de ejemplo de qué va en cada logo (con el color de la marca) mientras no se sube el propio
  const ejemploLogo = (tipo, color) => {
    const ico = (x, y, r = 22) => `<rect x="${x}" y="${y}" width="${r * 2}" height="${r * 2}" rx="${r * 0.45}" fill="${color}"/><text x="${x + r}" y="${y + r + r * 0.36}" text-anchor="middle" font-size="${r * 1.1}" font-weight="700" fill="#fff" font-family="system-ui,sans-serif">T</text>`;
    const txt = (x, y, size, fill, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="700" fill="${fill}" font-family="system-ui,sans-serif">Tu marca</text>`;
    const caja = (w, inner, bg = '') => `<svg viewBox="0 0 ${w} 100" width="100%" height="100%" aria-hidden="true">${bg}${inner}</svg>`;
    switch (tipo) {
      case 'app': return caja(100, ico(18, 18, 32));
      case 'horizontal': return caja(220, ico(20, 28, 22) + txt(72, 62, 30, 'currentColor'));
      case 'vertical': return caja(140, ico(46, 8, 24) + txt(70, 88, 20, 'currentColor', 'middle'));
      case 'icono': return caja(100, ico(26, 26, 24));
      case 'letras': return caja(220, txt(110, 62, 38, 'currentColor', 'middle'));
      case 'oscuro': return caja(220, ico(20, 28, 22) + txt(72, 62, 30, '#ffffff'));
      default: return '';
    }
  };
  const LOGO_INFO = {
    app: ['Logo de la app (cuadrado)', 'Sale en el menú de tu app y en el kit de marca. Una imagen cuadrada.'],
    horizontal: ['Horizontal', 'Ícono y nombre en una línea: encabezados, correos, facturas y documentos.'],
    vertical: ['Vertical', 'Ícono arriba y nombre abajo: portadas, carteles y publicaciones.'],
    icono: ['Solo ícono', 'Solo el símbolo, sin letras: foto de perfil, favicon y sellos.'],
    letras: ['Solo letras', 'Solo el nombre escrito, sin símbolo: pies de página y firmas.'],
    oscuro: ['Para fondo oscuro', 'La versión clara de tu logo, para usarla sobre fondos oscuros.'],
  };
  async function identidad(el) {
    const m = D.marca, O = D.opciones, nombre = D.negocio.nombre || me.business.name || '';
    const color = (O.temas.find((t) => t.id === me.settings.tema) || O.temas[0]).color;
    let R, appLogo = me.settings.logo || null;
    try { R = await api(`${B}/logos`); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    if (!appLogo) appLogo = await api(`${B}/logo`).then((r) => r.data_url || null).catch(() => null);
    const por = Object.fromEntries(R.logos.map((l) => [l.tipo, l.data_url]));
    por.app = appLogo;
    const tipos = ['app', ...R.tipos.map((t) => t.id)];
    const tarjetaLogo = (id) => {
      const [titulo, para] = LOGO_INFO[id] || [id, ''], u = por[id], oscuro = id === 'oscuro';
      return `<div class="col-sm-6 col-xl-4"><div class="dw-card h-100"><div class="fw-semibold">${esc(titulo)}</div><div class="small text-body-secondary mb-2">${esc(para)}</div>
        <div class="rounded-3 d-grid mb-2 border position-relative" style="place-items:center;height:130px;padding:12px;background:${oscuro ? '#1b1230' : '#fff'};color:${oscuro ? '#fff' : '#1f2937'}">
          ${u ? `<img src="${esc(u)}" alt="${esc(titulo)}" style="max-width:100%;max-height:106px;object-fit:contain">`
            : `<div style="width:${id === 'app' || id === 'icono' ? '90px' : '78%'};height:92px;opacity:.5">${ejemploLogo(id, color)}</div><span class="badge text-bg-secondary position-absolute" style="top:8px;left:8px;font-weight:500">Ejemplo</span>`}</div>
        ${u ? '' : '<div class="small text-body-secondary mb-2">Así va tu logo aquí. PNG, JPG, WEBP o SVG, máx. 300 KB.</div>'}
        <div class="d-flex gap-2 flex-wrap">${CAN ? `<label class="btn btn-outline-primary btn-sm mb-0"><i class="bi bi-upload me-1"></i>${u ? 'Cambiar' : 'Subir logo'}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" data-up="${id}"></label>` : ''}
          ${u ? `<a class="btn btn-outline-secondary btn-sm" download="logo-${id}" href="${esc(u)}"><i class="bi bi-download me-1"></i>Descargar</a>` : ''}
          ${CAN && u ? `<button class="btn btn-outline-danger btn-sm" data-del="${id}"><i class="bi bi-trash me-1"></i>Quitar</button>` : ''}</div></div></div>`;
    };
    el.innerHTML = `<div class="row g-3"><div class="col-lg-7"><div class="dw-card">
        <h2 class="h6 mb-1">Tu marca</h2>
        <p class="small text-body-secondary mb-3">${CAN ? 'Cuéntalo en pocas frases. Lo leen el chat y los asistentes de IA para hablar de tu negocio sin inventar, y sale en el kit de marca.' : 'Solo el propietario o un administrador pueden cambiarlo.'}</p>
        <label class="form-label small mb-1" for="mcNom">Nombre de la marca</label>
        <input class="form-control" id="mcNom" value="${esc(nombre)}" disabled><div class="form-text">Es el nombre de tu negocio; así lo escribe la IA.</div>
        <label class="form-label small mb-1 mt-2" for="mcDesc">Descripción</label>
        <textarea class="form-control" id="mcDesc" rows="4" maxlength="600" placeholder="Ej.: Academia de idiomas con clases presenciales de inglés, francés y alemán para todas las edades." ${CAN ? '' : 'disabled'}>${esc(m.descripcion || '')}</textarea>
        <div class="form-text text-end"><span data-n>${(m.descripcion || '').length}</span>/600</div>
        <label class="form-label small mb-1 mt-2" for="mcLema">Lema <span class="text-body-secondary">(opcional)</span></label>
        <input class="form-control" id="mcLema" maxlength="80" placeholder="Una frase corta que resuma tu marca" value="${esc(m.lema || '')}" ${CAN ? '' : 'disabled'}>
        ${CAN ? '<div class="d-flex align-items-center gap-2 mt-3"><button class="btn btn-primary" data-save><i class="bi bi-check-lg me-1"></i>Guardar</button><span class="small text-danger" data-err></span></div>' : ''}
      </div></div>
      <div class="col-lg-5"><div class="dw-card h-100"><div class="small text-body-secondary mb-2">Así la ve la IA</div>
        <div class="d-flex align-items-center gap-2">${appLogo ? `<img src="${esc(appLogo)}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:8px">` : ''}<div><div class="fw-semibold">${esc(nombre)}</div><div class="small fst-italic text-body-secondary" data-p-lema>${esc(m.lema || '')}</div></div></div>
        <p class="small mb-0 mt-2" data-p-desc>${esc(m.descripcion || '') || '<span class="text-body-secondary">Aún no has escrito la descripción.</span>'}</p></div></div></div>
      <h2 class="h6 mt-4 mb-1">Logos</h2>
      <p class="small text-body-secondary">${CAN ? 'Sube cada versión de tu logo según dónde se use. Mientras falte una, ves un ejemplo de qué va en ella.' : 'Solo el propietario o un administrador cambian los logos.'}</p>
      <div class="row g-3" data-logos>${tipos.map(tarjetaLogo).join('')}</div>`;
    const d = $('#mcDesc', el), l = $('#mcLema', el);
    const vivo = () => { $('[data-n]', el).textContent = d.value.length; $('[data-p-lema]', el).textContent = l.value; $('[data-p-desc]', el).textContent = d.value || 'Aún no has escrito la descripción.'; };
    d.addEventListener('input', vivo); l.addEventListener('input', vivo);
    $('[data-save]', el)?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; $('[data-err]', el).textContent = '';
      try { await api(B, { method: 'PUT', body: { descripcion: d.value, lema: l.value } }); toast('Guardado'); await load(); } catch (x) { $('[data-err]', el).textContent = x.message; b.disabled = false; }
    });
    $$('[data-up]', el).forEach((i) => (i.onchange = async () => {
      const file = i.files[0]; if (!file) return;
      try {
        if (i.dataset.up === 'app') {
          const dataUrl = file.type === 'image/svg+xml' ? await toDataUrl(file) : await shrink(file, 256);
          let enApp = false;
          try { me.settings = { ...me.settings, ...(await api('/api/settings/logo', { method: 'PUT', body: { dataUrl } })) }; enApp = true; } catch { /* dentro de Diwilo Admin no hay ajustes de app: solo queda la copia del módulo */ }
          await api(`${B}/logo`, { method: 'PUT', body: { dataUrl } });
          toast('Logo actualizado'); if (enApp) location.reload(); else identidad(el);
        } else { await api(`${B}/logos/${i.dataset.up}`, { method: 'PUT', body: { dataUrl: await toDataUrl(file) } }); toast('Logo guardado'); identidad(el); }
      } catch (x) { toast(x.message, false); }
    }));
    $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
      if (!(await confirm({ title: '¿Quitar este logo?', ok: 'Quitar' }))) return;
      try {
        if (b.dataset.del === 'app') { await api('/api/settings/logo', { method: 'DELETE' }).catch(() => {}); await api(`${B}/logo`, { method: 'DELETE' }).catch(() => {}); toast('Logo quitado'); location.reload(); return; }
        await api(`${B}/logos/${b.dataset.del}`, { method: 'DELETE' }); toast('Logo quitado'); identidad(el);
      } catch (x) { toast(x.message, false); }
    }));
  }

  /* ---------- Tarjetas de presentación (se administran aquí; sus links de rastreo se crean en Marketing → Campañas) ---------- */
  const MK = '/api/marketing';
  const num = (n) => new Intl.NumberFormat('es-CO').format(n || 0);
  const RO = me.business.readOnly;
  // Colores de tarjeta: «app» sigue el color de la marca del negocio; luego los 9 temas
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

  /* La tarjeta del negocio: la misma vista en la lista, en el editor y en Color y letra (con los colores, fondo y letra de la marca) */
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

  // Lista de tarjetas y su editor en vivo
  async function cards(el, { editarId = null } = {}) {
    el.innerHTML = '<div class="text-body-secondary">Cargando…</div>';
    let rows = [], M, rastreo = [];
    try { [rows, M, rastreo] = await Promise.all([api(`${MK}/cards`).then((r) => r.rows), marcaDe(), api(`${MK}/cards/rastreo`).then((r) => r.rows).catch(() => [])]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    // Links de rastreo (se crean en Marketing → Campañas) que llevan a esta tarjeta, con sus vistas
    const rastreoHtml = (c) => {
      const ls = rastreo.filter((l) => l.target.replace(/[?#].*$/, '').endsWith(`/c/${c.slug}`)), tot = ls.reduce((s, l) => s + l.clicks, 0);
      return `<div class="px-2 pb-1 small"><details><summary class="text-body-secondary"><i class="bi bi-link-45deg me-1"></i>${ls.length ? `${num(ls.length)} ${ls.length === 1 ? 'link de rastreo' : 'links de rastreo'} · ${num(tot)} vistas` : 'Sin links de rastreo'}</summary>
        ${ls.map((l) => `<div class="d-flex align-items-center gap-2 mt-1"><span class="flex-grow-1 text-truncate" title="${esc(l.campaign)}">${esc(l.campaign)} · ${esc(l.platform)}</span><button type="button" class="btn btn-sm btn-light py-0" data-cplink="${esc(location.origin)}/l/${esc(l.slug)}" title="Copiar el link de rastreo">/l/${esc(l.slug)}</button><b>${num(l.clicks)}</b></div>`).join('')}
        <div class="mt-2"><a href="/staff/marketing.html#campanas">${ls.length ? 'Crear otro' : 'Crear uno'} en Marketing → Campañas</a></div></details></div>`;
    };
    const ctxDe = (c) => ({ P: M.paletaDe(c.accent), claro: M.claro, familia: M.familia, logo: c.predeterminada ? M.logo : null });
    el.innerHTML = `<div class="alert alert-light border small">Tarjetas de presentación digitales: cada una tiene su enlace y su QR, se instala como app en el celular y guarda el contacto con un toque. Se ven con el color, el fondo y la letra de tu marca (pestaña <b>Color y letra</b>). La del negocio se crea sola con sus datos.</div>
      <div class="row g-3">${rows.map((c) => `<div class="col-md-6 col-xl-4" data-id="${c.id}"><div class="dw-card p-2 h-100 d-flex flex-column">
          <div class="d-flex align-items-center gap-2 px-2 pt-1 pb-2">${c.predeterminada ? '<span class="badge text-bg-light">Del negocio</span>' : ''}<span class="small text-body-secondary ms-auto"><i class="bi bi-eye me-1"></i>${num(c.views)} · /c/${esc(c.slug)}</span></div>
          ${tarjetaHtml(c, ctxDe(c))}
          ${rastreoHtml(c)}
          <div class="d-flex flex-wrap gap-1 p-2">${RO ? '' : '<button class="btn btn-sm btn-primary" data-act="edit"><i class="bi bi-pencil me-1"></i>Editar</button>'}
            <a class="btn btn-sm btn-outline-primary" href="/c/${esc(c.slug)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i></a>
            <button class="btn btn-sm btn-outline-primary" data-act="copy" title="Copiar enlace"><i class="bi bi-link-45deg"></i></button>
            <button class="btn btn-sm btn-outline-primary" data-act="qr" title="QR"><i class="bi bi-qr-code"></i></button></div></div></div>`).join('')}
        ${RO ? '' : '<div class="col-md-6 col-xl-4"><button class="dw-card d-grid text-body-secondary w-100 h-100" data-new style="place-items:center;border:1px dashed var(--bs-border-color);min-height:220px"><span><i class="bi bi-person-plus fs-3 d-block"></i>Nueva tarjeta</span></button></div>'}</div>`;
    el.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return nueva();
      const cpl = e.target.closest('[data-cplink]');
      if (cpl) { try { await navigator.clipboard.writeText(cpl.dataset.cplink); toast('Link copiado'); } catch { prompt('Copia el link:', cpl.dataset.cplink); } return; }
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
        try { await api(`${MK}/cards/${card.id}`, { method: 'DELETE' }); toast('Tarjeta borrada'); volver(); } catch (x) { $('[data-err]', el).textContent = x.message; }
      });
      f.onsubmit = async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(['name', 'role', 'company', 'bio', ...CONTACTOS.map((x) => x[0]), 'slug'].map((k) => [k, f[k].value.trim()]));
        body.accent = accent; body.chat_slug = f.chat_slug.value;
        if (!body.name) { $('[data-err]', el).textContent = 'Escribe el nombre'; return; }
        if (!body.slug) delete body.slug;
        const btn = f.querySelector('.btn-primary'); btn.disabled = true;
        try {
          const id = card ? card.id : (await api(`${MK}/cards`, { method: 'POST', body })).id;
          if (card) await api(`${MK}/cards/${id}`, { method: 'PATCH', body });
          await api(`${MK}/cards/${id}/foto`, { method: 'PUT', body: { ...(fotoNueva !== undefined ? { photo_data: fotoNueva } : {}), ...(await iconos()) } });
          toast(card ? 'Tarjeta guardada' : 'Tarjeta creada'); volver();
        } catch (x) { $('[data-err]', el).textContent = x.message; btn.disabled = false; }
      };
    }
    // Desde «Color y letra» se puede pedir editar la tarjeta del negocio
    if (editarId) { const c = rows.find((x) => x.id === editarId); if (c) editar(c); }
  }

  /* ---------- Pantalla ---------- */
  let host = null, tabAct = 'marca', editarPend = null, irAEditar = () => {};
  function pagina() {
    const seg = $('[data-seg]'), view = $('[data-view]'), ext = window.DwMarcaTabs || [];
    const items = [['identidad', 'Identidad', 'bi-card-text'], ...ext.map((e) => [e.id, e.label, e.icon || 'bi-grid']), ['marca', 'Color y letra', 'bi-palette'], ['tarjetas', 'Tarjetas', 'bi-person-vcard'], ['kit', 'Usar en otros lados', 'bi-box-arrow-up-right']];
    const ok = items.map((x) => x[0]);
    let cur = ok.includes(location.hash.slice(1)) ? location.hash.slice(1) : ok[0];
    const go = async (k) => {
      cur = k; history.replaceState(null, '', `#${k}`);
      const h = document.createElement('div'); h.innerHTML = '<p class="text-body-secondary">Cargando…</p>'; view.replaceChildren(h);
      try {
        const e = ext.find((x) => x.id === k);
        if (e) await e.mount(h, { me, can: CAN });
        else if (k === 'tarjetas') { const id = editarPend; editarPend = null; await cards(h, { editarId: id }); }
        else { host = h; tabAct = k; await load(); }
      } catch (x) { h.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; }
    };
    seg.hidden = false; C.seg(seg, items, go, cur);
    irAEditar = (id) => { editarPend = id; $$('.btn', seg).forEach((b) => b.classList.toggle('active', b.dataset.k === 'tarjetas')); go('tarjetas'); };
    go(cur);
  }

  if (document.querySelector('main[data-modulo="marca"]')) pagina();
});

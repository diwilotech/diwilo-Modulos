// Marca: identidad (descripción y lema), logos por uso, color de la app, modo, fondo, tipografía, tono, tarjetas y el kit de marca para webs, apps y agentes.
// Dos formas de uso: (1) pantalla propia del menú (/staff/marca.html) en las apps que la activan con window.DW_MARCA_PROPIA = 1, que además pueden sumar sus
// propias pestañas con window.DwMarcaTabs.push({ id, label, icon, mount(host, ctx) }); (2) dentro de Marketing → Tarjetas → Marca, que carga este
// archivo y llama a window.DwMarca.mount(). Las apps que no activan (1) siguen mandando /staff/marca.html a Marketing.
// Ver: todo el equipo; cambiar: propietario y administrador. El color y el modo los guarda la app (/api/settings/apariencia);
// el logo también (para su menú) y el módulo guarda una copia para el kit; lo demás vive en el módulo (/api/marca).
const PROPIA = !!window.DW_MARCA_PROPIA && !!document.querySelector('main[data-modulo="marca"]');
if (!PROPIA && document.querySelector('main[data-modulo="marca"]')) location.replace('/staff/marketing.html#marca');
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm } = window.App;
  const C = window.App.Crud;
  const B = '/api/marca';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CAN = me.canManage && !me.business.readOnly;
  const TONOS_N = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  let D = null;

  const load = async () => {
    try { D = await api(B); } catch (x) { host.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    D.card = await api('/api/marketing/cards').then((r) => r.rows.find((c) => c.predeterminada) || r.rows[0] || null).catch(() => null);
    ({ kit, identidad, logos, tarjetas }[tabAct] || marca)(host);
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
      const tarjeta = window.DwCard ? window.DwCard.html(real || { name: nombre, company: nombre }, { P: pal, claro, familia: f.familia, logo: logoSrc }) : '';
      $('[data-prev]', el).innerHTML = `${tarjeta}
        <div class="mt-3 p-3 rounded-3" style="background:${claro ? P[50] : 'rgba(var(--bs-body-color-rgb),.06)'};color:${claro ? P.texto : 'var(--bs-body-color)'};font-family:${f.familia}"><div class="small mb-1" style="color:${claro ? P[700] : P[300]}"><i class="bi bi-chat-dots me-1"></i>Así responde tu chat · ${esc(tono.nombre)}</div><div>${esc(tono.ejemplo)}</div></div>
        ${real && window.onDwTarjetaEditar ? '<button type="button" class="btn btn-outline-primary btn-sm mt-3 w-100" data-edit-card><i class="bi bi-pencil me-1"></i>Editar los datos de la tarjeta</button>' : ''}`;
      $('[data-edit-card]', el)?.addEventListener('click', () => window.onDwTarjetaEditar(real.id));
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

  /* ---------- Identidad: qué hace el negocio ---------- */
  function identidad(el) {
    const m = D.marca;
    el.innerHTML = `<div class="row g-3"><div class="col-lg-7"><div class="dw-card">
        <h2 class="h6 mb-1">Qué hace tu negocio</h2>
        <p class="small text-body-secondary mb-3">${CAN ? 'Cuéntalo en pocas frases. Lo leen el chat y los asistentes de IA para hablar de tu negocio sin inventar, y sale en el kit de marca.' : 'Solo el propietario o un administrador pueden cambiarlo.'}</p>
        <label class="form-label small mb-1" for="mcDesc">Descripción</label>
        <textarea class="form-control" id="mcDesc" rows="5" maxlength="600" placeholder="Ej.: Academia de idiomas con clases presenciales de inglés, francés y alemán para todas las edades." ${CAN ? '' : 'disabled'}>${esc(m.descripcion || '')}</textarea>
        <div class="form-text text-end"><span data-n>${(m.descripcion || '').length}</span>/600</div>
        <label class="form-label small mb-1 mt-2" for="mcLema">Lema <span class="text-body-secondary">(opcional)</span></label>
        <input class="form-control" id="mcLema" maxlength="80" placeholder="Una frase corta que resuma tu marca" value="${esc(m.lema || '')}" ${CAN ? '' : 'disabled'}>
        ${CAN ? '<div class="d-flex align-items-center gap-2 mt-3"><button class="btn btn-primary" data-save><i class="bi bi-check-lg me-1"></i>Guardar</button><span class="small text-danger" data-err></span></div>' : ''}
      </div></div>
      <div class="col-lg-5"><div class="dw-card"><div class="small text-body-secondary mb-2">Así la ve la IA</div>
        <div class="fw-semibold">${esc(D.negocio.nombre || me.business.name || '')}</div><div class="small fst-italic text-body-secondary" data-p-lema>${esc(m.lema || '')}</div><p class="small mb-0 mt-2" data-p-desc>${esc(m.descripcion || '') || '<span class="text-body-secondary">Aún no has escrito la descripción.</span>'}</p></div></div></div>`;
    const d = $('#mcDesc', el), l = $('#mcLema', el);
    const vivo = () => { $('[data-n]', el).textContent = d.value.length; $('[data-p-lema]', el).textContent = l.value; $('[data-p-desc]', el).textContent = d.value || 'Aún no has escrito la descripción.'; };
    d.addEventListener('input', vivo); l.addEventListener('input', vivo);
    $('[data-save]', el)?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; $('[data-err]', el).textContent = '';
      try { await api(B, { method: 'PUT', body: { descripcion: d.value, lema: l.value } }); toast('Guardado'); await load(); } catch (x) { $('[data-err]', el).textContent = x.message; b.disabled = false; }
    });
  }

  /* ---------- Logos por uso ---------- */
  async function logos(el) {
    let R;
    try { R = await api(`${B}/logos`); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const por = Object.fromEntries(R.logos.map((l) => [l.tipo, l.data_url]));
    el.innerHTML = `<p class="small text-body-secondary">${CAN ? 'Sube cada versión de tu logo según dónde se use. PNG, JPG, WEBP o SVG, máx. 300 KB. El logo cuadrado del menú de la app se cambia en la pestaña «Color y letra».' : 'Solo el propietario o un administrador cambian los logos.'}</p>
      <div class="row g-3">${R.tipos.map((t) => {
        const u = por[t.id], oscuro = t.id === 'oscuro';
        return `<div class="col-sm-6 col-xl-4"><div class="dw-card h-100"><div class="fw-semibold mb-2">${esc(t.nombre)}</div>
          <div class="rounded-3 d-grid mb-2 border" style="place-items:center;height:120px;padding:12px;background:${oscuro ? '#240f1e' : '#fff'}">${u ? `<img src="${esc(u)}" alt="${esc(t.nombre)}" style="max-width:100%;max-height:96px;object-fit:contain">` : `<span class="small ${oscuro ? 'text-white-50' : 'text-body-secondary'}">Sin subir</span>`}</div>
          <div class="d-flex gap-2 flex-wrap">${CAN ? `<label class="btn btn-outline-primary btn-sm mb-0"><i class="bi bi-upload me-1"></i>${u ? 'Cambiar' : 'Subir'}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" data-up="${t.id}"></label>` : ''}
            ${u ? `<a class="btn btn-outline-secondary btn-sm" download="logo-${t.id}" href="${esc(u)}"><i class="bi bi-download me-1"></i>Descargar</a>` : ''}
            ${CAN && u ? `<button class="btn btn-outline-danger btn-sm" data-del="${t.id}"><i class="bi bi-trash me-1"></i>Quitar</button>` : ''}</div></div></div>`;
      }).join('')}</div>`;
    $$('[data-up]', el).forEach((i) => (i.onchange = async () => {
      const file = i.files[0]; if (!file) return;
      try { await api(`${B}/logos/${i.dataset.up}`, { method: 'PUT', body: { dataUrl: await toDataUrl(file) } }); toast('Logo guardado'); logos(el); } catch (x) { toast(x.message, false); }
    }));
    $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
      if (!(await confirm({ title: '¿Quitar este logo?', ok: 'Quitar' }))) return;
      try { await api(`${B}/logos/${b.dataset.del}`, { method: 'DELETE' }); toast('Logo quitado'); logos(el); } catch (x) { toast(x.message, false); }
    }));
  }

  /* ---------- Tarjetas: enlaces públicos y visitas (se administran en Marketing) ---------- */
  async function tarjetas(el) {
    let rows = [];
    try { rows = (await api('/api/marketing/cards')).rows; } catch { el.innerHTML = '<div class="dw-card text-body-secondary">Las tarjetas son parte de Marketing. Activa ese módulo para tener tu tarjeta de presentación y sus enlaces.</div>'; return; }
    const num = (n) => new Intl.NumberFormat('es-CO').format(n || 0);
    el.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-3"><p class="small text-body-secondary mb-0 flex-grow-1">Tus tarjetas toman el color, la letra y el fondo de la marca. Cada visita al enlace público se cuenta; los links de campañas (<code>/l/…</code>) se rastrean en Marketing.</p>
        <a class="btn btn-primary btn-sm" href="/staff/marketing.html#tarjetas"><i class="bi bi-pencil me-1"></i>Administrar tarjetas y links</a></div>
      <div class="row g-3">${rows.map((c) => `<div class="col-md-6"><div class="dw-card h-100"><div class="d-flex align-items-start gap-2"><div class="flex-grow-1"><div class="fw-semibold">${esc(c.name)}${c.predeterminada ? ' <span class="badge text-bg-light">Del negocio</span>' : ''}</div><div class="small text-body-secondary">${esc([c.role, c.company].filter(Boolean).join(' · '))}</div></div>
          <span class="small text-body-secondary text-nowrap"><i class="bi bi-eye me-1"></i>${num(c.views)}</span></div>
        <div class="input-group input-group-sm mt-3"><input class="form-control" readonly value="${esc(location.origin)}/c/${esc(c.slug)}" aria-label="Enlace público"><button class="btn btn-outline-primary" data-cp="${esc(c.slug)}"><i class="bi bi-clipboard"></i></button><a class="btn btn-outline-primary" href="/c/${esc(c.slug)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i></a></div></div></div>`).join('') || '<div class="col-12"><div class="dw-card text-body-secondary">Aún no hay tarjetas.</div></div>'}</div>`;
    el.onclick = (e) => { const b = e.target.closest('[data-cp]'); if (b) copiar(`${location.origin}/c/${b.dataset.cp}`); };
  }

  /* ---------- Pantalla propia (menú) ---------- */
  function pagina() {
    const seg = $('[data-seg]'), view = $('[data-view]'), ext = window.DwMarcaTabs || [];
    const items = [['identidad', 'Identidad', 'bi-card-text'], ...ext.map((e) => [e.id, e.label, e.icon || 'bi-grid']), ['logos', 'Logos', 'bi-images'], ['marca', 'Color y letra', 'bi-palette'], ['tarjetas', 'Tarjetas', 'bi-person-vcard'], ['kit', 'Usar en otros lados', 'bi-box-arrow-up-right']];
    const ok = items.map((x) => x[0]);
    let cur = ok.includes(location.hash.slice(1)) ? location.hash.slice(1) : ok[0];
    const go = async (k) => {
      cur = k; history.replaceState(null, '', `#${k}`);
      const h = document.createElement('div'); h.innerHTML = '<p class="text-body-secondary">Cargando…</p>'; view.replaceChildren(h);
      try {
        const e = ext.find((x) => x.id === k);
        if (e) await e.mount(h, { me, can: CAN });
        else { host = h; tabAct = k; await load(); }
      } catch (x) { h.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; }
    };
    seg.hidden = false; C.seg(seg, items, go, cur);
    go(cur);
  }

  let host = null, tabAct = 'marca';
  window.DwMarca = {
    // Marketing → Tarjetas → Marca: tab = 'marca' (color, modo, logo, fondo, tipografía y tono) o 'kit' (usar en otros lados)
    async mount(el, tab = 'marca') { host = el; tabAct = tab; el.innerHTML = '<p class="text-body-secondary">Cargando…</p>'; await load(); },
  };
  if (PROPIA) pagina();
});

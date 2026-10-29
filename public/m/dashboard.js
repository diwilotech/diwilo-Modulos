// Dashboard (inicio de la app): saludo con la marca, alertas que necesitan atención, indicadores de los módulos y accesos directos.
// Web y celular (cuadrícula que se adapta), se actualiza solo cada 90 s mientras la pestaña está a la vista, y sus alertas
// se mandan a la campana del panel/app (window.parent.postMessage). Dentro de Diwilo Admin los enlaces cambian de pestaña del panel.
// Cada app suma sus propios indicadores con window.DwDashboard.push({ id, titulo, mount(host, { me, sede }) }) antes de cargar este archivo.
// window.DwInicioModulos = true (o estar en Diwilo Admin) pinta el Inicio por módulos (iniciomods.js) en lugar de figura, «Cómo va» y agentes.
// window.DwSinComoVa = true oculta las tarjetas de «Cómo va».
// window.DwSinAgentes = true oculta la sección «Agentes IA» (la app pinta su propia versión).
// window.DwSinFigura = true oculta «Así funciona tu negocio» (la app trae su propio Inicio).
// Apps con varias sedes (conjuntos, edificios, sucursales) declaran el ÁMBITO con window.DwDashboardAmbito = { etiqueta: 'Conjunto', plural: 'Conjuntos',
//   items: async () => [{ id, nombre, detalle?, kpis?: [{ valor, titulo }] }], actual: () => id | null, elegir: (id | null) => void }.
//   Sin sede elegida el Inicio es el del portafolio (tarjetas de cada sede + lo de toda la empresa: alertas, Finanzas, Marketing…); con una elegida
//   muestra lo de esa sede y pasa { sede } a los indicadores propios de la app. Los módulos centrales son de la empresa, no de cada sede.
DW.ready.then((me) => {
  // Solo en la pantalla de Inicio: las apps arman todas sus páginas con el mismo shell y este archivo no debe pintar sobre las de otros módulos
  if (!me.pageAllowed || !document.querySelector('main[data-modulo="dashboard"], main[data-modulo="inicio"]')) return;
  const { api, esc } = window.App;
  const $ = (s, el = document) => el.querySelector(s);
  const view = $('[data-view]');
  const enPanel = location.pathname.startsWith('/admin/m/');
  // Dentro de Diwilo Admin (o con window.DwInicioModulos = true) el Inicio es el de módulos: IA grande + una tarjeta por módulo con agente, estadísticas y calendario
  const MODS = () => enPanel || !!window.DwInicioModulos;
  const PANEL = { ai: 'ia' };   // id de la pestaña del panel cuando difiere del módulo
  const VISTAS = new Set(JSON.parse(sessionStorage.getItem('dw_dash_ocultas') || '[]'));
  let timer = null, fig = null, figTimer = null, figUltimo = 0;

  const style = document.createElement('style');
  style.textContent = `.dsh-hero{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}
    .dsh-logo{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:var(--dw-p,#6d28d9);color:#fff;font-weight:700;font-size:1.5rem;overflow:hidden;flex:none}
    .dsh-logo img{width:100%;height:100%;object-fit:contain;background:#fff}
    .dsh-hero h1{font-size:1.35rem;margin:0}.dsh-hero p{margin:0}
    .dsh-alertas{display:grid;gap:8px;margin-bottom:18px}
    .dsh-alerta{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid var(--bs-border-color);border-left:4px solid var(--c);background:var(--bs-body-bg);text-align:left;width:100%;color:inherit}
    .dsh-alerta[data-nivel=mala]{--c:#dc3545}.dsh-alerta[data-nivel=aviso]{--c:#f59e0b}.dsh-alerta[data-nivel=info]{--c:var(--dw-p,#6d28d9)}
    .dsh-alerta i.ic{color:var(--c);font-size:1.2rem}.dsh-alerta .x{margin-left:auto;opacity:.55}
    .dsh-agr{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
    .dsh-ag{--c:var(--dw-p,#6d28d9);display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:12px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit;cursor:pointer;transition:transform .12s,border-color .12s}
    .dsh-ag:hover{transform:translateY(-2px);border-color:var(--c)}.dsh-ag.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c)}
    .dsh-agr.sel .dsh-ag:not(.on){opacity:.55}
    .dsh-ag .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
    .dsh-ag .bot{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:1.15rem;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
    .dsh-ag .pt{width:9px;height:9px;border-radius:50%;background:#34d399;margin-top:4px}.dsh-ag .pt.pend{background:#f59e0b}.dsh-ag .pt.error{background:#dc3545}
    .dsh-ag .n{font-weight:600;font-size:.9rem}.dsh-ag .e{font-size:.76rem;color:var(--bs-secondary-color)}
    .dsh-ag .m{font-size:.76rem;margin-top:6px;color:var(--c);font-weight:600}
    .dsh-ag.nuevo{border-style:dashed;cursor:default}.dsh-ag.nuevo:hover{transform:none;border-color:var(--bs-border-color)}.dsh-ag.nuevo .bot{color:var(--bs-secondary-color);background:rgba(var(--bs-body-color-rgb),.06)}
    .dsh-ag.nuevo .btn{margin-top:8px}
    .dsh-agd{margin-top:12px;--c:var(--dw-p,#6d28d9)}
    .dsh-agd .kp{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
    .dsh-agd .kp b{display:block;font-size:1.35rem;line-height:1.1}.dsh-agd .kp span{font-size:.75rem;color:var(--bs-secondary-color)}
    .dsh-agd .sem{display:flex;align-items:flex-end;gap:8px;height:96px}
    .dsh-agd .sem div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px;font-size:.7rem;color:var(--bs-secondary-color)}
    .dsh-agd .sem i{display:block;width:100%;max-width:34px;border-radius:6px 6px 3px 3px;background:var(--c);min-height:3px}
    .dsh-agd .rec{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:8px;font-size:.85rem}.dsh-agd .rec small{color:var(--bs-secondary-color)}
    .dsh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
    .dsh-kpi{display:block;text-decoration:none;color:inherit;text-align:left;width:100%;transition:transform .12s,box-shadow .12s}
    .dsh-kpi[data-ruta]:hover{transform:translateY(-2px);box-shadow:var(--bs-box-shadow)}.dsh-kpi[data-ruta]{cursor:pointer}
    .dsh-kpi .ico{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(var(--bs-body-color-rgb),.06);margin-bottom:10px;color:var(--dw-p,#6d28d9)}
    .dsh-kpi .v{font-size:1.6rem;font-weight:700;line-height:1.15;word-break:break-word}.dsh-kpi .t{font-size:.85rem;color:var(--bs-secondary-color)}.dsh-kpi .d{font-size:.78rem;color:var(--bs-secondary-color);margin-top:4px}
    .dsh-sk{height:110px;border-radius:16px;background:linear-gradient(90deg,rgba(var(--bs-body-color-rgb),.05),rgba(var(--bs-body-color-rgb),.11),rgba(var(--bs-body-color-rgb),.05));background-size:200% 100%;animation:dshsk 1.2s infinite}
    @keyframes dshsk{to{background-position:-200% 0}}
    .dsh-atajos{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
    .dsh-atajo{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit;text-decoration:none;font-size:.9rem;min-height:84px;justify-content:center}
    .dsh-atajo:hover{border-color:var(--dw-p,#6d28d9)}.dsh-atajo i{font-size:1.4rem;color:var(--dw-p,#6d28d9)}
    .dsh-h{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--bs-secondary-color);margin:22px 0 10px}
    @media(max-width:575.98px){.dsh-hero h1{font-size:1.15rem}.dsh-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dsh-kpi .v{font-size:1.25rem}}
    @media(prefers-reduced-motion:reduce){.dsh-sk{animation:none}.dsh-kpi,.dsh-ag{transition:none}}`;
  document.head.appendChild(style);

  // Ir a una pantalla: dentro de Diwilo Admin cambia la pestaña del panel; en una app, abre la página del módulo
  const ir = (ruta) => {
    if (!ruta) return;
    const id = (/\/staff\/([a-z]+)\.html/.exec(ruta) || [])[1];
    if (enPanel) { if (id) window.parent.postMessage({ dw: 'go', mod: PANEL[id] || id }, location.origin); } else location.href = ruta;
  };

  async function marca() {
    const [g, lg] = await Promise.all([api('/api/marca').catch(() => null), api('/api/marca/logo').catch(() => null)]);
    return { nombre: g?.negocio?.nombre || me.business.name || 'Tu negocio', lema: g?.marca?.lema || '', logo: me.settings?.logo || lg?.data_url || null };
  }
  const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
  const primerNombre = () => String(me.user?.name || me.user?.email || '').split(/[\s@]/)[0];

  // Ámbito (sedes): selector junto al saludo y, sin sede elegida, tarjetas del portafolio
  const AMB = () => window.DwDashboardAmbito || null;
  const selectorSede = (amb, items) => `<div class="dropdown"><button type="button" class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-buildings me-1"></i>${esc(items.find((i) => String(i.id) === String(amb.actual()))?.nombre || `Todos los ${String(amb.plural || amb.etiqueta).toLowerCase()}`)}</button>
      <ul class="dropdown-menu dropdown-menu-end"><li><button type="button" class="dropdown-item ${amb.actual() ? '' : 'active'}" data-sede="">Todos los ${esc(String(amb.plural || amb.etiqueta).toLowerCase())}</button></li>
      ${items.map((i) => `<li><button type="button" class="dropdown-item ${String(i.id) === String(amb.actual()) ? 'active' : ''}" data-sede="${esc(i.id)}">${esc(i.nombre)}</button></li>`).join('')}</ul></div>`;
  const tarjetaSede = (i) => `<button type="button" class="dw-card dsh-kpi" data-sede="${esc(i.id)}"><div class="ico"><i class="bi bi-building"></i></div><div class="t fw-semibold" style="font-size:1rem;color:inherit">${esc(i.nombre)}</div>${i.detalle ? `<div class="d">${esc(i.detalle)}</div>` : ''}${(i.kpis || []).length ? `<div class="d-flex gap-3 mt-2 flex-wrap">${i.kpis.map((k) => `<div><div class="v" style="font-size:1.15rem">${esc(k.valor)}</div><div class="d mt-0">${esc(k.titulo)}</div></div>`).join('')}</div>` : ''}</button>`;
  const kpi = (w) => `<${w.ruta ? 'button type="button"' : 'div'} class="dw-card dsh-kpi" ${w.ruta ? `data-ruta="${esc(w.ruta)}"` : ''}><div class="ico"><i class="bi ${esc(w.icono || 'bi-grid')}"></i></div><div class="v">${esc(w.valor)}</div><div class="t">${esc(w.titulo)}</div>${w.detalle ? `<div class="d">${esc(w.detalle)}</div>` : ''}</${w.ruta ? 'button' : 'div'}>`;

  // «Así funciona tu negocio»: figura isométrica de la línea con los números reales y los movimientos (skill inicio-isometrico). Si algo falla, el Inicio sigue igual.
  async function figura(F, T) {
    const host = $('[data-inicio]', view);
    if (!host) return;
    try {
      const K = await import(`${enPanel ? '/admin/m/' : '/m/'}inicio.js`), def = K.LINEAS[F.linea];
      if (!def) { host.closest('.dw-card').remove(); return; }
      const mods = me.modules ? new Set(me.modules.map((m) => m.id)) : null, valores = {}, activos = new Set();
      const propios = typeof window.DwInicioValores === 'function' ? await Promise.resolve(window.DwInicioValores()).catch(() => ({})) : {};
      await Promise.all(def.nodos.map(async (n) => {
        if (n.widget) { const w = T.widgets.find((x) => x.modulo === n.widget); if (w) { activos.add(n.id); valores[n.id] = w.valor; } }
        else if (n.api) { if (mods && !mods.has(n.modulo)) return; try { const d = await api(n.api); activos.add(n.id); valores[n.id] = d.valor; } catch { /* módulo apagado o sin permiso */ } }
        else if (n.valor && propios && propios[n.id] != null) { activos.add(n.id); valores[n.id] = propios[n.id]; }
      }));
      fig = K.montar(host, { linea: F.linea, valores, activos, ir });
      if (!fig) { host.closest('.dw-card').remove(); return; }
      figUltimo = Math.max(figUltimo, F.ultimo || 0);
      clearInterval(figTimer);
      figTimer = setInterval(async () => {
        if (document.hidden || !fig) return;
        const r = await api(`/api/dashboard/figura?desde=${figUltimo}`).catch(() => null);
        if (!r) return;
        figUltimo = Math.max(figUltimo, r.ultimo || 0);
        r.movimientos.forEach((m, i) => { const f = fig.flujo(m.tipo); if (f) setTimeout(() => fig && fig.mover(f[0], f[1]), i * 700); });
      }, 30000);
    } catch (x) { console.warn('inicio', x.message); host.closest('.dw-card')?.remove(); }
  }

  // Agentes IA por módulo: una tarjeta por módulo; con agente muestra su actividad real de 7 días, sin agente ofrece crearlo.
  const COLORES = ['#22D3EE', '#A78BFA', '#34D399', '#FBBF24', '#F472B6', '#FB7185', '#60A5FA', '#A3E635'];
  const BASES = new Set(['dashboard', 'inicio', 'ai', 'marca']);
  const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  const puedeCrear = me.role === 'owner' || me.role === 'admin';
  let AG = null, AGSEL = null;
  async function agentes(T) {
    const host = $('[data-agentes]', view);
    if (!host) return;
    try {
      const D = await api('/api/dashboard/agentes');
      const mods = (me.modules ? me.modules.filter((m) => m.ruta && !m.oculto && !BASES.has(m.id)).map((m) => ({ modulo: m.id, nombre: m.nombre, icono: m.icono, ruta: m.ruta })) : T.agentes || []).filter((m) => !BASES.has(m.modulo));
      if (!mods.length) { host.closest('section').remove(); return; }
      const de = (m) => D.agentes.find((a) => a.herramientas.length && a.herramientas.filter((n) => n.startsWith(`${m.modulo}.`)).length * 2 > a.herramientas.length) || null;
      AG = { D, ia: D.ia_ruta || T.ia_ruta, items: mods.map((m, i) => ({ ...m, color: COLORES[i % COLORES.length], agente: de(m) })) };
      dibujarAgentes();
    } catch (x) { console.warn('agentes', x.message); host.closest('section')?.remove(); }
  }
  function dibujarAgentes() {
    const host = $('[data-agentes]', view), { items, ia } = AG;
    const conAg = items.filter((i) => i.agente).length, cur = items.find((i) => i.modulo === AGSEL && i.agente);
    const tarjeta = (i) => {
      const a = i.agente, est = !a ? '' : a.pendientes ? 'pend' : a.estado === 'error' ? 'error' : '';
      return a ? `<button type="button" class="dsh-ag ${cur === i ? 'on' : ''}" style="--c:${i.color}" data-sel="${esc(i.modulo)}" aria-pressed="${cur === i}"><div class="top"><span class="bot"><i class="bi ${esc(i.icono || 'bi-grid')}"></i></span><span class="pt ${est}" title="Activo"></span></div><div class="n">${esc(i.nombre)}</div><div class="e">${esc(a.nombre)}</div><div class="m"><i class="bi bi-lightning-charge-fill"></i> ${a.total} ${a.total === 1 ? 'tarea' : 'tareas'} · 7 días${a.pendientes ? ` · ${a.pendientes} por aprobar` : ''}</div></button>`
        : `<div class="dsh-ag nuevo" style="--c:${i.color}"><div class="top"><span class="bot"><i class="bi ${esc(i.icono || 'bi-grid')}"></i></span></div><div class="n">${esc(i.nombre)}</div><div class="e">Aún sin agente</div>${puedeCrear ? `<button type="button" class="btn btn-sm btn-outline-primary" data-crear="${esc(i.modulo)}"><i class="bi bi-plus-lg"></i> Crear agente</button>` : ''}</div>`;
    };
    const detalle = () => {
      const a = cur.agente, max = Math.max(...a.semana, 1);
      return `<div class="dw-card dsh-agd" style="--c:${cur.color}"><div class="d-flex flex-wrap align-items-center gap-2"><div class="flex-grow-1"><div class="fw-semibold">${esc(a.nombre)}</div><div class="small text-body-secondary">Agente de ${esc(cur.nombre)} · ${a.autonomia === 'ejecutar' ? 'actúa solo' : 'tú apruebas'}${a.programacion !== 'manual' ? ` · ${a.programacion}` : ''}</div></div>
        <button type="button" class="btn btn-sm btn-primary" data-correr="${a.id}"><i class="bi bi-play-fill"></i> Ejecutar ahora</button>${ia ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-ruta="${esc(ia)}">Abrir en IA</button>` : ''}</div>
        <div class="kp"><div><b>${a.total}</b><span>Ejecuciones</span></div><div><b>${a.hechas}</b><span>Acciones hechas</span></div><div><b>${a.pendientes}</b><span>Por aprobar</span></div><div><b>${a.errores}</b><span>Con error</span></div></div>
        <div class="sem" role="img" aria-label="Ejecuciones por día">${a.semana.map((v, k) => `<div title="${v}"><span>${v || ''}</span><i style="height:${Math.max(3, v / max * 62)}px"></i><span>${['D', 'L', 'M', 'X', 'J', 'V', 'S'][new Date(a.dias[k] + 'T12:00:00Z').getUTCDay()]}</span></div>`).join('')}</div>
        ${a.recientes.length ? `<ul class="rec">${a.recientes.map((r) => `<li><div>${esc(r.texto || (r.estado === 'error' ? 'No pudo terminar' : r.estado === 'en_curso' ? 'Trabajando…' : 'Terminó sin novedades'))}</div><small>${hace(r.cuando)}</small></li>`).join('')}</ul>` : '<div class="small text-body-secondary mt-3">Aún no ha trabajado esta semana. Pulsa «Ejecutar ahora».</div>'}</div>`;
    };
    host.innerHTML = `<div class="small text-body-secondary mb-2">${conAg} de ${items.length} módulos con agente</div>
      <div class="dsh-agr ${cur ? 'sel' : ''}">${ia ? `<button type="button" class="dsh-ag" style="--c:#A78BFA" data-ruta="${esc(ia)}"><div class="top"><span class="bot"><i class="bi bi-cpu"></i></span></div><div class="n">Asistente IA</div><div class="e">Pregúntale por todos tus módulos</div></button>` : ''}${items.map(tarjeta).join('')}</div>${cur ? detalle() : ''}`;
  }
  async function pintar(primera) {
    if (primera) view.innerHTML = `<div class="dsh-sk" style="height:72px;margin-bottom:18px"></div><div class="dsh-grid">${'<div class="dsh-sk"></div>'.repeat(4)}</div>`;
    let T, M, F = { linea: null }, SEDES = [];
    try { [T, M, F] = await Promise.all([api('/api/dashboard'), marca(), api('/api/dashboard/figura').catch(() => ({ linea: null }))]); if (AMB()) SEDES = await AMB().items().catch(() => []); } catch (x) { view.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
    const porSede = !AMB() || !!AMB().actual();   // sin sede elegida, lo propio de la app (por sede) no se muestra
    const alertas = T.alertas.filter((a) => !VISTAS.has(a.id)), extras = porSede ? window.DwDashboard || [] : [];
    // La campana del panel/app junta estas alertas con sus avisos
    try { window.parent !== window && window.parent.postMessage({ dw: 'avisos', origen: 'dashboard', alertas: T.alertas.map((a) => ({ id: a.id, icono: a.icono, texto: a.texto, mod: (/\/staff\/([a-z]+)\.html/.exec(a.ruta || '') || [])[1] || null })) }, location.origin); } catch (_) { /* sin campana */ }
    view.innerHTML = `<div class="dsh-hero"><span class="dsh-logo">${M.logo ? `<img src="${esc(M.logo)}" alt="">` : esc(M.nombre[0] || 'D')}</span>
        <div class="flex-grow-1"><h1>${saludo()}${primerNombre() ? `, ${esc(primerNombre())}` : ''}</h1><p class="text-body-secondary">${esc(M.nombre)}${M.lema ? ` · ${esc(M.lema)}` : ''}</p></div>
        ${AMB() && SEDES.length ? selectorSede(AMB(), SEDES) : ''}
        <button type="button" class="btn btn-outline-secondary btn-sm" data-refrescar aria-label="Actualizar"><i class="bi bi-arrow-clockwise"></i><span class="d-none d-sm-inline ms-1">Actualizar</span></button></div>
      ${alertas.length ? `<div class="dsh-alertas" role="region" aria-label="Alertas">${alertas.map((a) => `<div class="dsh-alerta" data-nivel="${esc(a.nivel)}" ${a.ruta ? `data-ruta="${esc(a.ruta)}" role="button" tabindex="0" style="cursor:pointer"` : ''}><i class="bi ${esc(a.icono)} ic"></i><span>${esc(a.texto)}</span><button type="button" class="btn-close x" data-ocultar="${esc(a.id)}" aria-label="Ocultar alerta"></button></div>`).join('')}</div>` : ''}
      ${AMB() && !AMB().actual() && SEDES.length ? `<div class="dsh-h">Tus ${esc(String(AMB().plural || AMB().etiqueta).toLowerCase())}</div><div class="dsh-grid">${SEDES.map(tarjetaSede).join('')}</div>` : ''}
      ${window.DwSinComoVa || MODS() ? '' : `<div class="dsh-h">${AMB() ? 'De toda la empresa' : 'Cómo va'}</div>
      ${T.widgets.length ? `<div class="dsh-grid">${T.widgets.map(kpi).join('')}</div>` : '<div class="dw-card text-body-secondary">Aún no hay indicadores: activa Finanzas, Marketing o Nómina para verlos aquí.</div>'}`}
      ${F.linea && !window.DwSinFigura && !MODS() ? '<div class="dsh-h">Así funciona tu negocio</div><div class="dw-card" data-inicio></div>' : ''}
      ${MODS() ? '<div data-modulos></div>' : ''}
      ${extras.map((e) => `<div class="dsh-h">${esc(e.titulo)}</div><div data-extra="${esc(e.id)}"></div>`).join('')}
      ${window.DwSinAgentes || MODS() ? '' : '<section><div class="dsh-h">Agentes IA</div><div data-agentes><div class="dsh-sk" style="height:96px"></div></div></section>'}`;
    if (F.linea && !window.DwSinFigura && !MODS()) figura(F, T);
    if (!window.DwSinAgentes && !MODS()) agentes(T);
    if (MODS()) import(`${enPanel ? '/admin/m/' : '/m/'}iniciomods.js`).then((K) => K.montar($('[data-modulos]', view), { api, esc, T, ir, puedeCrear })).catch((x) => { console.warn('iniciomods', x.message); });
    for (const e of extras) {
      const host = $(`[data-extra="${e.id}"]`, view);
      Promise.resolve().then(() => e.mount(host, { me, sede: AMB()?.actual() || null })).catch((x) => { host.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; });
    }
  }

  // Crea el agente del módulo con las herramientas de ESE módulo (el negocio lo afina después en IA). Propone y espera aprobación.
  async function crearAgente(btn) {
    const it = AG.items.find((i) => i.modulo === btn.dataset.crear);
    btn.disabled = true;
    try {
      const { herramientas } = await api('/api/ai/herramientas');
      const h = herramientas.filter((t) => t.modulo === it.modulo).map((t) => t.name);
      if (!h.length) throw new Error('Este módulo aún no tiene herramientas para un agente');
      await api('/api/ai/agentes', { method: 'POST', body: { nombre: `Agente de ${it.nombre}`.slice(0, 80), instrucciones: `Eres el agente de ${it.nombre}. Revisa ${it.nombre} del negocio con las herramientas de este módulo, resume lo importante y propón las acciones que haya que tomar. No inventes cifras. Si no hay nada por hacer, dilo en una línea.`, herramientas: h, programacion: 'manual', autonomia: 'proponer', activo: true } });
      window.App.toast?.(`Agente de ${it.nombre} creado`);
      AGSEL = it.modulo;
      await agentes({ agentes: AG.items, ia_ruta: AG.ia });
    } catch (x) { btn.disabled = false; window.App.toast?.(x.message, false); }
  }
  async function correrAgente(btn) {
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Trabajando…';
    try { await api(`/api/ai/agentes/${btn.dataset.correr}/ejecutar`, { method: 'POST', body: {} }); } catch (x) { window.App.toast?.(x.message, false); }
    await agentes({ agentes: AG.items, ia_ruta: AG.ia });
  }

  view.addEventListener('click', (e) => {
    const x = e.target.closest('[data-ocultar]');
    if (x) { e.stopPropagation(); VISTAS.add(x.dataset.ocultar); sessionStorage.setItem('dw_dash_ocultas', JSON.stringify([...VISTAS])); x.closest('.dsh-alerta').remove(); return; }
    if (e.target.closest('[data-refrescar]')) return pintar(false);
    const sd = e.target.closest('[data-sede]');
    if (sd && AMB()) { AMB().elegir(sd.dataset.sede || null); return pintar(false); }
    const sa = e.target.closest('[data-sel]');
    if (sa && AG) { AGSEL = AGSEL === sa.dataset.sel ? null : sa.dataset.sel; return dibujarAgentes(); }
    const cr = e.target.closest('[data-crear]');
    if (cr && AG) return crearAgente(cr);
    const co = e.target.closest('[data-correr]');
    if (co) return correrAgente(co);
    const r = e.target.closest('[data-ruta]');
    if (r) { if (r.tagName === 'A') e.preventDefault(); ir(r.dataset.ruta); }
  });
  view.addEventListener('keydown', (e) => { const r = e.key === 'Enter' && e.target.closest('.dsh-alerta[data-ruta]'); if (r) ir(r.dataset.ruta); });

  const ciclo = () => { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) pintar(false); }, 90000); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pintar(false); });
  pintar(true).then(ciclo);
});

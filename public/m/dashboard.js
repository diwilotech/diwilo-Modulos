// Dashboard (inicio de la app): saludo con la marca, alertas que necesitan atención, indicadores de los módulos y accesos directos.
// Web y celular (cuadrícula que se adapta), se actualiza solo cada 90 s mientras la pestaña está a la vista, y sus alertas
// se mandan a la campana del panel/app (window.parent.postMessage). Dentro de Diwilo Admin los enlaces cambian de pestaña del panel.
// Cada app suma sus propios indicadores con window.DwDashboard.push({ id, titulo, mount(host, { me }) }) antes de cargar este archivo.
DW.ready.then((me) => {
  // Solo en la pantalla de Inicio: las apps arman todas sus páginas con el mismo shell y este archivo no debe pintar sobre las de otros módulos
  if (!me.pageAllowed || !document.querySelector('main[data-modulo="dashboard"], main[data-modulo="inicio"]')) return;
  const { api, esc } = window.App;
  const $ = (s, el = document) => el.querySelector(s);
  const view = $('[data-view]');
  const enPanel = location.pathname.startsWith('/admin/m/');
  const PANEL = { ai: 'ia' };   // id de la pestaña del panel cuando difiere del módulo
  const VISTAS = new Set(JSON.parse(sessionStorage.getItem('dw_dash_ocultas') || '[]'));
  let timer = null;

  const style = document.createElement('style');
  style.textContent = `.dsh-hero{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}
    .dsh-logo{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:var(--dw-p,#6d28d9);color:#fff;font-weight:700;font-size:1.5rem;overflow:hidden;flex:none}
    .dsh-logo img{width:100%;height:100%;object-fit:contain;background:#fff}
    .dsh-hero h1{font-size:1.35rem;margin:0}.dsh-hero p{margin:0}
    .dsh-alertas{display:grid;gap:8px;margin-bottom:18px}
    .dsh-alerta{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid var(--bs-border-color);border-left:4px solid var(--c);background:var(--bs-body-bg);text-align:left;width:100%;color:inherit}
    .dsh-alerta[data-nivel=mala]{--c:#dc3545}.dsh-alerta[data-nivel=aviso]{--c:#f59e0b}.dsh-alerta[data-nivel=info]{--c:var(--dw-p,#6d28d9)}
    .dsh-alerta i.ic{color:var(--c);font-size:1.2rem}.dsh-alerta .x{margin-left:auto;opacity:.55}
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
    @media(prefers-reduced-motion:reduce){.dsh-sk{animation:none}.dsh-kpi{transition:none}}`;
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

  const kpi = (w) => `<${w.ruta ? 'button type="button"' : 'div'} class="dw-card dsh-kpi" ${w.ruta ? `data-ruta="${esc(w.ruta)}"` : ''}><div class="ico"><i class="bi ${esc(w.icono || 'bi-grid')}"></i></div><div class="v">${esc(w.valor)}</div><div class="t">${esc(w.titulo)}</div>${w.detalle ? `<div class="d">${esc(w.detalle)}</div>` : ''}</${w.ruta ? 'button' : 'div'}>`;

  async function pintar(primera) {
    if (primera) view.innerHTML = `<div class="dsh-sk" style="height:72px;margin-bottom:18px"></div><div class="dsh-grid">${'<div class="dsh-sk"></div>'.repeat(4)}</div>`;
    let T, M;
    try { [T, M] = await Promise.all([api('/api/dashboard'), marca()]); } catch (x) { view.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
    const alertas = T.alertas.filter((a) => !VISTAS.has(a.id)), extras = window.DwDashboard || [];
    // La campana del panel/app junta estas alertas con sus avisos
    try { window.parent !== window && window.parent.postMessage({ dw: 'avisos', origen: 'dashboard', alertas: T.alertas.map((a) => ({ id: a.id, icono: a.icono, texto: a.texto, mod: (/\/staff\/([a-z]+)\.html/.exec(a.ruta || '') || [])[1] || null })) }, location.origin); } catch (_) { /* sin campana */ }
    view.innerHTML = `<div class="dsh-hero"><span class="dsh-logo">${M.logo ? `<img src="${esc(M.logo)}" alt="">` : esc(M.nombre[0] || 'D')}</span>
        <div class="flex-grow-1"><h1>${saludo()}${primerNombre() ? `, ${esc(primerNombre())}` : ''}</h1><p class="text-body-secondary">${esc(M.nombre)}${M.lema ? ` · ${esc(M.lema)}` : ''}</p></div>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-refrescar aria-label="Actualizar"><i class="bi bi-arrow-clockwise"></i><span class="d-none d-sm-inline ms-1">Actualizar</span></button></div>
      ${alertas.length ? `<div class="dsh-alertas" role="region" aria-label="Alertas">${alertas.map((a) => `<div class="dsh-alerta" data-nivel="${esc(a.nivel)}" ${a.ruta ? `data-ruta="${esc(a.ruta)}" role="button" tabindex="0" style="cursor:pointer"` : ''}><i class="bi ${esc(a.icono)} ic"></i><span>${esc(a.texto)}</span><button type="button" class="btn-close x" data-ocultar="${esc(a.id)}" aria-label="Ocultar alerta"></button></div>`).join('')}</div>` : ''}
      <div class="dsh-h">Cómo va</div>
      ${T.widgets.length ? `<div class="dsh-grid">${T.widgets.map(kpi).join('')}</div>` : '<div class="dw-card text-body-secondary">Aún no hay indicadores: activa Finanzas, Marketing o Nómina para verlos aquí.</div>'}
      ${extras.map((e) => `<div class="dsh-h">${esc(e.titulo)}</div><div data-extra="${esc(e.id)}"></div>`).join('')}
      ${T.atajos.length ? `<div class="dsh-h">Ir a</div><div class="dsh-atajos">${T.atajos.map((a) => `<a class="dsh-atajo" href="${esc(a.ruta)}" data-ruta="${esc(a.ruta)}"><i class="bi ${esc(a.icono)}"></i>${esc(a.nombre)}</a>`).join('')}</div>` : ''}`;
    for (const e of extras) {
      const host = $(`[data-extra="${e.id}"]`, view);
      Promise.resolve().then(() => e.mount(host, { me })).catch((x) => { host.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; });
    }
  }

  view.addEventListener('click', (e) => {
    const x = e.target.closest('[data-ocultar]');
    if (x) { e.stopPropagation(); VISTAS.add(x.dataset.ocultar); sessionStorage.setItem('dw_dash_ocultas', JSON.stringify([...VISTAS])); x.closest('.dsh-alerta').remove(); return; }
    if (e.target.closest('[data-refrescar]')) return pintar(false);
    const r = e.target.closest('[data-ruta]');
    if (r) { if (r.tagName === 'A') e.preventDefault(); ir(r.dataset.ruta); }
  });
  view.addEventListener('keydown', (e) => { const r = e.key === 'Enter' && e.target.closest('.dsh-alerta[data-ruta]'); if (r) ir(r.dataset.ruta); });

  const ciclo = () => { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) pintar(false); }, 90000); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pintar(false); });
  pintar(true).then(ciclo);
});

// Inicio por módulos (Diwilo Admin): a la izquierda la IA (abre el chat), a su lado una tarjeta pequeña por módulo (filas de 5, bajan si son más),
// al tocar un módulo se ven su agente (funcionando o «Crear agente»), sus indicadores y sus gráficas; abajo el calendario de la semana
// con lo que vence o toca esa semana (tareas de Marketing, cuentas por cobrar/pagar de Finanzas y pagos/obligaciones de Nómina).
// Lo monta dashboard.js cuando corre dentro del panel de Diwilo Admin (o con window.DwInicioModulos = true).
export function montar(host, { api, esc, T, ir, puedeCrear }) {
  const COLORES = ['#22D3EE', '#A78BFA', '#34D399', '#FBBF24', '#F472B6', '#FB7185', '#60A5FA', '#A3E635'];
  const mods = (T.agentes || []).map((m, i) => ({ ...m, color: COLORES[i % COLORES.length] }));
  const peso = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`;
  const num = (v) => Number(v || 0).toLocaleString('es-CO');
  const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  const mesCorto = (ym) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short' });
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const lunesDe = (iso) => mas(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
  let sel = null, AG = { agentes: [] }, graf = {}, desde = lunesDe(T.hoy);

  host.innerHTML = `<style>
      .im-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:16px}
      .im-core{--c:#A78BFA;grid-column:1/-1;display:flex;flex-direction:column;gap:10px;text-align:left;width:100%;padding:20px;border-radius:16px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--c) 16%,var(--bs-body-bg)),var(--bs-body-bg) 65%);color:inherit;cursor:pointer;transition:transform .12s}
      .im-core:hover{transform:translateY(-2px)}
      .im-core .ic{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;font-size:2rem;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
      @media (min-width:992px){.im-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.im-core{grid-column:span 2;grid-row:span 2}}
      .im-mod{--c:var(--dw-p,#6d28d9);display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:12px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit;cursor:pointer;transition:transform .12s,border-color .12s,opacity .12s}
      .im-mod:hover{transform:translateY(-2px);border-color:var(--c)}.im-mod.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c)}.im-grid.sel .im-mod:not(.on){opacity:.5}
      .im-mod .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:1.15rem;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);margin-bottom:6px}
      .im-mod .n{font-weight:600}.im-mod .v{font-size:.8rem;color:var(--bs-secondary-color)}
      .im-det{--c:var(--dw-p,#6d28d9);margin-bottom:16px}
      .im-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
      .im-kpi{display:block;padding:14px;border-radius:14px;border:1px solid var(--bs-border-color);border-top:3px solid var(--c);background:var(--bs-body-bg);color:inherit}
      .im-kpi .v{font-size:1.7rem;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}.im-kpi .l,.im-kpi .d{font-size:.8rem;color:var(--bs-secondary-color)}
      .im-charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:16px}
      .im-ch{padding:14px;border-radius:14px;border:1px solid var(--bs-border-color)}
      .im-cols{display:flex;align-items:flex-end;gap:8px;height:130px}.im-cols>div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;min-width:0}
      .im-cols i{display:block;width:100%;max-width:36px;border-radius:6px 6px 3px 3px;background:var(--c)}.im-cols i.b{background:color-mix(in srgb,var(--c) 40%,transparent)}.im-cols i.p{opacity:.45}.im-cols small{font-size:.68rem;color:var(--bs-secondary-color);white-space:nowrap}
      .im-rk{margin-bottom:8px}.im-rk .progress{height:5px}.im-rk .progress-bar{background:var(--c)}
      .im-ag{padding:14px;border-radius:14px;border:1px solid var(--bs-border-color);background:color-mix(in srgb,var(--c) 6%,transparent)}
      .im-ag .pt{width:9px;height:9px;border-radius:50%;background:#34D399;display:inline-block}.im-ag .pt.pend{background:#f59e0b}.im-ag .pt.error{background:#dc3545}
      .im-sem{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
      @media (max-width:991.98px){.im-sem{grid-template-columns:minmax(0,1fr)}}
      .im-dia{border:1px solid var(--bs-border-color);border-radius:12px;padding:8px;min-height:90px}.im-dia.hoy{border-color:var(--dw-p,#6d28d9);box-shadow:0 0 0 1px var(--dw-p,#6d28d9)}
      .im-dia h3{font-size:.78rem;margin:0 0 6px;color:var(--bs-secondary-color);font-weight:600}
      .im-ev{display:block;width:100%;text-align:left;border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 10%,transparent);color:inherit;border-radius:6px;padding:4px 6px;margin-bottom:4px;font-size:.75rem;line-height:1.3}
      @media (prefers-reduced-motion:reduce){.im-core,.im-mod{transition:none}}
    </style>
    <div class="im-grid" data-mods><button type="button" class="im-core" data-ia><span class="ic"><i class="bi bi-cpu"></i></span><span><span class="d-block small fw-bold" style="color:var(--c);letter-spacing:.12em">ASISTENTE IA</span><span class="d-block h4 fw-bold mb-1">Pregúntale a tu negocio</span><span class="d-block text-body-secondary small">Abre el chat: te responde con los datos de todos tus módulos y hace tareas por ti.</span></span><span class="mt-auto small fw-semibold" style="color:var(--c)">Abrir el chat <i class="bi bi-arrow-right"></i></span></button></div>
    <div data-det></div>
    <div class="dsh-h">Esta semana</div>
    <div class="dw-card"><div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light btn-sm" data-prev aria-label="Semana anterior"><i class="bi bi-chevron-left"></i></button><b class="flex-grow-1 text-center" data-rango></b><button class="btn btn-light btn-sm" data-hoy>Hoy</button><button class="btn btn-light btn-sm" data-next aria-label="Semana siguiente"><i class="bi bi-chevron-right"></i></button></div><div data-semana></div></div>`;
  const $ = (s) => host.querySelector(s);

  /* ---------- tarjetas y agentes ---------- */
  const widgets = (m) => (T.widgets || []).filter((w) => w.modulo === m.modulo);
  const agenteDe = (m) => AG.agentes.find((a) => a.herramientas.length && a.herramientas.filter((n) => n.startsWith(`${m.modulo}.`)).length * 2 > a.herramientas.length) || null;
  const kpi = (w) => `<div class="im-kpi"><div class="l"><i class="bi ${esc(w.icono || 'bi-graph-up')} me-1"></i>${esc(w.titulo)}</div><div class="v">${esc(w.valor)}</div>${w.detalle ? `<div class="d">${esc(w.detalle)}</div>` : ''}</div>`;
  function agenteHtml(m) {
    const a = agenteDe(m);
    if (!a) return `<div class="im-ag mb-3 d-flex flex-wrap align-items-center gap-2"><i class="bi bi-robot fs-4" style="color:var(--c)"></i><div class="flex-grow-1"><div class="fw-semibold">Aún sin agente</div><div class="small text-body-secondary">Un agente revisa ${esc(m.nombre)} por ti y te propone qué hacer.</div></div>${puedeCrear ? `<button type="button" class="btn btn-sm btn-primary" data-crear="${esc(m.modulo)}"><i class="bi bi-plus-lg"></i> Crear agente</button>` : ''}</div>`;
    const mx = Math.max(...a.semana, 1);
    return `<div class="im-ag mb-3"><div class="d-flex flex-wrap align-items-center gap-2"><span class="pt ${a.pendientes ? 'pend' : a.estado === 'error' ? 'error' : ''}"></span><div class="flex-grow-1"><div class="fw-semibold">${esc(a.nombre)} <span class="badge text-bg-success">Funcionando</span></div><div class="small text-body-secondary">${a.autonomia === 'ejecutar' ? 'Actúa solo' : 'Tú apruebas'}${a.programacion !== 'manual' ? ` · ${esc(a.programacion)}` : ''} · ${a.total} ejecuciones · ${a.hechas} acciones · ${a.pendientes} por aprobar · ${a.errores} con error</div></div>
      <button type="button" class="btn btn-sm btn-primary" data-correr="${a.id}"><i class="bi bi-play-fill"></i> Ejecutar ahora</button>${T.ia_ruta ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-ruta="${esc(T.ia_ruta)}">Abrir en IA</button>` : ''}</div>
      <div class="im-cols mt-3" style="height:90px">${a.semana.map((v, k) => `<div title="${v}"><small>${v || ''}</small><i style="height:${Math.max(3, v / mx * 50)}px"></i><small>${['D', 'L', 'M', 'X', 'J', 'V', 'S'][new Date(`${a.dias[k]}T12:00:00Z`).getUTCDay()]}</small></div>`).join('')}</div>
      ${a.recientes.length ? `<ul class="list-unstyled small mt-2 mb-0">${a.recientes.map((r) => `<li class="d-flex justify-content-between gap-2 py-1 border-top"><span>${esc(r.texto || (r.estado === 'error' ? 'No pudo terminar' : r.estado === 'en_curso' ? 'Trabajando…' : 'Terminó sin novedades'))}</span><span class="text-body-secondary text-nowrap">${hace(r.cuando)}</span></li>`).join('')}</ul>` : '<div class="small text-body-secondary mt-2">Aún no ha trabajado esta semana. Pulsa «Ejecutar ahora».</div>'}</div>`;
  }
  // gráficas por módulo (a partir de los resúmenes que ya tiene cada uno)
  const cols = (rows, f, dos) => { const mx = Math.max(1, ...rows.flatMap((r) => [r.a, dos ? r.b : 0])); return `<div class="im-cols">${rows.map((r) => `<div title="${esc(r.k)}: ${esc(f(r.a))}${dos ? ` · ${esc(f(r.b))}` : ''}"><small>${esc(f(r.a))}</small><i class="${r.p ? 'p' : ''}" style="height:${Math.max(3, r.a / mx * 90)}px"></i>${dos ? `<i class="b ${r.p ? 'p' : ''}" style="height:${Math.max(3, r.b / mx * 90)}px"></i>` : ''}<small>${esc(r.k)}</small></div>`).join('')}</div>`; };
  const rank = (rows, f = num) => { const mx = Math.max(1, ...rows.map((r) => r.n)); return rows.length ? rows.map((r) => `<div class="im-rk"><div class="d-flex small"><span class="flex-grow-1 text-truncate">${esc(r.k)}</span><b>${esc(f(r.n))}</b></div><div class="progress"><div class="progress-bar" style="width:${(r.n / mx * 100).toFixed(1)}%"></div></div></div>`).join('') : '<div class="small text-body-secondary">Sin datos todavía.</div>'; };
  const graficas = (m) => {
    const g = graf[m.modulo]; if (!g) return '';
    const out = [];
    if (m.modulo === 'finanzas' && g.flow?.some((x) => x.income || x.expense)) out.push(['Ingresos y gastos', 'Ingresos (fuerte) y gastos · 6 meses y 3 proyectados', cols(g.flow.map((x) => ({ k: mesCorto(x.month), a: x.income, b: x.expense, p: x.projected })), peso, true)]);
    if (m.modulo === 'marketing') {
      const pipe = (g.deals?.pipeline || []).map((x) => ({ k: x.stage, n: x.n })), etapas = Object.entries(g.contacts?.by_stage || {}).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
      if (pipe.some((x) => x.n)) out.push(['Embudo de oportunidades', 'Por etapa', rank(pipe)]);
      if (etapas.some((x) => x.n)) out.push(['Contactos por etapa', 'Todos', rank(etapas)]);
    }
    return out.length ? `<div class="im-charts">${out.map(([t, s, h]) => `<div class="im-ch"><div class="fw-semibold small">${esc(t)}</div><div class="small text-body-secondary mb-2">${esc(s)}</div>${h}</div>`).join('')}</div>` : '';
  };
  async function cargarGraficas(m) {
    if (graf[m.modulo] !== undefined) return;
    graf[m.modulo] = null;
    const url = { finanzas: '/api/finanzas/summary', marketing: '/api/marketing/summary' }[m.modulo];
    if (!url) return;
    graf[m.modulo] = await api(url).catch(() => null);
    if (sel === m) pintar();
  }
  function pintar() {
    $('[data-mods]').classList.toggle('sel', !!sel);
    $('[data-mods]').querySelectorAll('.im-mod').forEach((e) => e.remove());
    $('[data-mods]').insertAdjacentHTML('beforeend', mods.map((m) => {
      const w = widgets(m)[0], a = agenteDe(m);
      return `<button type="button" class="im-mod ${sel === m ? 'on' : ''}" style="--c:${m.color}" data-mod="${esc(m.modulo)}" aria-pressed="${sel === m}"><span class="ic"><i class="bi ${esc(m.icono || 'bi-grid')}"></i></span><span class="n">${esc(m.nombre)}</span><span class="v">${w ? `${esc(w.valor)} · ${esc(String(w.titulo).toLowerCase())}` : 'Ver estadísticas'}</span><span class="v"><i class="bi bi-circle-fill ${a ? 'text-success' : 'text-secondary'}" style="font-size:.5rem"></i> ${a ? `Agente activo · ${a.total} ${a.total === 1 ? 'tarea' : 'tareas'}` : 'Sin agente'}</span></button>`;
    }).join(''));
    const det = $('[data-det]');
    if (!sel) { det.innerHTML = ''; return; }
    const ws = widgets(sel);
    det.innerHTML = `<div class="dw-card im-det" style="--c:${sel.color}"><div class="d-flex flex-wrap align-items-center gap-2 mb-3"><h2 class="h6 mb-0 flex-grow-1">Estadísticas · <span style="color:var(--c)">${esc(sel.nombre)}</span></h2><button type="button" class="btn btn-sm btn-outline-secondary" data-ruta="${esc(sel.ruta)}">Abrir módulo <i class="bi bi-arrow-right"></i></button></div>
      ${agenteHtml(sel)}
      ${ws.length ? `<div class="im-kpis">${ws.map(kpi).join('')}</div>` : '<div class="text-body-secondary small">Este módulo aún no tiene indicadores en el Inicio.</div>'}
      ${graficas(sel)}</div>`;
    cargarGraficas(sel);
  }

  /* ---------- calendario de la semana ---------- */
  async function semana() {
    const hasta = mas(desde, 6), hoy = T.hoy;
    $('[data-rango]').textContent = `${new Date(`${desde}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${hasta}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
    const ev = [], activos = new Set(mods.map((m) => m.modulo));
    const enSemana = (f) => f && f >= desde && f <= hasta;
    await Promise.all([
      activos.has('marketing') && api('/api/marketing/tasks?limit=300').then((r) => (r.rows || []).forEach((t) => { if (!t.done && enSemana(t.due_date)) ev.push({ f: t.due_date, c: '#A78BFA', ic: 'bi-check2-square', t: t.title, ruta: '/staff/marketing.html' }); })).catch(() => {}),
      activos.has('finanzas') && api('/api/finanzas/invoices?limit=300').then((r) => (r.rows || []).forEach((i) => { if (i.status === 'pendiente' && enSemana(i.due_date)) ev.push({ f: i.due_date, c: i.kind === 'emitida' ? '#34D399' : '#FB7185', ic: i.kind === 'emitida' ? 'bi-arrow-down-left' : 'bi-arrow-up-right', t: `${i.kind === 'emitida' ? 'Cobrar' : 'Pagar'} ${peso(i.total - (i.paid || 0))} · ${i.counterparty || i.number || ''}`, ruta: '/staff/finanzas.html' }); })).catch(() => {}),
      activos.has('nomina') && Promise.all([...new Set([desde.slice(0, 7), hasta.slice(0, 7)])].map((p) => api(`/api/nomina/calendario?period=${p}`).catch(() => null))).then((rs) => rs.forEach((r) => (r?.eventos || []).forEach((e) => { if (enSemana(e.fecha)) ev.push({ f: e.fecha, c: '#FBBF24', ic: 'bi-cash-coin', t: `${e.titulo}${e.valor ? ` · ${peso(e.valor)}` : ''}`, ruta: '/staff/nomina.html' }); }))),
    ].filter(Boolean));
    const dias = Array.from({ length: 7 }, (_, i) => mas(desde, i));
    $('[data-semana]').innerHTML = `<div class="im-sem">${dias.map((f) => `<div class="im-dia ${f === hoy ? 'hoy' : ''}"><h3>${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${f.slice(8)}</h3>${ev.filter((e) => e.f === f).map((e) => `<button type="button" class="im-ev" style="--c:${e.c}" data-ruta="${esc(e.ruta)}" title="${esc(e.t)}"><i class="bi ${e.ic} me-1"></i>${esc(String(e.t).slice(0, 70))}</button>`).join('')}</div>`).join('')}</div>${ev.length ? '' : '<div class="small text-body-secondary mt-2">No hay tareas, cobros ni pagos programados esta semana.</div>'}`;
  }

  /* ---------- acciones ---------- */
  const abrirIA = () => {
    for (const w of [window.parent, window.top]) { try { if (w.DwIA?.open) return w.DwIA.open(); const b = w.document.getElementById('iaFab'); if (b) return b.click(); } catch (_) { /* otro origen */ } }
    ir(T.ia_ruta);
  };
  async function cargarAgentes() { AG = await api('/api/dashboard/agentes').catch(() => ({ agentes: [] })); }
  async function crearAgente(btn) {
    const m = mods.find((x) => x.modulo === btn.dataset.crear);
    btn.disabled = true;
    try {
      const { herramientas } = await api('/api/ai/herramientas');
      const h = herramientas.filter((t) => t.modulo === m.modulo).map((t) => t.name);
      if (!h.length) throw new Error('Este módulo aún no tiene herramientas para un agente');
      await api('/api/ai/agentes', { method: 'POST', body: { nombre: `Agente de ${m.nombre}`.slice(0, 80), instrucciones: `Eres el agente de ${m.nombre}. Revisa ${m.nombre} del negocio con las herramientas de este módulo, resume lo importante y propón las acciones que haya que tomar. No inventes cifras. Si no hay nada por hacer, dilo en una línea.`, herramientas: h, programacion: 'manual', autonomia: 'proponer', activo: true } });
      window.App.toast?.(`Agente de ${m.nombre} creado`);
      await cargarAgentes(); pintar();
    } catch (x) { btn.disabled = false; window.App.toast?.(x.message, false); }
  }
  async function correrAgente(btn) {
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Trabajando…';
    try { await api(`/api/ai/agentes/${btn.dataset.correr}/ejecutar`, { method: 'POST', body: {} }); } catch (x) { window.App.toast?.(x.message, false); }
    await cargarAgentes(); pintar();
  }
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-ia]')) return abrirIA();
    const cr = e.target.closest('[data-crear]'); if (cr) return crearAgente(cr);
    const co = e.target.closest('[data-correr]'); if (co) return correrAgente(co);
    const r = e.target.closest('[data-ruta]'); if (r) return ir(r.dataset.ruta);
    if (e.target.closest('[data-prev]')) { desde = mas(desde, -7); return semana(); }
    if (e.target.closest('[data-next]')) { desde = mas(desde, 7); return semana(); }
    if (e.target.closest('[data-hoy]')) { desde = lunesDe(T.hoy); return semana(); }
    const b = e.target.closest('[data-mod]'); if (!b) return;
    const m = mods.find((x) => x.modulo === b.dataset.mod);
    sel = sel === m ? null : m; pintar();
  });

  pintar();
  semana();
  cargarAgentes().then(pintar);
}

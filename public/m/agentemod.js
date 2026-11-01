// Cabecera de cada módulo: a la izquierda el ícono y el nombre de SU agente con las estadísticas del módulo en líneas de texto pequeñas;
// a la derecha el chat para conversar con él (qué ha hecho, qué hay pendiente, pedirle cosas) y ejecutarlo. Reemplaza las tarjetas de estadísticas.
//   DwAgenteMod.montar(el, { modulo: 'finanzas', stats: [[etiqueta, valor, detalle, icono], …] })   (mismo formato que Crud.kpis)
// Lo que el agente quiera cambiar queda como PROPUESTA con botón Aprobar. No consulta nada por su cuenta: solo cuando la persona escribe o ejecuta.
(function () {
  if (window.DwAgenteMod) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CSS = `.dwam{display:grid;grid-template-columns:minmax(220px,320px) 1fr;gap:14px;margin:0 0 16px}@media(max-width:767.98px){.dwam{grid-template-columns:1fr}}
.dwam-info,.dwam-chat{min-width:0}.dwam-top{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.dwam-ic{flex:none;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:1.4rem;color:var(--dw-p,#6d28d9);background:color-mix(in srgb,var(--dw-p,#6d28d9) 14%,transparent)}
.dwam-n{font-weight:600;line-height:1.2}.dwam-s{font-size:12px;color:var(--bs-secondary-color)}
.dwam-stats{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:12px;color:var(--bs-secondary-color)}.dwam-stats b{color:var(--bs-body-color);font-weight:600;font-variant-numeric:tabular-nums}
.dwam-msgs{display:flex;flex-direction:column;gap:8px;max-height:280px;min-height:96px;overflow:auto;margin-bottom:10px}
.dwam-m{padding:8px 12px;border-radius:14px;max-width:92%;white-space:pre-wrap;word-break:break-word;font-size:14px}
.dwam-m.u{align-self:flex-end;background:var(--dw-p,#6d28d9);color:#fff}.dwam-m.a{align-self:flex-start;background:rgba(var(--bs-body-color-rgb),.07)}
.dwam-p{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;font-size:12px}.dwam-vacio{font-size:13px;color:var(--bs-secondary-color)}`;

  const cache = { t: 0, p: null };
  async function montar(host, { modulo, stats = [] } = {}) {
    const { api, toast } = window.App;
    if (!document.getElementById('dwam-css')) document.head.insertAdjacentHTML('beforeend', `<style id="dwam-css">${CSS}</style>`);
    host.classList.remove('dw-grid', 'dw-grid--kpi', 'row', 'g-2');
    host.innerHTML = `<div class="dwam"><div class="dw-card dwam-info"><div class="dwam-top"><span class="dwam-ic"><i class="bi bi-robot"></i></span><div><div class="dwam-n" data-nom>Agente</div><div class="dwam-s" data-est>Preparando…</div></div></div>
        ${stats.length ? `<ul class="dwam-stats">${stats.map(([l, v, sub]) => `<li>${esc(l)}: <b>${esc(v)}</b>${sub ? ` · ${esc(sub)}` : ''}</li>`).join('')}</ul>` : ''}</div>
      <div class="dw-card dwam-chat"><div class="dwam-msgs" data-msgs></div>
        <form class="d-flex gap-2" data-f><input class="form-control" name="t" maxlength="500" autocomplete="off" placeholder="Pregúntale qué ha hecho, qué hay pendiente o pídele algo…" aria-label="Escribe al agente"><button class="btn btn-primary" aria-label="Enviar"><i class="bi bi-send"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-run title="Ejecutar su trabajo ahora"><i class="bi bi-play-fill"></i></button></form></div></div>`;
    const $ = (s) => host.querySelector(s), box = $('[data-msgs]'), KEY = `dwam:${modulo}`;
    let msgs = []; try { msgs = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { /* sin memoria */ }
    const guardar = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20))); } catch { /* sin memoria */ } };
    const pintar = () => {
      box.innerHTML = msgs.length ? msgs.map((m, i) => `<div class="dwam-m ${m.role === 'user' ? 'u' : 'a'}">${esc(m.content)}${(m.props || []).map((p, k) => `<div class="dwam-p"><span class="badge text-bg-warning">Propone</span><code>${esc(p.herramienta)}</code>${p.hecho ? `<span class="text-body-secondary">${esc(p.hecho)}</span>` : `<button class="btn btn-sm btn-primary py-0" data-ap="${i}:${k}">Aprobar</button><button class="btn btn-sm btn-light py-0" data-re="${i}:${k}">Rechazar</button>`}</div>`).join('')}</div>`).join('')
        : '<div class="dwam-vacio">Aquí conversas con el agente de este módulo. Pregúntale <i>«¿qué has hecho?»</i> o <i>«¿qué está pendiente?»</i>.</div>';
      box.scrollTop = box.scrollHeight;
    };
    let ag = null;
    try {   // una sola consulta por minuto aunque la pantalla se redibuje (cambiar de mes, de persona…)
      if (!cache.p || Date.now() - cache.t > 60000) { cache.t = Date.now(); cache.p = api('/api/dashboard/agentes'); }
      ag = ((await cache.p).agentes || []).find((a) => a.modulo === modulo) || null;
    } catch { cache.p = null; }
    $('[data-nom]').textContent = ag?.nombre || 'Agente';
    $('[data-est]').textContent = ag ? (ag.autonomia === 'ejecutar' ? 'Actúa solo' : 'Tú apruebas lo que cambie datos') : 'Aún sin agente';
    if (!ag) { $('[data-f]').querySelectorAll('input,button').forEach((x) => { x.disabled = true; }); }
    pintar();

    const ocupado = (v) => { $('[data-f]').querySelectorAll('input,button').forEach((x) => { x.disabled = v || !ag; }); };
    const propuestas = (pasos) => (pasos || []).filter((p) => p.estado === 'propuesta').map((p) => ({ herramienta: p.herramienta, args: p.args }));
    async function enviar(texto) {
      msgs.push({ role: 'user', content: texto }); pintar(); ocupado(true);
      box.insertAdjacentHTML('beforeend', '<div class="dwam-m a" data-pens><span class="spinner-border spinner-border-sm me-2"></span>Pensando…</div>'); box.scrollTop = box.scrollHeight;
      try {
        const r = await api(`/api/ai/agentes/${ag.id}/chat`, { method: 'POST', body: { mensajes: msgs.map(({ role, content }) => ({ role, content })) } });
        msgs.push({ role: 'assistant', content: r.respuesta, props: propuestas(r.pasos) });
      } catch (x) { msgs.push({ role: 'assistant', content: `No pude responder: ${x.message}` }); }
      guardar(); pintar(); ocupado(false);
    }
    $('[data-f]').onsubmit = (e) => { e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return; e.target.t.value = ''; enviar(t); };
    $('[data-run]').onclick = async () => {
      ocupado(true); msgs.push({ role: 'user', content: 'Ejecuta tu trabajo ahora.' }); pintar();
      box.insertAdjacentHTML('beforeend', '<div class="dwam-m a"><span class="spinner-border spinner-border-sm me-2"></span>Trabajando…</div>'); box.scrollTop = box.scrollHeight;
      try {
        const r = await api(`/api/ai/agentes/${ag.id}/ejecutar`, { method: 'POST', body: {} });
        msgs.push({ role: 'assistant', content: r.resumen || 'Terminé sin novedades.', props: (r.pasos || []).map((p, i) => ({ p, i })).filter((x) => x.p.estado === 'propuesta').map((x) => ({ herramienta: x.p.herramienta, ejecucion: r.id, indice: x.i })) });
      } catch (x) { msgs.push({ role: 'assistant', content: `No pude ejecutarme: ${x.message}` }); }
      guardar(); pintar(); ocupado(false);
    };
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ap],[data-re]'); if (!b) return;
      const aprobar = !!b.dataset.ap, [i, k] = (b.dataset.ap || b.dataset.re).split(':').map(Number), p = msgs[i]?.props?.[k]; if (!p) return;
      b.disabled = true;
      try {
        if (p.ejecucion) await api(`/api/ai/ejecuciones/${p.ejecucion}/aprobar`, { method: 'POST', body: { indice: p.indice, aprobar } });
        else if (aprobar) await api('/api/ai/asistente/aprobar', { method: 'POST', body: { herramienta: p.herramienta, args: p.args } });
        p.hecho = aprobar ? 'Aprobada y ejecutada' : 'Rechazada'; toast?.(p.hecho);
      } catch (x) { toast?.(x.message, false); b.disabled = false; return; }
      guardar(); pintar();
    });
  }
  window.DwAgenteMod = { montar };
})();

// IA Diwilo: botón flotante (abajo a la derecha) con el asistente del negocio, igual en todas las apps Diwilo.
// Cada app lo carga una vez en su panel: <script src="/m/iafab.js"></script> (después de shell.js). Usa el módulo «ai» (POST /api/ai/asistente):
// consulta con las herramientas de los módulos activos del rol; lo que cambia datos llega como propuesta y solo se ejecuta al tocar «Confirmar».
(() => {
  if (window.__iaFab || window.top !== window.self || !window.DW?.ready) return;
  window.__iaFab = true;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = async (path, body) => {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(body ? { 'x-app': '1' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
    return d;
  };
  const MARK = '<svg viewBox="18 14 168 172" aria-hidden="true"><defs><linearGradient id="iaMk" gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="170" y2="180"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e9d5ff"/></linearGradient></defs><g fill="none" stroke="url(#iaMk)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><path d="M48 72V146Q48 170 72 170H84"/><path d="M156.6 135A70 70 0 0 0 96 30H86"/><path d="M84 134V124Q84 108 100 108H124"/></g><g fill="url(#iaMk)"><circle cx="48" cy="34" r="13"/><circle cx="112" cy="72" r="13"/><circle cx="125.6" cy="163.4" r="13"/></g></svg>';
  const CSS = `
.ia-fab{position:fixed;right:22px;bottom:20px;z-index:1040;display:flex;align-items:center;gap:8px;padding:10px 16px 10px 10px;border:0;border-radius:999px;cursor:pointer;color:#fff;font:500 14px/1 system-ui,sans-serif;background:linear-gradient(135deg,#a855f7,#6d28d9 60%,#4c1d95);box-shadow:0 12px 30px rgba(76,29,149,.45),0 0 0 1px rgba(201,155,250,.35);transition:transform .15s}
.ia-fab svg,.ia-logo svg{width:24px;height:24px;padding:3px;border-radius:50%;background:rgba(255,255,255,.16)}.ia-fab:hover{transform:translateY(-2px)}.ia-fab.on{opacity:0;pointer-events:none}
.ia-panel{position:fixed;right:16px;bottom:16px;z-index:1045;width:min(430px,calc(100vw - 32px));height:min(640px,calc(100vh - 32px));display:flex;flex-direction:column;border-radius:18px;background:var(--bs-body-bg,#fff);color:var(--bs-body-color,#212529);border:1px solid var(--bs-border-color,#dee2e6);box-shadow:0 30px 80px rgba(0,0,0,.35);overflow:hidden;font:14px/1.5 system-ui,sans-serif}
.ia-panel[hidden]{display:none}
.ia-panel header{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;border-bottom:1px solid var(--bs-border-color,#dee2e6)}
.ia-logo{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#a855f7,#6d28d9);flex:none}.ia-logo svg{width:30px;height:30px;padding:5px;background:none}
.ia-panel header div{flex:1;display:grid;gap:2px;min-width:0}.ia-panel header b{font-weight:600}.ia-panel header small{font-size:11px;color:var(--bs-secondary-color,#6c757d)}
.ia-panel header button{border:1px solid var(--bs-border-color,#dee2e6);background:transparent;color:inherit;border-radius:8px;width:30px;height:30px;cursor:pointer}
.ia-log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
.ia-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:13.5px;line-height:1.55;background:var(--bs-tertiary-bg,#f1f3f5)}
.ia-msg.user{align-self:flex-end;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff}
.ia-msg .li{display:block;padding-left:14px;position:relative}.ia-msg .li::before{content:'•';position:absolute;left:2px;color:#a855f7}
.ia-used{display:block;margin-top:6px;font-size:11px;color:var(--bs-secondary-color,#6c757d)}
.ia-pending{display:grid;gap:8px;margin-top:10px;padding:10px;border-radius:12px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.35)}
.ia-pending span i{color:#7c3aed;margin-right:6px}.ia-pending pre{margin:0;font-size:11.5px;white-space:pre-wrap}.ia-pending .row{display:flex;gap:8px}.ia-pending small{color:var(--bs-secondary-color,#6c757d)}
.ia-b{border:1px solid var(--bs-border-color,#dee2e6);background:transparent;color:inherit;border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer}.ia-b.p{background:#6d28d9;border-color:#6d28d9;color:#fff}.ia-b:disabled{opacity:.6}
.ia-sugg{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}.ia-sugg .pill{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid var(--bs-border-color,#dee2e6);background:transparent;color:inherit;cursor:pointer;text-align:left}.ia-sugg .pill:hover{background:rgba(124,58,237,.1)}
.ia-form{display:flex;gap:8px;align-items:flex-end;padding:10px 12px 12px;border-top:1px solid var(--bs-border-color,#dee2e6)}
.ia-form textarea{flex:1;resize:none;min-height:40px;max-height:140px;border:1px solid var(--bs-border-color,#dee2e6);border-radius:10px;padding:8px 10px;background:var(--bs-body-bg,#fff);color:inherit;font:inherit}
.ia-form button{border:0;border-radius:10px;width:42px;height:40px;background:#6d28d9;color:#fff;cursor:pointer;font-size:16px}.ia-form button:disabled{opacity:.6}
.ia-wait{display:flex;gap:5px;width:max-content}.ia-wait span{width:7px;height:7px;border-radius:50%;background:#a855f7;animation:iaDot 1s infinite}.ia-wait span:nth-child(2){animation-delay:.15s}.ia-wait span:nth-child(3){animation-delay:.3s}
@keyframes iaDot{0%,80%,100%{opacity:.25}40%{opacity:1}}
.ia-steps{list-style:none;margin:8px 0 0;padding:8px 10px;border-radius:10px;background:rgba(124,58,237,.07);font-size:12.5px;display:flex;flex-direction:column;gap:3px}.ia-steps b{font-weight:600;font-size:11.5px;color:#6d28d9;text-transform:uppercase;letter-spacing:.04em}
.ia-steps li{display:flex;gap:6px;align-items:baseline}.ia-steps .ok{color:#16a34a}.ia-steps .bad{color:#dc2626}.ia-steps .wait{color:#d97706}.ia-steps .now{color:#6d28d9;font-weight:600}.ia-steps .spin{display:inline-block;animation:iaSpin 1s linear infinite}
@keyframes iaSpin{to{transform:rotate(360deg)}}
@keyframes iaDot2{0%,80%,100%{opacity:.25}40%{opacity:1}}
@media (max-width:991.98px){
.ia-fab{right:14px;bottom:calc(var(--dw-bottom-h,64px) + env(safe-area-inset-bottom,0px) + 12px);width:52px;height:52px;padding:0;justify-content:center;gap:0}.ia-fab span{display:none}.ia-fab svg{width:28px;height:28px}
.ia-back{position:fixed;inset:0;z-index:1044;background:rgba(0,0,0,.45)}.ia-back[hidden]{display:none}
.ia-panel{left:0;right:0;bottom:0;top:auto;width:auto;height:min(82dvh,calc(100dvh - 56px));max-height:calc(100dvh - 56px);border-radius:18px 18px 0 0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom,0px)}
.ia-panel header{padding:12px 12px 10px;position:relative}.ia-panel header::before{content:"";position:absolute;top:5px;left:50%;width:38px;height:4px;margin-left:-19px;border-radius:4px;background:var(--bs-border-color,#dee2e6)}
.ia-panel header small{display:none}.ia-panel header button{width:40px;height:40px;font-size:18px}
.ia-log{padding:12px}.ia-msg{max-width:96%;font-size:14px}.ia-form{padding:8px 10px 10px}.ia-form textarea{font-size:16px}.ia-sugg{padding:0 12px 6px}}}`;

  window.DW.ready.then((me) => {
    if (me.pageAllowed === false || !me.modules?.some((m) => m.id === 'ai')) return;
    const B = '/api/ai', KEY = `dw_ia_hist_${me.business?.id || ''}`;
    let hist = [];
    try { hist = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (_) {}
    const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(hist.slice(-30))); } catch (_) {} };
    let SUGG = [];
    document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
    document.body.insertAdjacentHTML('beforeend', `
      <button class="ia-fab" id="iaFab" aria-label="Abrir IA Diwilo" title="IA Diwilo">${MARK}<span>IA Diwilo</span></button>
      <div class="ia-back" id="iaBack" hidden></div>
      <aside class="ia-panel" id="iaPanel" hidden aria-label="IA Diwilo">
        <header><span class="ia-logo">${MARK}</span><div><b>IA Diwilo</b><small>Consulta y gestiona tu negocio. Las acciones te piden confirmar.</small></div>
          <button id="iaNew" title="Nueva conversación" aria-label="Nueva conversación">✎</button><button id="iaClose" aria-label="Cerrar">✕</button></header>
        <div class="ia-log" id="iaLog" aria-live="polite"></div><div class="ia-sugg" id="iaSugg"></div>
        <form class="ia-form" id="iaForm"><textarea name="q" rows="1" maxlength="2000" placeholder="Pregunta o pide algo…" aria-label="Pregunta"></textarea><button aria-label="Enviar">➤</button></form>
      </aside>`);
    const $ = (s) => document.querySelector(s), panel = $('#iaPanel'), log = $('#iaLog'), form = $('#iaForm'), ta = form.q;
    const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-•]\s+(.*)$/gm, '<span class="li">$1</span>').replace(/\n/g, '<br>');
    const nombre = (t) => String(t).replace(/_/g, ' ');
    // Paso a paso visible: lo que va haciendo mientras trabaja y, al terminar, la lista queda debajo de la respuesta
    const etiqueta = (h) => { const [m, ...r] = String(h).split('.'); return r.length ? `${m.charAt(0).toUpperCase()}${m.slice(1)} · ${r.join(' ').replace(/_/g, ' ')}` : String(h).replace(/_/g, ' '); };
    const ICO = { consultada: ['ok', '✓', 'Consultado'], hecha: ['ok', '✓', 'Hecho'], propuesta: ['wait', '⏳', 'Por confirmar'], rechazada: ['bad', '✕', 'Descartado'], error: ['bad', '✕', 'No se pudo'] };
    const pasosHtml = (pasos, actual) => ((pasos?.length || actual) ? `<ul class="ia-steps"><b>Paso a paso</b>${(pasos || []).map((p) => { const [c, i, t] = ICO[p.estado] || ['ok', '•', '']; return `<li><span class="${c}">${i}</span><span>${esc(etiqueta(p.herramienta))} <small>${t}</small></span></li>`; }).join('')}${actual ? `<li class="now"><span class="spin">◌</span><span>${esc(actual)}</span></li>` : ''}</ul>` : '');
    const usados = (pasos) => pasosHtml(pasos, null);

    // Sugerencias: salen de los flujos que cada módulo activo declara en su guía; sin guías, unas genéricas.
    // Sugerencias: preguntas simples y cortas que declara cada módulo activo (una por módulo, para variar); sin ellas, unas genéricas.
    const corta = (x) => String(x || '').trim().length > 0 && String(x).trim().length <= 44;
    call(`${B}/guias`).then((r) => {
      const por = (r.modulos || []).map((g) => (g.preguntas?.length ? g.preguntas : (g.flujos || []).map((f) => f.nombre)).filter(corta));
      const out = [];
      for (let i = 0; out.length < 4 && i < 4; i++) for (const lista of por) if (lista[i] && out.length < 4) out.push(lista[i]);
      SUGG = out.map((x) => ({ t: x, q: x }));
      if (!panel.hidden && !hist.length) draw();
    }).catch(() => {});
    const sugerencias = () => (SUGG.length ? SUGG : ['¿Cómo va mi negocio esta semana?', '¿Qué tengo pendiente hoy?', 'Resumen del mes'].map((x) => ({ t: x, q: x })));

    function propuesta(div, p) {
      const card = document.createElement('div'); card.className = 'ia-pending';
      card.innerHTML = `<span><i>⚡</i>${esc(nombre(p.herramienta))}</span><pre>${esc(JSON.stringify(p.args, null, 2))}</pre>
        ${p.hecho ? `<small>${esc(p.hecho)}</small>` : '<div class="row"><button class="ia-b p" data-ok>Confirmar</button><button class="ia-b" data-no>Cancelar</button></div>'}`;
      card.querySelector('[data-no]')?.addEventListener('click', () => { p.hecho = 'Cancelado'; save(); draw(); });
      card.querySelector('[data-ok]')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await call(`${B}/asistente/aprobar`, { herramienta: p.herramienta, args: p.args }); p.hecho = 'Hecho'; }
        catch (x) { p.hecho = `No se pudo: ${x.message}`; }
        save(); draw();
      });
      div.appendChild(card);
    }
    function draw() {
      log.innerHTML = '';
      if (!hist.length) log.innerHTML = `<div class="ia-msg assistant">Hola. Soy la IA de ${esc(me.business?.name || 'tu negocio')}. Puedo consultar tus datos y crear o cambiar cosas con las herramientas de tus módulos; antes de cambiar algo siempre te pido confirmar.</div>`;
      for (const m of hist) {
        const div = document.createElement('div'); div.className = `ia-msg ${m.role}`;
        div.innerHTML = m.role === 'user' ? esc(m.content) : md(m.content) + usados(m.todos || m.pasos);
        (m.props || []).forEach((p) => propuesta(div, p));
        log.appendChild(div);
      }
      const ult = hist[hist.length - 1], sig = ult && ult.role === 'assistant' ? (ult.sig || []) : [];   // tras una respuesta: preguntas de seguimiento
      $('#iaSugg').innerHTML = (hist.length ? sig.map((x) => ({ q: x, t: x })) : sugerencias()).map((s) => `<button class="pill" type="button" data-q="${esc(s.q)}">${esc(s.t)}</button>`).join('');
      log.scrollTop = log.scrollHeight;
    }
    async function ask(q) {
      q = q.trim(); if (!q) return;
      hist.push({ role: 'user', content: q }); save(); draw();
      const wait = document.createElement('div'); wait.className = 'ia-msg assistant'; wait.innerHTML = '<div class="ia-wait"><span></span><span></span><span></span></div>'; log.appendChild(wait); log.scrollTop = log.scrollHeight;
      form.querySelector('button').disabled = true;
      // El asistente guarda lo que va haciendo con este id y aquí se consulta cada segundo
      const pid = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`), t = setInterval(async () => {
        try { const g = await call(`${B}/asistente/progreso?id=${pid}`); if (g && (g.pasos?.length || g.actual)) { wait.innerHTML = `<div class="ia-wait"><span></span><span></span><span></span></div>${pasosHtml(g.pasos, g.actual)}`; log.scrollTop = log.scrollHeight; } } catch (_) {}
      }, 900);
      try {
        const r = await call(`${B}/asistente`, { progreso: pid, mensajes: hist.map((m) => ({ role: m.role, content: m.content + (m.props?.some((p) => p.hecho) ? `\n(${m.props.filter((p) => p.hecho).map((p) => p.hecho).join(', ')})` : '') })) });
        hist.push({ role: 'assistant', content: r.respuesta, sig: r.siguientes || [], pasos: r.pasos.filter((p) => p.estado !== 'propuesta'), todos: r.pasos, props: r.pasos.filter((p) => p.estado === 'propuesta') });
      } catch (x) { hist.push({ role: 'assistant', content: `No pude responder: ${x.message}` }); }
      clearInterval(t); form.querySelector('button').disabled = false; save(); draw();
    }
    const open = (on) => { panel.hidden = !on; $('#iaBack').hidden = !on; $('#iaFab').classList.toggle('on', on); if (on) { draw(); setTimeout(() => ta.focus(), 50); } };
    window.DwIA = { ask: (q) => { open(true); ask(q); } };   // lo usan las secciones de IA (flujos) para abrir el botón y preguntar
    $('#iaFab').onclick = () => open(panel.hidden);
    $('#iaClose').onclick = () => open(false);
    $('#iaBack').onclick = () => open(false);
    $('#iaNew').onclick = () => { hist = []; save(); draw(); };
    $('#iaSugg').onclick = (e) => { const b = e.target.closest('.pill'); if (b) ask(b.dataset.q || b.textContent); };
    form.onsubmit = (e) => { e.preventDefault(); const q = ta.value; ta.value = ''; ta.style.height = ''; ask(q); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });
  }).catch(() => {});
})();

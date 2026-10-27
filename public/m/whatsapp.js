// Mensajes (módulo «whatsapp»): chats de WhatsApp, Instagram y Messenger como WhatsApp Web (lista a la izquierda, conversación a la derecha),
// interruptor de IA por chat, contactos en Marketing, plantillas de WhatsApp, bandejas (conexión con Meta) y agentes de IA.
// Ver: todo el equipo; configurar: propietario y administrador.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal, empty } = window.App;
  const B = '/api/whatsapp', CAN = me.canManage && !me.business.readOnly, RO = !!me.business.readOnly;
  const $ = (s, el = document) => el.querySelector(s);
  const CAN_ = { whatsapp: { n: 'WhatsApp', i: 'bi-whatsapp', c: '#25d366' }, instagram: { n: 'Instagram', i: 'bi-instagram', c: '#e4405f' }, messenger: { n: 'Messenger', i: 'bi-messenger', c: '#0a7cff' }, webhook: { n: 'Web / Webhook', i: 'bi-globe2', c: '#7c3aed' }, correo: { n: 'Correo', i: 'bi-envelope', c: '#f59e0b' } };
  const VIEWS = [['chats', 'Chats'], ['todos', 'Todos los mensajes'], ['bandejas', 'Bandejas'], ['agentes', 'Agentes de IA'], ['plantillas', 'Enviar plantillas']];
  let view = (location.hash || '#chats').slice(1), timers = [], abrirId = null;
  if (!VIEWS.some(([k]) => k === view)) view = 'chats';
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { prompt('Copia el texto:', t); } };
  const cab = (t) => `<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${t}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>`;
  const campo = (n, l, v = '', extra = '') => `<label class="small text-body-secondary d-grid gap-1">${l}<input class="form-control" name="${n}" value="${esc(v)}" ${extra}></label>`;
  const SCROLL = 'style="max-height:calc(100dvh - 130px);overflow-y:auto;align-content:start;overscroll-behavior:contain"';
  const hora = (ts) => { if (!ts) return ''; const d = new Date(ts), h = new Date(); return d.toDateString() === h.toDateString() ? d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); };
  const horaLarga = (ts) => (ts ? new Date(ts).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  // Teléfono con indicativo de país (+57 Colombia, +1 Estados Unidos…): lista de países y número nacional; se guarda como «+57 3001112233»
  const PAISES = [['57', 'CO', 'Colombia'], ['1', 'US', 'Estados Unidos / Canadá'], ['52', 'MX', 'México'], ['34', 'ES', 'España'], ['51', 'PE', 'Perú'], ['54', 'AR', 'Argentina'], ['56', 'CL', 'Chile'], ['593', 'EC', 'Ecuador'], ['58', 'VE', 'Venezuela'], ['507', 'PA', 'Panamá'], ['506', 'CR', 'Costa Rica'], ['502', 'GT', 'Guatemala'], ['503', 'SV', 'El Salvador'], ['504', 'HN', 'Honduras'], ['505', 'NI', 'Nicaragua'], ['591', 'BO', 'Bolivia'], ['595', 'PY', 'Paraguay'], ['598', 'UY', 'Uruguay'], ['55', 'BR', 'Brasil'], ['53', 'CU', 'Cuba'], ['1809', 'DO', 'Rep. Dominicana'], ['1787', 'PR', 'Puerto Rico'], ['44', 'GB', 'Reino Unido'], ['33', 'FR', 'Francia'], ['49', 'DE', 'Alemania'], ['39', 'IT', 'Italia'], ['351', 'PT', 'Portugal'], ['31', 'NL', 'Países Bajos'], ['41', 'CH', 'Suiza'], ['971', 'AE', 'Emiratos Árabes'], ['972', 'IL', 'Israel'], ['86', 'CN', 'China'], ['81', 'JP', 'Japón'], ['91', 'IN', 'India'], ['61', 'AU', 'Australia'], ['27', 'ZA', 'Sudáfrica']];
  const partirTel = (v) => {
    const d = String(v || '').replace(/\D/g, '').replace(/^00/, '');
    if (!d) return { cc: '57', iso: 'CO', num: '' };
    if (d.length === 10 && d[0] === '3') return { cc: '57', iso: 'CO', num: d };
    const p = [...PAISES].sort((a, b) => b[0].length - a[0].length).find(([cc]) => d.startsWith(cc));
    return p ? { cc: p[0], iso: p[1], num: d.slice(p[0].length) } : { cc: '57', iso: 'CO', num: d };
  };
  const telCampo = (nombre, etiqueta, valor = '') => { const p = partirTel(valor); return `<div class="small text-body-secondary d-grid gap-1">${etiqueta}<div class="d-flex gap-2"><select class="form-select" style="max-width:190px;flex:none" name="${nombre}_cc" aria-label="Indicativo del país">${PAISES.map(([cc, iso, n]) => `<option value="${cc}|${iso}" ${cc === p.cc && iso === p.iso ? 'selected' : ''}>${bandera(iso)} +${cc} ${n}</option>`).join('')}</select><input class="form-control" name="${nombre}_num" value="${esc(p.num)}" inputmode="tel" placeholder="300 123 4567" aria-label="Número"></div></div>`; };
  const leerTel = (f, nombre) => { const num = f[`${nombre}_num`].value.replace(/\D/g, '').replace(/^0+/, ''); return num ? `+${f[`${nombre}_cc`].value.split('|')[0]}${num}` : ''; };
  // De dónde escribe: país (por el indicativo del teléfono o lo que manda la web) y dispositivo. Instagram y Messenger no entregan ubicación.
  const bandera = (p) => String.fromCodePoint(...[...String(p).toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
  const paisNombre = (p) => { try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(String(p).toUpperCase()); } catch { return p; } };
  const lugar = (c) => ((c.pais || c.dispositivo) ? `<span class="wa-lug" title="${esc([c.pais ? paisNombre(c.pais) : '', c.dispositivo ? `desde ${c.dispositivo === 'móvil' ? 'un celular' : 'un computador'}` : '', c.pagina || ''].filter(Boolean).join(' · '))}">${c.pais ? `${bandera(c.pais)} ${esc(String(c.pais).toUpperCase())}` : ''}${c.dispositivo ? `${c.pais ? ' · ' : ''}<i class="bi ${c.dispositivo === 'móvil' ? 'bi-phone' : 'bi-display'}"></i> ${esc(c.dispositivo)}` : ''}</span>` : '');
  const ico = (c) => `<i class="bi ${CAN_[c]?.i || 'bi-chat'}" style="color:${CAN_[c]?.c || 'inherit'}"></i>`;

  if (!document.getElementById('wa-css')) document.head.insertAdjacentHTML('beforeend', `<style id="wa-css">
.wa-box{display:grid;grid-template-columns:340px 1fr;height:calc(100dvh - 190px);min-height:480px;border:1px solid var(--bs-border-color);border-radius:14px;overflow:hidden;background:var(--bs-body-bg)}
.wa-list{display:flex;flex-direction:column;border-right:1px solid var(--bs-border-color);min-height:0}.wa-search{padding:10px}.wa-fil{display:flex;gap:6px;padding:0 10px 8px;flex-wrap:wrap}
.wa-items{overflow-y:auto;flex:1}.wa-it{display:flex;gap:10px;padding:10px 12px;border:0;border-bottom:1px solid var(--bs-border-color-translucent);background:none;width:100%;text-align:left;color:inherit}
.wa-it:hover{background:rgba(var(--bs-emphasis-color-rgb),.04)}.wa-it.on{background:rgba(var(--bs-primary-rgb),.12)}.wa-av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:600;background:rgba(var(--bs-emphasis-color-rgb),.1);position:relative}
.wa-av i{position:absolute;right:-3px;bottom:-3px;font-size:14px;background:var(--bs-body-bg);border-radius:50%;line-height:1}.wa-it .t{min-width:0;flex:1}.wa-it.alerta{background:rgba(var(--bs-danger-rgb),.10);box-shadow:inset 4px 0 0 var(--bs-danger)}.wa-it.alerta.on{background:rgba(var(--bs-danger-rgb),.18)}.wa-pill-r{background:var(--bs-danger);color:#fff;border-radius:999px;font-size:.68rem;padding:1px 7px;white-space:nowrap}.wa-lug{font-size:.72rem;color:var(--bs-secondary-color);white-space:nowrap;font-weight:400}.wa-r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none;max-width:110px}.wa-r small{color:var(--bs-secondary-color)}.wa-ag{display:inline-flex;gap:4px;align-items:center;max-width:110px;padding:1px 8px;border-radius:999px;border:1px solid var(--bs-border-color);font-size:.7rem;color:var(--bs-secondary-color);cursor:pointer}.wa-ag span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wa-ag:hover{border-color:var(--bs-primary);color:var(--bs-primary)}.wa-it .l1{display:flex;gap:6px;align-items:baseline}.wa-it .l1 b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.wa-it .l2{display:flex;gap:6px;align-items:center;color:var(--bs-secondary-color);font-size:.85rem}.wa-it .l2 span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wa-n{background:var(--bs-primary);color:#fff;border-radius:999px;font-size:.7rem;padding:1px 7px}
.wa-chat{display:flex;flex-direction:column;min-width:0;min-height:0}.wa-cab{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--bs-border-color)}.wa-cab .t{flex:1;min-width:0}.wa-cab .t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:6px;background:rgba(var(--bs-emphasis-color-rgb),.03)}
.wa-m{max-width:78%;padding:7px 11px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word;background:var(--bs-body-bg);border:1px solid var(--bs-border-color-translucent)}.wa-m small{display:block;font-size:.68rem;opacity:.65;margin-top:2px}
.wa-m.me{align-self:flex-end;background:rgba(var(--bs-primary-rgb),.14);border-color:transparent}.wa-m.ia{align-self:flex-end;background:rgba(124,58,237,.14);border-color:transparent}
.wa-comp{display:flex;gap:8px;padding:10px;border-top:1px solid var(--bs-border-color);align-items:flex-end}.wa-comp textarea{resize:none;max-height:110px}
.wa-vacio{margin:auto;text-align:center;color:var(--bs-secondary-color);padding:24px}.wa-back{display:none}
@media (max-width:767px){.wa-box{grid-template-columns:1fr;height:calc(100dvh - 160px)}.wa-box .wa-chat{display:none}.wa-box.abierto .wa-list{display:none}.wa-box.abierto .wa-chat{display:flex}.wa-back{display:inline-block}.wa-m{max-width:90%}}
</style>`);

  function nav() {
    const el = $('[data-seg]'); el.className = 'd-flex flex-wrap gap-2 list-unstyled mb-3'; el.hidden = false;
    el.innerHTML = VIEWS.map(([k, l]) => `<button type="button" class="btn btn-sm btn-outline-secondary ${k === view ? 'active' : ''}" data-k="${k}">${esc(l)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; view = b.dataset.k; location.hash = view; nav(); render(); };
  }
  function render() { timers.forEach(clearInterval); timers = []; const old = $('[data-view]'), el = old.cloneNode(false); old.replaceWith(el); ({ chats: chatsView, todos: todosView, bandejas: bandejasView, agentes: agentesView, plantillas: plantillasView })[view](el); }
  const cada = (ms, f) => timers.push(setInterval(() => { if (!document.hidden) f(); }, ms));

  /* ---------- chats ---------- */
  async function chatsView(el) {
    el.innerHTML = `<div class="wa-box"><aside class="wa-list"><div class="wa-search"><input class="form-control form-control-sm" data-q placeholder="Buscar chats…" aria-label="Buscar chats"></div><div class="wa-fil" data-fil></div><div class="wa-items" data-items></div></aside><section class="wa-chat" data-chat></section></div>`;
    const box = $('.wa-box', el), cont = $('[data-chat]', el), lista = $('[data-items]', el);
    let items = [], sel = null, filtro = '', filtroB = '', q = '', det = null, firma = '';
    let bands = [], agentes = [];
    try { [bands, agentes] = await Promise.all([api(`${B}/bandejas`).then((r) => r.rows), api(`${B}/agentes`).then((r) => r.rows)]); } catch (_) {}
    const canales = [...new Set(bands.map((b) => b.canal))];
    // Filtros: por canal (WhatsApp, Instagram, Messenger, Web) y por bandeja (cada webhook o número con su nombre)
    $('[data-fil]', el).innerHTML = bands.length ? `${bands.length ? [['', 'Todos'], ...canales.map((c) => [c, CAN_[c]?.n || c])].map(([k, l]) => `<button class="btn btn-sm btn-outline-secondary ${k === filtro ? 'active' : ''}" data-f="${k}">${k ? ico(k) + ' ' : ''}${esc(l)}</button>`).join('') : ''}
      ${bands.length > 1 ? `<select class="form-select form-select-sm" data-fb aria-label="Filtrar por bandeja" style="max-width:100%"><option value="">Todas las bandejas</option>${bands.map((b) => `<option value="${b.id}">${esc(b.nombre)} · ${esc(CAN_[b.canal]?.n || b.canal)}</option>`).join('')}</select>` : ''}` : '';
    const vacioChat = () => { cont.innerHTML = `<div class="wa-vacio"><i class="bi bi-chat-dots fs-1"></i><div class="mt-2">Elige un chat de la izquierda</div></div>`; };

    async function cargarLista() {
      try { items = (await api(`${B}/chats?${filtro ? `canal=${filtro}&` : ''}${filtroB ? `bandeja=${filtroB}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`)).rows; } catch (x) { lista.innerHTML = `<p class="text-danger p-3 small">${esc(x.message)}</p>`; return; }
      lista.innerHTML = items.length ? items.map((c) => `<button class="wa-it ${c.id === sel ? 'on' : ''}${c.atencion ? ' alerta' : ''}" data-id="${c.id}"><span class="wa-av">${esc((c.nombre || c.contacto).trim()[0]?.toUpperCase() || '?')}${ico(c.canal)}</span>
        <span class="t"><span class="l1"><b>${esc(c.nombre || (c.canal === 'whatsapp' ? '+' : '') + c.contacto)}</b>${lugar(c)}</span>
        <span class="l2">${c.atencion ? `<b class="wa-pill-r" title="Una persona debe responder este chat">${c.atencion === 'no_sabe' ? 'No supo responder' : 'Pidió asesor'}</b>` : ''}<span>${c.ultimo_rol === 'assistant' ? 'IA: ' : c.ultimo_rol === 'humano' ? 'Tú: ' : ''}${esc(c.ultimo_texto || '')}</span>${c.ia_activa ? '' : '<i class="bi bi-person-fill" title="Atiende una persona (IA apagada)"></i>'}${c.no_leidos ? `<b class="wa-n">${c.no_leidos}</b>` : ''}</span></span>
        <span class="wa-r"><small>${esc(hora(c.ultimo_ts))}</small>${RO ? '' : `<span class="wa-ag" data-ag="${c.id}" title="Cambiar el agente de este chat" role="button"><i class="bi bi-robot"></i><span>${esc(c.agente || 'Sin agente')}</span></span>`}</span></button>`).join('')
        : `<div class="wa-vacio">${q ? 'Sin resultados.' : 'Aún no hay chats. Cuando alguien escriba a una bandeja conectada aparecerá aquí.'}</div>`;
    }
    async function cargarChat(forzar) {
      if (!sel) return;
      let d; try { d = await api(`${B}/chats/${sel}`); } catch (x) { toast(x.message, false); return; }
      const f = `${sel}|${d.mensajes.length}|${d.mensajes.at(-1)?.id}|${d.chat.ia_activa}|${d.chat.agente_id}|${d.chat.atencion}|${d.chat.nombre}|${d.contact?.id}|${d.mensajes.at(-1)?.estado}`;
      if (!forzar && f === firma && det) { det = d; return; }
      const nuevoChat = !det || det.chat.id !== d.chat.id || forzar === 'estructura'; firma = f; det = d;
      if (nuevoChat) armarChat();
      pintarCabecera(); pintarMensajes(nuevoChat);
    }
    function armarChat() {
      const c = det.chat;
      cont.innerHTML = `<div class="wa-cab"><button class="btn btn-sm btn-outline-secondary wa-back" data-back aria-label="Volver"><i class="bi bi-arrow-left"></i></button><span class="wa-av">${esc((c.nombre || c.contacto).trim()[0]?.toUpperCase() || '?')}${ico(c.canal)}</span>
        <div class="t"><b>${esc(c.nombre || (c.canal === 'whatsapp' ? '+' : '') + c.contacto)}</b><small class="text-body-secondary">${esc(CAN_[c.canal]?.n || c.canal)} · ${esc(c.bandeja)} ${lugar(c)}${c.asunto ? ` · ${esc(c.asunto)}` : ''}</small></div>
        <div data-acc class="d-flex align-items-center gap-2 flex-wrap justify-content-end"></div></div>
        <div data-aviso></div><div class="wa-log" data-log></div>
        ${RO ? '' : `<form class="wa-comp" data-form><textarea class="form-control" name="texto" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea><button class="btn btn-primary" aria-label="Enviar"><i class="bi bi-send-fill"></i></button></form>`}`;
      const form = $('[data-form]', cont);
      if (form) {
        const ta = form.texto;
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
        form.onsubmit = async (e) => {
          e.preventDefault(); const t = ta.value.trim(); if (!t) return; ta.value = ''; form.querySelector('button').disabled = true;
          try { await api(`${B}/chats/${sel}/enviar`, { method: 'POST', body: { texto: t } }); if (det.chat.ia_activa) toast('Respondiste tú: la IA se apagó en este chat'); } catch (x) { toast(x.message, false); }
          form.querySelector('button').disabled = false; ta.focus(); await cargarChat(true); cargarLista();
        };
      }
    }
    function pintarCabecera() {
      const c = det.chat, acc = $('[data-acc]', cont), conv = det.contact;
      acc.innerHTML = `${RO ? '' : `<button class="btn btn-sm btn-outline-secondary" data-agbtn title="Elegir qué agente atiende este chat"><i class="bi bi-robot me-1"></i>${esc(det.agente?.nombre || 'Sin agente')}</button><div class="form-check form-switch m-0" title="Cuando está encendida, el agente de la bandeja responde en este chat"><input class="form-check-input" type="checkbox" role="switch" id="wa-ia" data-ia ${c.ia_activa ? 'checked' : ''}><label class="form-check-label small" for="wa-ia">IA</label></div>`}
        <button class="btn btn-sm btn-outline-primary" data-cto><i class="bi bi-person-lines-fill me-1"></i>${conv ? esc(conv.name) : 'Contacto'}</button>
        ${c.canal === 'whatsapp' && !RO ? '<button class="btn btn-sm btn-outline-success" data-tpl><i class="bi bi-file-earmark-text me-1"></i>Plantilla</button>' : ''}
        ${CAN ? '<button class="btn btn-sm btn-outline-danger" data-del aria-label="Borrar chat"><i class="bi bi-trash"></i></button>' : ''}`;
      const av = $('[data-aviso]', cont);
      const rojo = c.atencion ? `<div class="alert alert-danger small m-2 py-2 d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-exclamation-triangle-fill me-1"></i><b>${c.atencion === 'no_sabe' ? 'El agente no supo responder.' : 'El cliente pidió hablar con un asesor.'}</b> Una persona debe atender este chat.</span>${RO ? '' : '<button class="btn btn-sm btn-outline-danger ms-auto" data-ok>Ya lo atendí</button>'}</div>` : '';
      av.innerHTML = rojo + (!det.ventana_abierta ? `<div class="alert alert-warning small m-2 py-2">Pasaron más de 24 h desde el último mensaje de esta persona. ${c.canal === 'whatsapp' ? 'Solo puedes escribirle con una <b>plantilla</b>.' : 'Meta ya no deja escribirle en este canal hasta que ella escriba.'}</div>`
        : (c.ia_activa && !det.agente ? '<div class="alert alert-light border small m-2 py-2">Este chat no tiene agente: nadie responde solo. Elígelo con el botón del agente.</div>' : ''));
    }
    function pintarMensajes(baja) {
      const log = $('[data-log]', cont), abajo = baja || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      log.innerHTML = det.mensajes.map((m) => `<div class="wa-m ${m.rol === 'humano' ? 'me' : m.rol === 'assistant' ? 'ia' : ''}">${esc(m.contenido)}<small>${m.rol === 'assistant' ? 'Agente IA · ' : m.rol === 'humano' ? 'Equipo · ' : ''}${esc(horaLarga(m.ts))}${m.estado && m.estado !== 'enviado' ? ` · ${m.estado === 'sin_clave' ? 'sin clave API' : 'no se envió'}` : ''}</small></div>`).join('') || '<div class="wa-vacio">Sin mensajes.</div>';
      if (abajo) log.scrollTop = log.scrollHeight;
    }
    async function abrir(id) { sel = id; det = null; firma = ''; box.classList.add('abierto'); await cargarChat('estructura'); try { await api(`${B}/chats/${id}/leer`, { method: 'POST' }); } catch (_) {} cargarLista(); }

    // Elegir qué agente atiende un chat: los de su bandeja y los de todas las bandejas
    async function elegirAgente(chat) {
      try { agentes = (await api(`${B}/agentes`)).rows; } catch (_) {}
      const ops = agentes.filter((a) => !(a.bandejas || []).length || a.bandejas.includes(chat.bandeja_id));
      const { el: mo, m: mm } = modal(`${cab('Agente de este chat')}<div class="modal-body d-grid gap-2" style="max-height:calc(100dvh - 130px);overflow-y:auto;align-content:start;overscroll-behavior:contain">
        <div class="small text-body-secondary mb-1">Chat de <b>${esc(chat.nombre || chat.contacto)}</b> · ${esc(chat.bandeja)}</div>
        ${ops.map((a) => `<button class="btn ${a.id === chat.agente_id ? 'btn-primary' : 'btn-outline-secondary'} text-start" data-a="${a.id}"><i class="bi bi-robot me-2"></i>${esc(a.nombre)}${a.id === chat.agente_id ? ' <i class="bi bi-check2 float-end"></i>' : ''}</button>`).join('') || '<div class="small text-body-secondary">No hay agentes para esta bandeja. Créalos en la pestaña «Agentes de IA».</div>'}
        <button class="btn ${chat.agente_id === 0 ? 'btn-primary' : 'btn-outline-secondary'} text-start" data-a="0"><i class="bi bi-person me-2"></i>Sin agente (lo atiende una persona)</button></div>`);
      mo.onclick = async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        try { await api(`${B}/chats/${chat.id}`, { method: 'PATCH', body: { agente_id: +b.dataset.a } }); mm.hide(); toast('Agente cambiado'); await cargarChat(true); cargarLista(); } catch (x) { toast(x.message, false); }
      };
    }
    lista.onclick = (e) => {
      const ag = e.target.closest('[data-ag]');
      if (ag) { e.stopPropagation(); const c = items.find((x) => x.id === +ag.dataset.ag); if (c) elegirAgente(c); return; }
      const b = e.target.closest('[data-id]'); if (b) abrir(+b.dataset.id);
    };
    $('[data-fil]', el).onchange = (e) => { const s = e.target.closest('[data-fb]'); if (s) { filtroB = s.value; cargarLista(); } };
    $('[data-q]', el).oninput = (e) => { clearTimeout(el._t); el._t = setTimeout(() => { q = e.target.value.trim(); cargarLista(); }, 300); };
    $('[data-fil]', el).onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; filtro = b.dataset.f; el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); cargarLista(); };
    cont.onclick = async (e) => {
      if (e.target.closest('[data-back]')) { box.classList.remove('abierto'); return; }
      if (e.target.closest('[data-ok]')) { try { await api(`${B}/chats/${sel}`, { method: 'PATCH', body: { atencion: false } }); toast('Marcado como atendido'); await cargarChat(true); cargarLista(); } catch (x) { toast(x.message, false); } return; }
      if (e.target.closest('[data-agbtn]')) return elegirAgente({ ...det.chat, agente_id: det.chat.agente_id });
      if (e.target.closest('[data-cto]')) return contacto(det, async () => { await cargarChat(true); cargarLista(); });
      if (e.target.closest('[data-tpl]')) return plantillaChat(det, async () => { await cargarChat(true); cargarLista(); });
      if (e.target.closest('[data-del]')) {
        if (!(await confirm({ title: '¿Borrar este chat?', text: 'Se borran sus mensajes. No se puede deshacer.', ok: 'Borrar' }))) return;
        try { await api(`${B}/chats/${sel}`, { method: 'DELETE' }); toast('Chat borrado'); sel = null; det = null; vacioChat(); box.classList.remove('abierto'); cargarLista(); } catch (x) { toast(x.message, false); }
      }
    };
    cont.onchange = async (e) => {
      const sw = e.target.closest('[data-ia]'); if (!sw) return;
      try { await api(`${B}/chats/${sel}`, { method: 'PATCH', body: { ia_activa: sw.checked } }); toast(sw.checked ? 'IA encendida en este chat' : 'IA apagada: atiendes tú'); await cargarChat(true); cargarLista(); } catch (x) { toast(x.message, false); sw.checked = !sw.checked; }
    };
    vacioChat(); await cargarLista();
    if (abrirId) { const id = abrirId; abrirId = null; abrir(id); }
    cada(6000, cargarLista); cada(4000, () => cargarChat(false));
  }

  /* ---------- todos los mensajes ---------- */
  async function todosView(el) {
    let bands = []; try { bands = (await api(`${B}/bandejas`)).rows; } catch (_) {}
    const canales = [...new Set(bands.map((b) => b.canal))];
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3 align-items-center"><input class="form-control form-control-sm" style="max-width:260px" data-q placeholder="Buscar en todos los mensajes…" aria-label="Buscar">
      <div class="d-flex flex-wrap gap-1" data-fil>${bands.length ? [['', 'Todos'], ...canales.map((c) => [c, CAN_[c]?.n || c])].map(([k, l]) => `<button class="btn btn-sm btn-outline-secondary ${k === '' ? 'active' : ''}" data-f="${k}">${k ? ico(k) + ' ' : ''}${esc(l)}</button>`).join('') : ''}</div>
      ${bands.length > 1 ? `<select class="form-select form-select-sm" style="max-width:240px" data-fb aria-label="Filtrar por bandeja"><option value="">Todas las bandejas</option>${bands.map((b) => `<option value="${b.id}">${esc(b.nombre)} · ${esc(CAN_[b.canal]?.n || b.canal)}</option>`).join('')}</select>` : ''}</div>
      <div class="list-group" data-lista></div>`;
    let canal = '', bandeja = '', q = '', rows = [];
    async function cargar() {
      try { rows = (await api(`${B}/mensajes?${canal ? `canal=${canal}&` : ''}${bandeja ? `bandeja=${bandeja}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`)).rows; } catch (x) { $('[data-lista]', el).innerHTML = `<p class="text-danger small">${esc(x.message)}</p>`; return; }
      $('[data-lista]', el).innerHTML = rows.length ? rows.map((m, i) => `<button type="button" class="list-group-item list-group-item-action" data-i="${i}">
        <div class="d-flex gap-2 align-items-baseline"><span>${ico(m.canal)}</span><b class="text-truncate">${esc(m.nombre || (m.canal === 'whatsapp' ? '+' : '') + m.contacto)}</b>${lugar(m)}<span class="small text-body-secondary ms-auto text-nowrap">${esc(horaLarga(m.ts))}</span></div>
        <div class="small text-body-secondary">${esc(m.bandeja)} · ${m.rol === 'assistant' ? 'Agente IA' : m.rol === 'humano' ? 'Equipo' : 'Cliente'}</div>
        <div class="text-truncate">${esc(m.contenido)}</div></button>`).join('') : empty('bi-chat-left-text', 'Aún no hay mensajes.');
    }
    $('[data-q]', el).oninput = (e) => { clearTimeout(el._t); el._t = setTimeout(() => { q = e.target.value.trim(); cargar(); }, 300); };
    $('[data-fil]', el).onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; canal = b.dataset.f; el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); cargar(); };
    const fb = $('[data-fb]', el); if (fb) fb.onchange = () => { bandeja = fb.value; cargar(); };
    $('[data-lista]', el).onclick = (e) => { const b = e.target.closest('[data-i]'); const m = b && rows[+b.dataset.i]; if (m?.chat_id) { abrirId = m.chat_id; view = 'chats'; location.hash = 'chats'; nav(); render(); } };
    await cargar(); cada(8000, cargar);
  }

  // Datos del contacto del chat: lo que capturó el agente o lo que escribe el equipo → contacto de Marketing (sin duplicar por teléfono)
  function contacto(det, listo) {
    const c = det.chat, k = det.contact, d = c.datos || {}, wa = c.canal === 'whatsapp';
    const opt = (v, l, sel) => `<option value="${v}" ${sel === v ? 'selected' : ''}>${l}</option>`;
    const cliente = k?.stage === 'cliente' || /^s[ií]/i.test(d.es_cliente || '') ? 'si' : 'no';
    const { el: mo, m: mm } = modal(`${cab('Datos del contacto')}<form class="modal-body d-grid gap-3" ${SCROLL}>
      ${k ? `<div class="alert alert-success small mb-0"><i class="bi bi-check-circle me-1"></i>Enlazado con el contacto <b>${esc(k.name)}</b> de Marketing${k.stage ? ` (${esc(k.stage)})` : ''}. Lo que cambies aquí lo actualiza.</div>` : '<div class="alert alert-light border small mb-0">Este chat aún no está en Marketing. Completa los datos y se crea el contacto (si el teléfono ya existe, se actualiza el de siempre).</div>'}
      ${!det.marketing ? '<div class="alert alert-warning small mb-0">Marketing no está activo en tu negocio: pídele a Diwilo que lo active para guardar contactos.</div>' : ''}
      ${campo('nombre', 'Nombre de la persona', k?.name || d.nombre || '', 'maxlength="120" placeholder="Nombre y apellido"')}
      ${wa ? `<div class="small text-body-secondary">Teléfono: <b>+${esc(c.contacto)}</b> ${c.pais ? `${bandera(c.pais)} ${esc(paisNombre(c.pais))}` : ''} (el del chat)</div>` : telCampo('tel', 'Teléfono (elige el indicativo del país)', k?.phone || d.telefono || '')}
      ${campo('correo', 'Correo electrónico', k?.email || d.correo || '', 'type="email" placeholder="nombre@empresa.com"')}
      <div class="row g-2"><div class="col-sm-6">${campo('empresa', 'Negocio o empresa', k?.company || d.empresa || '', 'maxlength="120"')}</div>
        <div class="col-sm-6"><label class="small text-body-secondary d-grid gap-1">Escribe como<select class="form-select" name="tipo">${opt('', '—', d.tipo || '')}${opt('persona', 'Persona', d.tipo || '')}${opt('negocio', 'Negocio o empresa', d.tipo || '')}</select></label></div></div>
      <div class="row g-2"><div class="col-sm-6">${campo('ciudad', 'Ciudad', d.ciudad || '', 'maxlength="80"')}</div>
        <div class="col-sm-6"><label class="small text-body-secondary d-grid gap-1">¿Ya es cliente?<select class="form-select" name="es_cliente">${opt('no', 'No, es nuevo (lead)', cliente)}${opt('si', 'Sí, ya es cliente', cliente)}</select></label></div></div>
      ${campo('interes', 'Qué busca / notas', d.interes || '', 'maxlength="300"')}
      ${d.extras && Object.keys(d.extras).length ? `<div class="small text-body-secondary">${Object.entries(d.extras).map(([a, z]) => `${esc(a)}: <b>${esc(z)}</b>`).join('<br>')}</div>` : ''}
      <button class="btn btn-primary" ${det.marketing && !RO ? '' : 'disabled'}>${k ? 'Actualizar en Marketing' : 'Guardar en Marketing'}</button></form>`);
    mo.querySelector('form').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, btn = f.querySelector('button.btn-primary'); btn.disabled = true;
      const body = { nombre: f.nombre.value.trim(), correo: f.correo.value.trim(), empresa: f.empresa.value.trim(), interes: f.interes.value.trim(), tipo: f.tipo.value, ciudad: f.ciudad.value.trim(), es_cliente: f.es_cliente.value, ...(d.extras ? { extras: d.extras } : {}), ...(wa ? {} : { telefono: leerTel(f, 'tel') }) };
      try { const r = await api(`${B}/chats/${c.id}/contacto`, { method: 'POST', body }); mm.hide(); toast(r.creado ? 'Contacto creado en Marketing' : 'Contacto actualizado'); listo?.(); } catch (x) { toast(x.message, false); btn.disabled = false; }
    };
  }

  /* ---------- plantillas ---------- */
  // Formulario de variables de una plantilla (cuerpo con vista previa); `ctx` guarda lo que llenó la persona
  const formPlantilla = (rows, sel) => `<label class="small text-body-secondary d-grid gap-1">Plantilla aprobada<select class="form-select" name="plantilla">${rows.map((p, i) => `<option value="${i}" ${i === sel ? 'selected' : ''} ${p.soportada ? '' : 'disabled'}>${esc(p.nombre)} · ${esc(p.idioma)}${p.soportada ? '' : ' (envíala desde Meta)'}</option>`).join('')}</select></label>
    <div data-vars class="d-grid gap-2"></div><div class="small p-2 rounded-3" style="background:rgba(var(--bs-body-color-rgb),.06);white-space:pre-wrap" data-prev></div>`;
  function varsPlantilla(f, rows) {
    const p = rows[+f.plantilla.value], box = f.querySelector('[data-vars]'), prev = f.querySelector('[data-prev]');
    box.innerHTML = Array.from({ length: p?.variables || 0 }, (_, i) => campo(`v${i + 1}`, `Variable {{${i + 1}}} <span class="text-body-tertiary">(usa {nombre} para el nombre de cada contacto)</span>`, i === 0 ? '{nombre}' : '', 'required maxlength="500"')).join('');
    const pintar = () => { prev.textContent = (p?.cuerpo || '').replace(/\{\{(\d+)\}\}/g, (_, n) => f[`v${n}`]?.value || `{{${n}}}`); };
    box.oninput = pintar; pintar();
    return p;
  }
  const valores = (f, p) => Array.from({ length: p.variables }, (_, i) => f[`v${i + 1}`].value);
  async function plantillaChat(det, listo) {
    let rows; try { rows = (await api(`${B}/plantillas?bandeja=${det.chat.bandeja_id}`)).rows; } catch (x) { return toast(x.message, false); }
    if (!rows.length) return toast('Esta cuenta no tiene plantillas aprobadas. Créalas en WhatsApp Manager.', false);
    const { el: mo, m: mm } = modal(`${cab('Enviar plantilla')}<form class="modal-body d-grid gap-3" style="max-height:calc(100dvh - 130px);overflow-y:auto;align-content:start;overscroll-behavior:contain">${formPlantilla(rows, Math.max(0, rows.findIndex((r) => r.soportada)))}<button class="btn btn-success">Enviar a este chat</button></form>`);
    const f = mo.querySelector('form'); let p = varsPlantilla(f, rows); f.plantilla.onchange = () => { p = varsPlantilla(f, rows); };
    f.onsubmit = async (e) => {
      e.preventDefault(); const btn = f.querySelector('button.btn-success'); btn.disabled = true;
      try { const r = await api(`${B}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: det.chat.bandeja_id, plantilla: p.nombre, idioma: p.idioma, variables: valores(f, p), chats: [det.chat.id] } }); if (r.fallidos?.length) throw new Error(r.fallidos[0].error); mm.hide(); toast('Plantilla enviada'); listo?.(); } catch (x) { toast(x.message, false); btn.disabled = false; }
    };
  }
  async function plantillasView(el) {
    let bands; try { bands = (await api(`${B}/bandejas`)).rows.filter((b) => b.canal === 'whatsapp' && b.activo); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    if (!bands.length) { el.innerHTML = empty('bi-file-earmark-text', 'Necesitas una bandeja de WhatsApp activa para enviar plantillas.'); return; }
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Elige contactos de <b>Marketing</b> con teléfono y una plantilla aprobada por Meta. Envía solo a personas que aceptaron recibir tus mensajes (política de WhatsApp y Ley 1581). Máximo 50 por envío.</div>
      <form class="row g-3" data-f><div class="col-lg-5 d-grid gap-3 align-content-start">
        <label class="small text-body-secondary d-grid gap-1">Bandeja<select class="form-select" name="bandeja">${bands.map((b) => `<option value="${b.id}">${esc(b.nombre)} · ${esc(b.telefono)}</option>`).join('')}</select></label>
        <div data-tpl class="d-grid gap-3"><div class="small text-body-secondary">Cargando plantillas…</div></div>
        <button class="btn btn-success" data-send disabled><i class="bi bi-send me-1"></i>Enviar a <span data-cnt>0</span> contactos</button><div data-res></div></div>
        <div class="col-lg-7"><input class="form-control form-control-sm mb-2" data-q placeholder="Buscar contactos de Marketing…"><div class="list-group" data-lista style="max-height:55vh;overflow:auto"></div></div></form>`;
    const f = $('[data-f]', el), elegidos = new Map(); let rows = [], p = null;
    const cuenta = () => { $('[data-cnt]', el).textContent = elegidos.size; $('[data-send]', el).disabled = !elegidos.size || !p; };
    async function plantillas() {
      const t = $('[data-tpl]', el); t.innerHTML = '<div class="small text-body-secondary">Cargando plantillas…</div>'; p = null; cuenta();
      try { rows = (await api(`${B}/plantillas?bandeja=${f.bandeja.value}`)).rows; } catch (x) { t.innerHTML = `<div class="text-danger small">${esc(x.message)}</div>`; return; }
      if (!rows.length) { t.innerHTML = '<div class="text-danger small">Esta cuenta no tiene plantillas aprobadas.</div>'; return; }
      t.innerHTML = formPlantilla(rows, Math.max(0, rows.findIndex((r) => r.soportada))); p = varsPlantilla(f, rows); f.plantilla.onchange = () => { p = varsPlantilla(f, rows); cuenta(); }; cuenta();
    }
    async function contactos(q = '') {
      let r; try { r = await api(`${B}/contactos?q=${encodeURIComponent(q)}`); } catch (x) { return toast(x.message, false); }
      $('[data-lista]', el).innerHTML = !r.marketing ? '<div class="p-3 small text-body-secondary">Marketing no está activo en tu negocio: pídele a Diwilo que lo active para elegir contactos.</div>'
        : r.rows.length ? r.rows.map((c) => `<label class="list-group-item d-flex gap-2 align-items-center"><input class="form-check-input mt-0" type="checkbox" data-c="${c.id}" ${elegidos.has(c.id) ? 'checked' : ''}><span class="flex-grow-1"><b>${esc(c.name)}</b><br><small class="text-body-secondary">${esc(c.phone)}${c.email ? ` · ${esc(c.email)}` : ''}</small></span><span class="badge text-bg-light">${esc(c.stage || '')}</span></label>`).join('')
        : '<div class="p-3 small text-body-secondary">No hay contactos con teléfono.</div>';
    }
    $('[data-lista]', el).onchange = (e) => { const c = e.target.closest('[data-c]'); if (!c) return; c.checked ? elegidos.set(+c.dataset.c, 1) : elegidos.delete(+c.dataset.c); cuenta(); };
    $('[data-q]', el).oninput = (e) => { clearTimeout(el._t); el._t = setTimeout(() => contactos(e.target.value.trim()), 300); };
    f.bandeja.onchange = plantillas;
    f.onsubmit = async (e) => {
      e.preventDefault(); if (!p || !elegidos.size) return;
      if (!(await confirm({ title: `¿Enviar a ${elegidos.size} contacto${elegidos.size === 1 ? '' : 's'}?`, text: 'Confirma que aceptaron recibir mensajes tuyos por WhatsApp.', ok: 'Enviar' }))) return;
      const btn = $('[data-send]', el); btn.disabled = true;
      try {
        const r = await api(`${B}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: +f.bandeja.value, plantilla: p.nombre, idioma: p.idioma, variables: valores(f, p), contactos: [...elegidos.keys()] } });
        $('[data-res]', el).innerHTML = `<div class="alert ${r.fallidos.length ? 'alert-warning' : 'alert-success'} small">Enviados: <b>${r.enviados}</b>${r.fallidos.length ? `<br>Con error (${r.fallidos.length}):<br>${r.fallidos.map((x) => `${esc(x.nombre || x.para)}: ${esc(x.error || '')}`).join('<br>')}` : ''}</div>`;
        if (r.enviados) toast('Plantillas enviadas');
      } catch (x) { toast(x.message, false); }
      btn.disabled = !elegidos.size;
    };
    await Promise.all([plantillas(), contactos()]);
  }

  /* ---------- bandejas ---------- */
  const AYUDA = {
    whatsapp: 'Número de WhatsApp Business (Cloud API). En Meta: WhatsApp → Configuración de la API.',
    instagram: 'Cuenta profesional de Instagram conectada a una página. Token de la página con permiso instagram_manage_messages; el ID es el de la cuenta de Instagram.',
    messenger: 'Página de Facebook. Token de la página con permiso pages_messaging; el ID es el de la página.',
    correo: 'Una dirección de tu dominio (hola@tuempresa.com): los correos que lleguen aparecen como chats y respondes desde aquí, en el mismo hilo. Se conecta con Cloudflare Email Routing.',
    webhook: 'Para el chat de tu web, n8n u otro sistema: tu sistema envía cada mensaje a la URL de abajo y aquí lo ves y lo atiendes. Puedes crear todas las que necesites, cada una con su nombre.',
  };
  const ejemplo = (b) => `curl -X POST "${b.webhook_url}?token=${b.verify_token}" \\\n  -H "content-type: application/json" \\\n  -d '{"contacto":"visitante-123","nombre":"Ana","mensaje":"Hola, quiero información","responder":true}'`;
  async function bandejasView(el) {
    let rows; try { rows = (await api(`${B}/bandejas`)).rows; } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-info-circle me-1"></i>Cada bandeja es una cuenta conectada a Meta: un número de <b>WhatsApp</b>, una cuenta de <b>Instagram</b> o una página de <b>Messenger</b>. Copia la <b>URL del webhook</b> y el <b>token de verificación</b> en Meta (Webhooks de cada producto) y suscríbete al campo <b>messages</b>. Instagram y Messenger solo atienden a clientes reales cuando Meta aprueba los permisos de tu app; antes funcionan con cuentas de prueba.</div>
      ${CAN ? '<div class="mb-3"><button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nueva bandeja</button></div>' : ''}
      <div class="row g-3">${rows.length ? rows.map((b) => `<div class="col-lg-6"><div class="dw-card h-100" data-id="${b.id}">
        <div class="d-flex align-items-start gap-2"><span class="fs-4">${ico(b.canal)}</span><div class="flex-grow-1" style="min-width:0"><h2 class="h6 mb-0 text-truncate">${esc(b.nombre)}</h2><span class="small text-body-secondary">${esc(CAN_[b.canal]?.n || b.canal)}${b.telefono ? ` · ${esc(b.telefono)}` : ''}</span></div>
          <span class="badge ${b.activo ? 'text-bg-success' : 'text-bg-secondary'}">${b.activo ? 'Activa' : 'En pausa'}</span></div>
        <div class="small mt-2 d-grid gap-1">
          ${b.canal === 'correo' ? `<div>Dirección: <span class="font-monospace">${esc(b.phone_number_id)}</span>${b.reenviar_a ? ` · copia a <span class="font-monospace">${esc(b.reenviar_a)}</span>` : ''}</div>
            <div class="text-body-secondary">Para recibir: en <b>Cloudflare → Email Routing → Routing rules</b>, la regla de <b>${esc(b.phone_number_id)}</b> debe usar la acción <b>Send to a Worker → diwilo-modulos</b>. Las respuestas salen por Cloudflare Email Sending.</div>` : ''}
          ${b.canal === 'webhook' ? `<div>Respuestas a tu sistema: ${b.url_salida ? `<span class="font-monospace text-break">${esc(b.url_salida)}</span>` : '<span class="text-body-secondary">sin URL de salida</span>'}</div>`
            : b.canal === 'correo' ? '' : `<div>${b.canal === 'whatsapp' ? 'ID de número' : b.canal === 'instagram' ? 'ID de la cuenta de Instagram' : 'ID de la página'}: <span class="font-monospace">${esc(b.phone_number_id)}</span>${b.waba_id ? ` · Cuenta: <span class="font-monospace">${esc(b.waba_id)}</span>` : ''}</div>
          <div>Clave API: ${b.tiene_clave ? '<span class="text-success">guardada</span>' : '<span class="text-danger">falta</span>'}${b.tiene_secreto ? ' · firma del webhook validada' : ''}</div>`}
          <div class="d-flex align-items-center gap-1"><span class="text-body-secondary">URL del webhook</span><button class="btn btn-sm btn-link p-0 ms-auto" data-cp="${esc(b.webhook_url)}"><i class="bi bi-clipboard"></i> Copiar</button></div>
          <div class="font-monospace small text-break p-2 rounded-3" style="background:rgba(var(--bs-body-color-rgb),.06)">${esc(b.webhook_url)}</div>
          ${b.canal === 'webhook' && b.verify_token ? `<div class="d-flex align-items-center gap-1"><span class="text-body-secondary">Ejemplo de envío (copia y pega)</span><button class="btn btn-sm btn-link p-0 ms-auto" data-cp="${esc(ejemplo(b))}"><i class="bi bi-clipboard"></i> Copiar</button></div>
          <div class="font-monospace small text-break p-2 rounded-3" style="background:rgba(var(--bs-body-color-rgb),.06);white-space:pre-wrap">${esc(ejemplo(b))}</div>
          <div class="text-body-secondary">Con <b>responder:true</b> el agente contesta en la misma llamada ({ "respuesta": "…" }). Sin eso solo se guarda el mensaje (también puedes mandar <b>rol</b>: "assistant" para guardar lo que contestó tu propio agente).</div>` : ''}
          ${b.verify_token ? `<div class="d-flex align-items-center gap-1"><span class="text-body-secondary">${b.canal === 'webhook' ? 'Token (va en la URL como ?token=)' : 'Token de verificación'}</span><button class="btn btn-sm btn-link p-0 ms-auto" data-cp="${esc(b.verify_token)}"><i class="bi bi-clipboard"></i> Copiar</button></div>
          <div class="font-monospace small text-break p-2 rounded-3" style="background:rgba(var(--bs-body-color-rgb),.06)">${esc(b.verify_token)}</div>` : ''}</div>
        ${CAN ? `<div class="d-flex flex-wrap gap-1 mt-3"><button class="btn btn-sm btn-primary" data-edit><i class="bi bi-gear me-1"></i>Ajustes</button>
          <button class="btn btn-sm btn-outline-success" data-probar><i class="bi bi-patch-check me-1"></i>Probar conexión</button>
          <button class="btn btn-sm btn-outline-secondary" data-act>${b.activo ? 'Pausar' : 'Activar'}</button>
          <button class="btn btn-sm btn-outline-secondary" data-tok>Nuevo token</button><button class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash"></i></button></div>` : ''}</div></div>`).join('')
        : `<div class="col-12">${empty('bi-chat-dots', 'Aún no tienes bandejas. Conecta tu primer canal.', CAN ? '<button class="btn btn-primary" data-new>Crear mi primera bandeja</button>' : '')}</div>`}</div>`;
    const form = (b) => {
      const canal0 = b?.canal || 'whatsapp';
      const { el: mo, m: mm } = modal(`${cab(b ? 'Ajustes de la bandeja' : 'Nueva bandeja')}<form class="modal-body d-grid gap-3" style="max-height:calc(100dvh - 130px);overflow-y:auto;align-content:start;overscroll-behavior:contain" autocomplete="off">
        ${b ? '' : `<label class="small text-body-secondary d-grid gap-1">Canal<select class="form-select" name="canal">${Object.entries(CAN_).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></label>`}
        <div class="small text-body-secondary" data-ayuda>${AYUDA[canal0]}</div>
        ${campo('nombre', 'Nombre de la bandeja de entrada', b?.nombre, 'required maxlength="80" placeholder="Ventas"')}
        <div data-wa class="d-grid gap-3">${telCampo('tel', 'Número de teléfono de WhatsApp (elige el indicativo del país)', b?.telefono || '')}${campo('waba_id', 'ID de la cuenta de WhatsApp Business', b?.waba_id, 'inputmode="numeric"')}</div>
        <div data-meta class="d-grid gap-3">${campo('phone_number_id', `<span data-idl>${canal0 === 'whatsapp' ? 'ID del número de teléfono' : canal0 === 'instagram' ? 'ID de la cuenta de Instagram' : 'ID de la página'}</span>`, b?.phone_number_id, 'inputmode="numeric"')}
          ${campo('api_key', 'Clave API (token de acceso de Meta)', '', `type="password" autocomplete="new-password" placeholder="${b?.tiene_clave ? 'Guardada — déjalo vacío para conservarla' : 'EAAG…'}"`)}
          ${campo('app_secret', 'Secreto de la app de Meta (opcional, valida la firma del webhook)', '', `type="password" autocomplete="new-password" placeholder="${b?.tiene_secreto ? 'Guardado — déjalo vacío para conservarlo' : ''}"`)}</div>
        <div data-mail class="d-grid gap-3">${campo('correo_dir', 'Dirección de correo de la bandeja', b?.canal === 'correo' ? b.phone_number_id : '', 'type="email" placeholder="hola@tuempresa.com"')}${campo('reenviar_a', 'Seguir enviando una copia de cada correo a (opcional; debe estar verificada en Cloudflare)', b?.reenviar_a || '', 'type="email" placeholder="tu-correo@gmail.com"')}</div>
        <div data-web class="d-grid gap-3">${campo('url_salida', 'URL de salida (opcional): aquí enviamos las respuestas del equipo y del agente', b?.url_salida || '', 'type="url" placeholder="https://tu-sistema.com/mensajes"')}</div>
        <button class="btn btn-primary">${b ? 'Guardar' : 'Crear bandeja'}</button></form>`);
      const f = mo.querySelector('form');
      const ver = () => { const c = b ? b.canal : f.canal.value; f.querySelector('[data-wa]').hidden = c !== 'whatsapp'; f.querySelector('[data-meta]').hidden = c === 'webhook' || c === 'correo'; f.querySelector('[data-mail]').hidden = c !== 'correo'; f.querySelector('[data-web]').hidden = c !== 'webhook'; f.querySelector('[data-ayuda]').textContent = AYUDA[c]; f.querySelector('[data-idl]').textContent = c === 'whatsapp' ? 'ID del número de teléfono' : c === 'instagram' ? 'ID de la cuenta de Instagram' : 'ID de la página'; };
      if (f.canal) f.canal.onchange = ver; ver();
      f.onsubmit = async (e) => {
        e.preventDefault(); const v = (n) => f[n].value.trim(), btn = f.querySelector('button'), canal = b ? b.canal : v('canal'); btn.disabled = true;
        const core = canal === 'correo' ? { nombre: v('nombre'), phone_number_id: v('correo_dir'), reenviar_a: v('reenviar_a') } : canal === 'webhook' ? { nombre: v('nombre'), url_salida: v('url_salida') } : { nombre: v('nombre'), phone_number_id: v('phone_number_id'), ...(canal === 'whatsapp' ? { telefono: leerTel(f, 'tel'), waba_id: v('waba_id') } : {}) };
        try {
          if (b) {
            await api(`${B}/bandejas/${b.id}`, { method: 'PATCH', body: core });
            const cred = {}; if (canal !== 'webhook' && canal !== 'correo' && v('api_key')) cred.api_key = v('api_key'); if (canal !== 'webhook' && canal !== 'correo' && v('app_secret')) cred.app_secret = v('app_secret');
            if (Object.keys(cred).length) await api(`${B}/bandejas/${b.id}/credenciales`, { method: 'POST', body: cred });
          } else await api(`${B}/bandejas`, { method: 'POST', body: { ...core, canal, ...(canal !== 'webhook' && canal !== 'correo' && v('api_key') ? { api_key: v('api_key') } : {}), ...(canal !== 'webhook' && canal !== 'correo' && v('app_secret') ? { app_secret: v('app_secret') } : {}) } });
          mm.hide(); toast(b ? 'Bandeja guardada' : 'Bandeja creada'); render();
        } catch (x) { toast(x.message, false); btn.disabled = false; }
      };
    };
    // Verificador: revisa la clave y los IDs contra Meta y, en WhatsApp, si pones un número manda un mensaje de prueba
    const probar = (b) => {
      const wa = b.canal === 'whatsapp' || b.canal === 'correo', correo = b.canal === 'correo';
      const { el: mo } = modal(`${cab('Probar conexión')}<form class="modal-body d-grid gap-3" style="max-height:calc(100dvh - 130px);overflow-y:auto;align-content:start;overscroll-behavior:contain">
        <p class="small text-body-secondary mb-0">Revisa la clave API y los IDs con Meta${wa ? '. Si escribes un número, también le enviamos un mensaje de prueba (un texto si escribió en las últimas 24 h; si no, una plantilla aprobada).' : '.'}</p>
        ${correo ? campo('para', 'Correo que recibe la prueba (opcional)', '', 'type="email" placeholder="tu-correo@gmail.com"') : wa ? campo('para', 'Número que recibe el mensaje de prueba (opcional)', '+57', 'placeholder="+57 300 123 4567" inputmode="tel"') : ''}
        <button class="btn btn-success">Probar</button><div data-res></div></form>`);
      mo.querySelector('form').onsubmit = async (ev) => {
        ev.preventDefault(); const f = ev.target, btn = f.querySelector('button'), res = f.querySelector('[data-res]'), p = f.para ? f.para.value.trim() : '';
        btn.disabled = true; res.innerHTML = '<div class="small text-body-secondary">Probando…</div>';
        try {
          const r = await api(`${B}/bandejas/${b.id}/probar`, { method: 'POST', body: (correo ? p.includes('@') : p.replace(/\D/g, '').length > 3) ? { para: p } : {} });
          res.innerHTML = `<div class="alert ${r.ok ? 'alert-success' : 'alert-danger'} small mb-2">${r.ok ? 'Todo bien: la bandeja está conectada.' : 'Hay algo por corregir.'}</div>`
            + r.pasos.map((x) => `<div class="small d-flex gap-2 mb-1"><i class="bi ${x.ok ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-danger'}"></i><div><b>${esc(x.nombre)}</b><div class="text-body-secondary">${esc(x.detalle)}</div></div></div>`).join('')
            + '<div class="small text-body-secondary mt-2">El webhook se verifica desde Meta («Verificar y guardar»); los mensajes que lleguen aparecerán en Chats.</div>';
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
        else if (e.target.closest('[data-probar]')) probar(b);
        else if (e.target.closest('[data-act]')) { await api(`${B}/bandejas/${id}`, { method: 'PATCH', body: { activo: !b.activo } }); toast(b.activo ? 'Bandeja en pausa' : 'Bandeja activada'); render(); }
        else if (e.target.closest('[data-tok]')) { if (!(await confirm({ title: '¿Generar otro token?', text: 'Tendrás que ponerlo también en Meta o la verificación del webhook fallará.', ok: 'Generar' }))) return; await api(`${B}/bandejas/${id}/token`, { method: 'POST' }); toast('Token nuevo'); render(); }
        else if (e.target.closest('[data-del]')) { if (!(await confirm({ title: `¿Borrar «${b.nombre}»?`, text: 'Se borran también sus agentes y chats. No se puede deshacer.', ok: 'Borrar' }))) return; await api(`${B}/bandejas/${id}`, { method: 'DELETE' }); toast('Bandeja borrada'); render(); }
      } catch (x) { toast(x.message, false); }
    };
  }

  /* ---------- agentes ---------- */
  // Datos que el agente puede pedir a quien quiere comprar (además del nombre); se guardan como contacto en Marketing
  const DATOS = { correo: 'Correo', telefono: 'Teléfono (en WhatsApp ya se conoce)', empresa: 'Nombre del negocio', tipo: 'Persona o negocio', ciudad: 'Ciudad', interes: 'Qué necesita', es_cliente: 'Si ya es cliente o es la primera vez' };
  const BASE = { campos: ['correo', 'interes'], extras: [] };
  const camposDe = (a) => { try { const x = JSON.parse(a.campos || 'null'); if (x && Array.isArray(x.campos)) return { campos: x.campos, extras: x.extras || [] }; } catch (_) {} return BASE; };
  async function agentesView(el) {
    let rows, bands; try { [rows, bands] = await Promise.all([api(`${B}/agentes`).then((r) => r.rows), api(`${B}/bandejas`).then((r) => r.rows)]); } catch (x) { el.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    // Dónde sirve cada agente: las bandejas que se eligieron (varias) o todas
    const dondeSirve = (a) => ((a.bandejas || []).length ? a.bandejas.map((id) => bands.find((b) => b.id === id)).filter(Boolean).map((b) => `<span class="badge text-bg-light border">${ico(b.canal)} ${esc(b.nombre)}</span>`).join(' ') : '<span class="badge text-bg-light border"><i class="bi bi-collection"></i> Todas las bandejas</span>');
    el.innerHTML = `<div class="alert alert-light border small mb-3"><i class="bi bi-robot me-1"></i>Un agente de IA contesta con las instrucciones que le des y, si lo configuras, <b>pide los datos de contacto</b> a quien quiere comprar y los guarda en <b>Marketing</b>. El agente de cada chat se elige en la pestaña <b>Chats</b> (botón con su nombre); los chats nuevos empiezan con el primer agente de su bandeja.</div>
      ${CAN && bands.length ? '<div class="mb-3"><button class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1"></i>Nuevo agente</button></div>' : ''}
      <div class="row g-3">${rows.length ? rows.map((a) => { const cd = camposDe(a); return `<div class="col-lg-6"><div class="dw-card h-100" data-id="${a.id}">
        <div class="d-flex align-items-start gap-2"><div class="flex-grow-1" style="min-width:0"><h2 class="h6 mb-0 text-truncate">${esc(a.nombre)}</h2><span class="small d-flex flex-wrap gap-1 mt-1">${dondeSirve(a)}</span></div></div>
        <p class="small text-body-secondary mt-2 mb-2" style="white-space:pre-wrap">${esc((a.instrucciones || 'Sin instrucciones: responde con el tono de la marca.').slice(0, 220))}</p>
        ${a.bienvenida ? `<div class="small mb-1"><span class="text-body-secondary">Bienvenida:</span> <i>${esc(a.bienvenida.slice(0, 90))}${a.bienvenida.length > 90 ? '…' : ''}</i></div>` : ''}<div class="small"><span class="text-body-secondary">Datos que pide:</span> ${cd.campos.length || cd.extras.length ? [...cd.campos.map((k) => DATOS[k]?.split(' (')[0] || k), ...cd.extras].map((t) => `<span class="badge text-bg-light border">${esc(t)}</span>`).join(' ') : '<span class="text-body-secondary">ninguno</span>'}</div>
        ${CAN ? '<div class="d-flex gap-1 mt-3"><button class="btn btn-sm btn-primary" data-edit><i class="bi bi-pencil me-1"></i>Editar</button><button class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash"></i></button></div>' : ''}</div></div>`; }).join('')
        : `<div class="col-12">${empty('bi-robot', bands.length ? 'Aún no tienes agentes de IA.' : 'Crea primero una bandeja para poder ponerle un agente.')}</div>`}</div>`;
    const form = (a) => {
      const cd = a ? camposDe(a) : BASE;
      const { el: mo, m: mm } = modal(`${cab(a ? 'Editar agente' : 'Nuevo agente')}<form class="modal-body d-grid gap-3" style="max-height:calc(100dvh - 130px);overflow-y:auto;align-content:start;overscroll-behavior:contain">
        ${campo('nombre', 'Nombre del agente', a?.nombre, 'required maxlength="80" placeholder="Asesor de ventas"')}
        <fieldset class="border rounded-3 p-3"><legend class="small fw-semibold float-none w-auto px-2 mb-0">¿En qué bandejas puede servir?</legend>
          <div class="small text-body-secondary mb-2">Marca una o varias (WhatsApp, Instagram, Messenger, web…). Si no marcas ninguna, sirve en todas.</div>
          <div class="d-grid gap-1" data-bandejas>${bands.length ? bands.map((b) => `<div class="form-check"><input class="form-check-input" type="checkbox" name="b_${b.id}" id="wab-${b.id}" ${(a?.bandejas || []).includes(b.id) ? 'checked' : ''}><label class="form-check-label small" for="wab-${b.id}">${ico(b.canal)} ${esc(b.nombre)} <span class="text-body-secondary">· ${esc(CAN_[b.canal]?.n || b.canal)}</span></label></div>`).join('') : '<div class="small text-body-secondary">Aún no tienes bandejas.</div>'}</div></fieldset>
        <label class="small text-body-secondary d-grid gap-1">Instrucciones (qué sabe y cómo responde)<textarea class="form-control" name="instrucciones" rows="6" maxlength="4000" placeholder="Atiendes consultas sobre cursos. Horario: lunes a viernes 8-5. Si piden precio, ofrece que un asesor los contacte.">${esc(a?.instrucciones || '')}</textarea></label>
        <label class="small text-body-secondary d-grid gap-1">Mensaje de bienvenida (opcional)<textarea class="form-control" name="bienvenida" rows="4" maxlength="1500" placeholder="¡Hola{nombre}! Soy el asistente de mi negocio. ¿En qué te ayudo?&#10;1️⃣ Información&#10;2️⃣ Cotizar&#10;3️⃣ Hablar con un asesor">${esc(a?.bienvenida || '')}</textarea><span class="text-body-tertiary">Se envía cuando alguien inicia el chat. {nombre} se cambia por su nombre. Si ya preguntó algo, la bienvenida va seguida de la respuesta.</span></label>
        <fieldset class="border rounded-3 p-3"><legend class="small fw-semibold float-none w-auto px-2 mb-0">Si la persona ya está en Marketing</legend>
          <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" name="usar_conocido" id="wauc" ${!a || a.usar_conocido ? 'checked' : ''}><label class="form-check-label small" for="wauc">Saludarla distinto: «vimos la solicitud que presentaste…»</label></div>
          <label class="small text-body-secondary d-grid gap-1">Mensaje para quien ya presentó una solicitud (opcional)<textarea class="form-control" name="bienvenida_conocido" rows="3" maxlength="1500" placeholder="¡Hola{nombre}! 👋 Vimos la solicitud que presentaste{solicitud}. Gracias por escribirnos. ¿Quieres que sigamos con eso o tienes otra consulta?">${esc(a?.bienvenida_conocido || '')}</textarea><span class="text-body-tertiary">Si el teléfono del chat ya está en Marketing, este saludo reemplaza a la bienvenida. {nombre} = su nombre, {solicitud} = lo que pidió (de sus notas), {empresa}. Vacío = el mensaje de arriba. A quien ya es cliente le dice que da gusto saludarlo de nuevo.</span></label></fieldset>
        <fieldset class="border rounded-3 p-3"><legend class="small fw-semibold float-none w-auto px-2 mb-0">Datos de contacto que pide</legend>
          <div class="small text-body-secondary mb-2">Cuando alguien quiere comprar o que lo contacten, el agente le pide el nombre y estos datos, y los guarda como contacto en Marketing (sin duplicar). Si no marcas ninguno, no pide datos.</div>
          <div class="d-grid gap-1">${Object.entries(DATOS).map(([k, l]) => `<div class="form-check"><input class="form-check-input" type="checkbox" name="c_${k}" id="wc-${k}" ${cd.campos.includes(k) ? 'checked' : ''}><label class="form-check-label small" for="wc-${k}">${esc(l)}</label></div>`).join('')}</div>
          <label class="small text-body-secondary d-grid gap-1 mt-2">Preguntas propias (una por línea, máximo 5)<textarea class="form-control" name="extras" rows="2" placeholder="Cargo&#10;Cuántas personas tiene su equipo">${esc(cd.extras.join('\n'))}</textarea></label></fieldset>
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="usar_marca" id="wam" ${!a || a.usar_marca ? 'checked' : ''}><label class="form-check-label small" for="wam">Usar el tono de la marca</label></div>
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="insistir" id="wains" ${!a || a.insistir ? 'checked' : ''}><label class="form-check-label small" for="wains">Insistir con amabilidad hasta tener el nombre y el contacto (hasta 2 veces)</label></div>
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="alerta_asesor" id="waas" ${!a || a.alerta_asesor ? 'checked' : ''}><label class="form-check-label small" for="waas">Avisar en <b class="text-danger">rojo</b> cuando no sepa responder o pidan un asesor</label></div>
        <button class="btn btn-primary">${a ? 'Guardar' : 'Crear agente'}</button></form>`);
      mo.querySelector('form').onsubmit = async (e) => {
        e.preventDefault(); const f = e.target, btn = f.querySelector('button.btn-primary'); btn.disabled = true;
        const campos = JSON.stringify({ campos: Object.keys(DATOS).filter((k) => f[`c_${k}`].checked), extras: f.extras.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 5) });
        const body = { nombre: f.nombre.value.trim(), bandejas: JSON.stringify(bands.filter((b) => f[`b_${b.id}`]?.checked).map((b) => b.id)), instrucciones: f.instrucciones.value, usar_marca: f.usar_marca.checked, alerta_asesor: f.alerta_asesor.checked, insistir: f.insistir.checked, bienvenida: f.bienvenida.value.trim(), usar_conocido: f.usar_conocido.checked, bienvenida_conocido: f.bienvenida_conocido.value.trim(), campos };
        try { if (a) await api(`${B}/agentes/${a.id}`, { method: 'PATCH', body }); else await api(`${B}/agentes`, { method: 'POST', body }); mm.hide(); toast('Agente guardado'); render(); }
        catch (x) { toast(x.message, false); btn.disabled = false; }
      };
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return form(null);
      const card = e.target.closest('[data-id]'); if (!card) return;
      const a = rows.find((x) => x.id === +card.dataset.id);
      try {
        if (e.target.closest('[data-edit]')) form(a);
        else if (e.target.closest('[data-del]')) { if (!(await confirm({ title: `¿Borrar «${a.nombre}»?`, text: 'Los chats que lo usaban quedan sin agente hasta que les asignes otro. No se puede deshacer.', ok: 'Borrar' }))) return; await api(`${B}/agentes/${a.id}`, { method: 'DELETE' }); toast('Agente borrado'); render(); }
      } catch (x) { toast(x.message, false); }
    };
  }

  nav(); render();
});

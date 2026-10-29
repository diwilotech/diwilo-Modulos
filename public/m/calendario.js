// Calendario de la semana para todas las apps Diwilo (el mismo de Cursos en Academia): lunes a domingo por momentos del día
// (Mañana, Tarde y Noche, más «Todo el día» para lo que no tiene hora), con Anterior / Hoy / Siguiente. Se carga con <script src="/m/calendario.js"></script>.
//   DwCalendario.semana(host, { hoy, cargar(desde, hasta) → Promise<[evento]>, abrir?(ruta), vacio? })
//   evento = { fecha: 'AAAA-MM-DD', ini?: 'HH:MM', fin?: 'HH:MM', titulo, detalle?, color?, icono?, ruta?, destacado? }
// Trae sus propios estilos (los mismos de diwilo.css), así que sirve en cualquier app o panel.
(function () {
  if (window.DwCalendario) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = document.createElement('style');
  st.textContent = `.dw-semana{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;background:var(--dw-tarjeta,var(--bs-body-bg));border:1px solid var(--dw-borde,var(--bs-border-color));border-radius:14px;overflow:hidden}
.dw-semana th,.dw-semana td{border-bottom:1px solid var(--dw-borde,var(--bs-border-color));border-right:1px solid var(--dw-borde,var(--bs-border-color));padding:6px;vertical-align:top}
.dw-semana thead th{text-align:center;font-weight:600;font-size:.85rem}
.dw-semana th.hoy{background:rgba(var(--dw-p-rgb,109,40,217),.14);color:var(--dw-p,#6d28d9)}.dw-semana td.hoy{background:rgba(var(--dw-p-rgb,109,40,217),.04)}
.dw-semana .mom{width:92px;font-size:.8rem;color:var(--bs-secondary-color);white-space:nowrap;text-align:left}
.dw-semana tr>:last-child{border-right:0}.dw-semana tbody tr:last-child>*{border-bottom:0}
.dw-ev{display:block;border-left:3px solid var(--ev,var(--dw-p,#6d28d9));background:rgba(var(--dw-p-rgb,109,40,217),.07);border-radius:6px;padding:4px 6px;margin-bottom:4px;font-size:.76rem;line-height:1.3;color:inherit;text-decoration:none;overflow:hidden;width:100%;text-align:left;border-top:0;border-right:0;border-bottom:0}
.dw-ev:hover{background:rgba(var(--dw-p-rgb,109,40,217),.14);color:inherit}.dw-ev--hoy{box-shadow:0 0 0 2px rgba(var(--dw-p-rgb,109,40,217),.35)}
@media (max-width:767.98px){.dw-semana,.dw-semana tbody,.dw-semana tr,.dw-semana td,.dw-semana th{display:block;width:auto}.dw-semana thead{display:none}.dw-semana td:empty{display:none}.dw-semana td{border-right:0}
.dw-semana td::before{content:attr(data-dia);display:block;font-weight:600;font-size:.78rem;margin-bottom:4px}.dw-semana .mom{background:rgba(var(--dw-p-rgb,109,40,217),.08);font-weight:700}}`;
  document.head.appendChild(st);

  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const lunesDe = (iso) => mas(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
  const corto = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const h12 = (h) => { if (!h) return ''; const [a, b] = h.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a < 12 ? 'a. m.' : 'p. m.'}`; };
  const MOM = [['Todo el día', 'bi-calendar-event', (h) => !h], ['Mañana', 'bi-sunrise', (h) => h && h < '12:00'], ['Tarde', 'bi-sun', (h) => h >= '12:00' && h < '18:00'], ['Noche', 'bi-moon-stars', (h) => h >= '18:00']];

  function semana(host, { hoy, cargar, abrir, vacio = 'No hay nada programado esta semana.' }) {
    let desde = lunesDe(hoy);
    host.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button type="button" class="btn btn-light" data-cprev aria-label="Semana anterior"><i class="bi bi-chevron-left"></i></button>
      <b class="flex-grow-1 text-center" data-crango></b><button type="button" class="btn btn-light" data-choy>Hoy</button><button type="button" class="btn btn-light" data-cnext aria-label="Semana siguiente"><i class="bi bi-chevron-right"></i></button></div><div data-ctabla></div>`;
    const $ = (s) => host.querySelector(s);
    const ev = (e) => {
      const tag = e.ruta ? 'button' : 'div';
      return `<${tag} ${e.ruta ? `type="button" data-cruta="${esc(e.ruta)}"` : ''} class="dw-ev${e.destacado ? ' dw-ev--hoy' : ''}" ${e.color && /^#[0-9a-f]{3,8}$/i.test(e.color) ? `style="--ev:${esc(e.color)};background:color-mix(in srgb,${esc(e.color)} 12%,transparent)"` : ''} title="${esc(e.titulo)}">
        ${e.ini ? `<b>${esc(h12(e.ini))}${e.fin ? ` – ${esc(h12(e.fin))}` : ''}</b>` : ''}<span class="d-block text-truncate">${e.icono ? `<i class="bi ${esc(e.icono)} me-1"></i>` : ''}${esc(e.titulo)}</span>${e.detalle ? `<span class="text-body-secondary">${esc(e.detalle)}</span>` : ''}</${tag}>`;
    };
    const load = async () => {
      const hasta = mas(desde, 6);
      $('[data-crango]').textContent = `${corto(desde)} – ${corto(hasta)}`;
      let lista = [];
      try { lista = (await cargar(desde, hasta)) || []; } catch (x) { $('[data-ctabla]').innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
      const dias = Array.from({ length: 7 }, (_, i) => mas(desde, i));
      const en = (f, m) => lista.filter((e) => e.fecha === f && m[2](e.ini || '')).sort((p, q) => (p.ini || '').localeCompare(q.ini || '')).map(ev).join('');
      const momentos = MOM.filter((m, i) => i > 0 || lista.some((e) => !e.ini));   // «Todo el día» solo si hay algo sin hora
      $('[data-ctabla]').innerHTML = `<table class="dw-semana"><thead><tr><th class="mom"></th>${dias.map((f) => `<th class="${f === hoy ? 'hoy' : ''}">${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${f.slice(8)}</th>`).join('')}</tr></thead>
        <tbody>${momentos.map((m) => `<tr><th class="mom"><i class="bi ${m[1]} me-1"></i>${m[0]}</th>${dias.map((f) => `<td class="${f === hoy ? 'hoy' : ''}" data-dia="${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${f.slice(8)} · ${m[0]}">${en(f, m)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        ${lista.length ? '' : `<div class="small text-body-secondary mt-2">${esc(vacio)}</div>`}`;
    };
    host.addEventListener('click', (e) => {
      const r = e.target.closest('[data-cruta]'); if (r && abrir) return abrir(r.dataset.cruta);
      if (e.target.closest('[data-cprev]')) { desde = mas(desde, -7); load(); } else if (e.target.closest('[data-cnext]')) { desde = mas(desde, 7); load(); } else if (e.target.closest('[data-choy]')) { desde = lunesDe(hoy); load(); }
    });
    return load();
  }
  window.DwCalendario = { semana };
})();

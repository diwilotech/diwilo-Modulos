// Tablas con orden, búsqueda y paginación (como DataTables, sin librerías) para todas las apps Diwilo. Se carga con <script src="/m/datatable.js"></script>.
//   - Orden: clic en el encabezado (asc → desc → original). Números, dinero, fechas y texto se ordenan bien; una celda puede traer data-order.
//   - Búsqueda y paginación aparecen cuando hay más de 10 filas (la búsqueda no se repite si la pantalla ya tiene su propio buscador).
//   - Se aplica solo a las `table.dw-table` y se redibuja cuando la pantalla las vuelve a pintar. Excepción: `data-dt="off"` en la tabla o `data-no-dt` en un contenedor.
//   - Trae sus propios estilos (los mismos de diwilo.css), así que sirve en cualquier app o panel. window.App.dataTable(tabla) la aplica a mano.
(function () {
  if (window.__dwDataTable) return;
  window.__dwDataTable = true;
  const st = document.createElement('style');
  st.textContent = `.dw-dt-hide{display:none!important}.dw-dt-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:8px 4px 10px}
.dw-dt-len{display:inline-flex;align-items:center;gap:6px;font-size:.85rem;color:var(--bs-secondary-color)}.dw-dt-len select{width:auto}.dw-dt-q{max-width:240px}
.dw-dt-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:10px 4px 4px}.dw-dt-pager{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.dw-table th.dw-dt-sort{cursor:pointer;user-select:none;white-space:nowrap}.dw-table th.dw-dt-sort::after{content:"\\2195";margin-left:6px;font-size:.75em;opacity:.3}
.dw-table th.dw-dt-sort[aria-sort="ascending"]::after{content:"\\2191";opacity:1;color:var(--dw-p,#6d28d9)}.dw-table th.dw-dt-sort[aria-sort="descending"]::after{content:"\\2193";opacity:1;color:var(--dw-p,#6d28d9)}
.dw-table th.dw-dt-sort:focus-visible{outline:2px solid var(--dw-p,#6d28d9);outline-offset:-2px}`;
  document.head.appendChild(st);

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11 };
  const TAMANOS = [10, 25, 50, 100, 0];

  // Valor para ordenar una celda: número (dinero, %, cantidades), fecha o texto.
  function valorDe(td) {
    if (td.dataset.order !== undefined) { const n = Number(td.dataset.order); return Number.isNaN(n) ? plano(td.dataset.order) : n; }
    const t = td.textContent.replace(/\s+/g, ' ').trim();
    const f = t.match(/^(\d{1,2})\s+([a-záéíóú]{3,4})\.?\s+(\d{4})/i);
    if (f && MES[plano(f[2])] !== undefined) return Date.UTC(+f[3], MES[plano(f[2])], +f[1]);
    if (/^[−-]?\$?\s*[\d.,]+\s*%?$/.test(t) && /\d/.test(t)) {
      const neg = /^[−-]/.test(t), n = Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
      if (!Number.isNaN(n)) return neg ? -n : n;
    }
    const m = t.match(/^[−-]?\$\s*([\d.]+)/);   // «$ 150.000 de $ 900.000»: manda la primera cifra
    if (m) return Number(m[1].replace(/\./g, ''));
    return plano(t);
  }
  const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : typeof a === 'number' ? -1 : typeof b === 'number' ? 1 : a.localeCompare(b, 'es', { numeric: true }));

  function mejorar(table) {
    if (table.dataset.dt) return;
    const body = table.tBodies[0]; if (!body) return;
    table.dataset.dt = 'on';
    const filas = [...body.rows], heads = [...table.tHead.rows[0].cells];
    const conBuscador = !!table.closest('[data-view], .modal, main')?.querySelector('input[data-q]');
    const enVentana = !!table.closest('.modal');
    const st = { orden: -1, dir: 1, q: '', pag: 0, tam: 25 };
    const orig = new Map(filas.map((r, i) => [r, i]));
    const contenedor = table.closest('.table-responsive-md') || table.parentElement;
    const grande = filas.length > 10 && !enVentana;
    let barra = null, pie = null;
    if (grande) {
      barra = document.createElement('div'); barra.className = 'dw-dt-bar';
      barra.innerHTML = `<label class="dw-dt-len">Mostrar <select class="form-select form-select-sm" data-len aria-label="Filas por página">${TAMANOS.map((n) => `<option value="${n}" ${n === st.tam ? 'selected' : ''}>${n || 'Todas'}</option>`).join('')}</select></label>
        ${conBuscador ? '' : '<input class="form-control form-control-sm dw-dt-q" type="search" placeholder="Buscar en la tabla…" data-dtq aria-label="Buscar en la tabla">'}`;
      pie = document.createElement('div'); pie.className = 'dw-dt-foot'; pie.innerHTML = '<span class="small text-body-secondary" data-info></span><nav class="dw-dt-pager" data-pager aria-label="Páginas"></nav>';
      contenedor.before(barra); contenedor.after(pie);
    }
    // encabezados ordenables (los de acciones, sin título, no)
    heads.forEach((th, i) => {
      if (!th.textContent.trim() || th.hasAttribute('data-nosort')) return;
      th.classList.add('dw-dt-sort'); th.tabIndex = 0; th.setAttribute('role', 'button'); th.setAttribute('aria-sort', 'none');
      const ordenar = () => { if (st.orden === i) { if (st.dir === 1) st.dir = -1; else { st.orden = -1; st.dir = 1; } } else { st.orden = i; st.dir = 1; } st.pag = 0; pintar(); };
      th.addEventListener('click', ordenar);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(); } });
    });
    const claves = new Map();   // valor de orden de cada celda (se calcula una vez)
    const clave = (tr, i) => { let k = claves.get(tr); if (!k) claves.set(tr, (k = [])); return k[i] ?? (k[i] = valorDe(tr.cells[i] || { textContent: '', dataset: {} })); };
    const texto = new Map(filas.map((r) => [r, plano(r.textContent)]));

    function pintar() {
      let lista = filas.filter((r) => !st.q || texto.get(r).includes(st.q));
      if (st.orden >= 0) lista = [...lista].sort((a, b) => st.dir * cmp(clave(a, st.orden), clave(b, st.orden)) || orig.get(a) - orig.get(b));
      else lista = [...lista].sort((a, b) => orig.get(a) - orig.get(b));
      const total = lista.length, tam = st.tam || total || 1, paginas = Math.max(1, Math.ceil(total / tam));
      st.pag = Math.min(st.pag, paginas - 1);
      const ini = st.pag * tam, visibles = new Set(lista.slice(ini, ini + tam));
      lista.forEach((r) => body.append(r));                       // el orden en pantalla
      filas.forEach((r) => r.classList.toggle('dw-dt-hide', !visibles.has(r)));
      heads.forEach((th, i) => th.setAttribute('aria-sort', th.classList.contains('dw-dt-sort') ? (st.orden === i ? (st.dir === 1 ? 'ascending' : 'descending') : 'none') : 'none'));
      if (!pie) return;
      pie.querySelector('[data-info]').textContent = total ? `Mostrando ${ini + 1}–${Math.min(ini + tam, total)} de ${total}${st.q ? ` (filtrado de ${filas.length})` : ''}` : 'Sin resultados';
      const pg = pie.querySelector('[data-pager]');
      if (paginas <= 1) { pg.innerHTML = ''; return; }
      const nums = [...new Set([0, st.pag - 1, st.pag, st.pag + 1, paginas - 1])].filter((n) => n >= 0 && n < paginas).sort((a, b) => a - b);
      pg.innerHTML = `<button type="button" class="btn btn-sm btn-light" data-p="${st.pag - 1}" ${st.pag === 0 ? 'disabled' : ''} aria-label="Anterior"><i class="bi bi-chevron-left"></i></button>${nums.map((n, j) =>
        `${j && n - nums[j - 1] > 1 ? '<span class="px-1">…</span>' : ''}<button type="button" class="btn btn-sm ${n === st.pag ? 'btn-primary' : 'btn-light'}" data-p="${n}" ${n === st.pag ? 'aria-current="page"' : ''}>${n + 1}</button>`).join('')}
        <button type="button" class="btn btn-sm btn-light" data-p="${st.pag + 1}" ${st.pag >= paginas - 1 ? 'disabled' : ''} aria-label="Siguiente"><i class="bi bi-chevron-right"></i></button>`;
    }
    pie?.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && !b.disabled) { st.pag = +b.dataset.p; pintar(); } });
    barra?.querySelector('[data-len]').addEventListener('change', (e) => { st.tam = +e.target.value; st.pag = 0; pintar(); });
    let t; barra?.querySelector('[data-dtq]')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = plano(e.target.value); st.pag = 0; pintar(); }, 150); });
    if (grande) pintar();
  }

  function recorrer(raiz) {
    (raiz.matches?.('table.dw-table') ? [raiz] : [...(raiz.querySelectorAll?.('table.dw-table') || [])]).forEach((t) => {
      if (t.closest('[data-no-dt]') || t.dataset.dt === 'off' || !t.tHead || !t.tBodies[0]) return;
      mejorar(t);
    });
  }
  let programado = false;
  const rascar = () => { if (programado) return; programado = true; requestAnimationFrame(() => { programado = false; recorrer(document); }); };
  new MutationObserver(rascar).observe(document.body, { childList: true, subtree: true });
  rascar();
  window.App = window.App || {};
  window.App.dataTable = mejorar;
})();

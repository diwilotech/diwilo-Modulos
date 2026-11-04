// Página del módulo Proyectos: proyectos/clientes, cotizaciones (PDF con firma, paso a cuenta de cobro) y las cuentas de cobro de cada proyecto.
DW.ready.then((me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud, { money, day, chip } = C;
  const B = '/api/proyectos', F = '/api/finanzas', RO = me.business.readOnly;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sub = (t) => (t ? `<div class="small text-body-secondary fw-normal">${esc(t)}</div>` : '');
  const PROY = { propuesta: ['soon', 'Propuesta'], activo: ['ok', 'Activo'], terminado: ['free', 'Terminado'], cancelado: ['bad', 'Cancelado'] };
  const COT = { borrador: ['free', 'Borrador'], enviada: ['soon', 'Enviada'], aprobada: ['ok', 'Aprobada'], rechazada: ['bad', 'Rechazada'] };
  const COB = { pendiente: ['soon', 'Sin pagar'], vencida: ['bad', 'Vencida'], pagada: ['ok', 'Pagada'], anulada: ['free', 'Anulada'] };
  const VIEWS = [['proyectos', 'Proyectos'], ['cotizaciones', 'Cotizaciones'], ['cobros', 'Cuentas de cobro']];
  let view = (location.hash || '#proyectos').slice(1);
  if (!VIEWS.some(([k]) => k === view)) view = 'proyectos';
  const pdf = (url) => window.open(url, '_blank', 'noopener');
  const root = $('[data-view]');

  // RUT y certificación bancaria: se suben una vez y viajan con el enlace de cada cotización y cuenta de cobro
  async function documentos() {
    const NOM = { rut: 'RUT', banco: 'Certificación bancaria' };
    const { el: d } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">RUT y certificado bancario</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Súbelos una vez (PDF o imagen, máx. 4 MB). Quien reciba una cotización o cuenta de cobro por correo los ve y descarga desde el mismo enlace, y el correo los menciona.</p><div data-lista></div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cerrar</button></div>`, { size: 'modal-lg' });
    const lista = $('[data-lista]', d), err = $('[data-err]', d);
    const pinta = async () => {
      let rows = []; try { rows = (await api(`${B}/documentos`)).rows; } catch (x) { err.textContent = x.message; }
      lista.innerHTML = Object.entries(NOM).map(([k, n]) => { const f = rows.find((r) => r.kind === k); return `<div class="border rounded p-3 mb-2 d-flex flex-wrap align-items-center gap-2" data-k="${k}">
        <div class="flex-grow-1"><b>${n}</b><div class="small text-body-secondary">${f ? `${esc(f.name)} · ${(f.size / 1024).toFixed(0)} KB · subido ${day(new Date(f.updated_at).toISOString().slice(0, 10))}` : 'Aún no lo subes'}</div></div>
        ${f ? '<button class="btn btn-sm btn-outline-primary" data-ver><i class="bi bi-eye me-1"></i>Ver</button>' : ''}
        <label class="btn btn-sm ${f ? 'btn-outline-secondary' : 'btn-primary'} mb-0"><i class="bi bi-upload me-1"></i>${f ? 'Reemplazar' : 'Subir'}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden data-file></label>
        ${f ? '<button class="btn btn-sm btn-outline-danger" data-del aria-label="Quitar"><i class="bi bi-trash"></i></button>' : ''}</div>`; }).join('');
    };
    lista.addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-file]'); if (!inp?.files[0]) return;
      const k = inp.closest('[data-k]').dataset.k, f = inp.files[0]; err.textContent = '';
      if (f.size > 4 * 1024 * 1024) { err.textContent = 'El archivo pesa más de 4 MB'; return; }
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
      try { await api(`${B}/documentos/${k}`, { method: 'POST', body: { nombre: f.name, data } }); toast(`${NOM[k]} guardado`); pinta(); } catch (x) { err.textContent = x.message; }
    });
    lista.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      if (e.target.closest('[data-ver]')) {
        try { const f = await api(`${B}/documentos/${k}`), b = await (await fetch(f.data)).blob(); window.open(URL.createObjectURL(b), '_blank', 'noopener'); } catch (x) { err.textContent = x.message; }
      } else if (e.target.closest('[data-del]')) {
        if (!await confirm(`¿Quitar tu ${NOM[k]}?`)) return;
        try { await api(`${B}/documentos/${k}`, { method: 'DELETE' }); toast('Quitado'); pinta(); } catch (x) { err.textContent = x.message; }
      }
    });
    pinta();
  }

  // Resumen en una línea y botón a los datos y la firma (viven en Finanzas)
  const cabecera = async () => {
    const s = await api(`${B}/summary`).catch(() => null);
    $('[data-acciones]').innerHTML = `${RO ? '' : '<button class="btn btn-outline-primary btn-sm" data-docs><i class="bi bi-paperclip me-1"></i>RUT y certificado bancario</button>'}<a class="btn btn-outline-primary btn-sm" href="${location.pathname.startsWith('/admin/m/') ? '/admin/#finanzas' : '/staff/finanzas.html'}"><i class="bi bi-pen me-1"></i>Mi firma y datos de cobro</a>`;
    $('[data-docs]')?.addEventListener('click', documentos);
    $('[data-seg]').insertAdjacentHTML('beforebegin', s ? `<p class="text-body-secondary small mb-2">${s.proyectos_abiertos} proyectos abiertos · ${s.por_aprobar.cantidad} cotizaciones por aprobar (${money(s.por_aprobar.total)}) · ${s.cuentas_de_cobro_pendientes.cantidad} cuentas de cobro sin pagar (${money(s.cuentas_de_cobro_pendientes.saldo)})</p>` : '');
  };

  const hide = (d) => bootstrap.Modal.getInstance(d)?.hide();
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Empresa: el nombre se autocompleta con los contactos de Marketing; NIT, correo y ciudad viajan a sus cotizaciones y cuentas de cobro
  function empresa(row, changed) {
    const editando = !!(row && row.id), v = { ...(row || {}) };
    const { el: d } = modal(`<form novalidate>
      <div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${editando ? 'Datos de la empresa' : 'Nueva empresa'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12 position-relative"><label class="form-label small mb-1">Empresa</label><input class="form-control" name="name" required autocomplete="off" value="${esc(v.name || '')}" placeholder="Escribe el nombre de la empresa">
          <div class="list-group position-absolute w-100 shadow-sm" style="z-index:5;max-height:200px;overflow:auto" data-sug hidden></div><div class="form-text">Si ya está en tus contactos de Marketing, se cargan sus datos; si no, se crea allí también.</div></div>
        <div class="col-sm-4"><label class="form-label small mb-1">NIT o documento</label><input class="form-control" name="tax_id" value="${esc(v.tax_id || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">Ciudad</label><input class="form-control" name="client_city" value="${esc(v.client_city || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">Correo</label><input class="form-control" name="client_email" type="email" value="${esc(v.client_email || '')}"></div></div>
        ${editando ? '<p class="small text-body-secondary mt-2 mb-0"><i class="bi bi-arrow-repeat me-1"></i>Al guardar, estos datos se actualizan en todas sus cotizaciones y cuentas de cobro.</p>' : ''}
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${editando && me.canManage ? '<button type="button" class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar</button></span></div></form>`);
    const f = $('form', d), sug = $('[data-sug]', d);
    let contacto = v.contact_id || null;
    f.name.addEventListener('input', debounce(async () => {
      contacto = editando ? contacto : null;
      const t = f.name.value.trim();
      if (t.length < 2) { sug.hidden = true; return; }
      try {
        const r = (await api(`${B}/contactos?q=${encodeURIComponent(t)}`)).rows;
        sug.innerHTML = r.map((x) => `<button type="button" class="list-group-item list-group-item-action py-1" data-k="${x.id}"><b>${esc(x.company || x.name)}</b>${x.email ? `<span class="small text-body-secondary ms-2">${esc(x.email)}</span>` : ''}</button>`).join('');
        sug.hidden = !r.length; sug._rows = r;
      } catch { sug.hidden = true; }
    }));
    sug.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const x = sug._rows.find((r) => String(r.id) === b.dataset.k); contacto = x.id;
      f.name.value = x.company || x.name; if (x.email && !f.client_email.value) f.client_email.value = x.email; sug.hidden = true;
    });
    $('[data-del]', d)?.addEventListener('click', async () => { if (!await confirm('¿Borrar esta empresa? Sus cotizaciones y cuentas de cobro no se borran.')) return; try { await api(`${B}/projects/${row.id}`, { method: 'DELETE' }); hide(d); toast('Borrada'); changed(null); } catch (x) { toast(x.message, false); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { name: f.name.value.trim(), tax_id: f.tax_id.value.trim(), client_city: f.client_city.value.trim(), client_email: f.client_email.value.trim() };
      if (contacto) body.contact_id = contacto;
      if (!body.name) { $('[data-err]', d).textContent = 'Escribe el nombre de la empresa'; return; }
      try { const out = await api(editando ? `${B}/projects/${row.id}` : `${B}/projects`, { method: editando ? 'PATCH' : 'POST', body }); hide(d); toast(editando ? 'Guardado: se actualizaron sus cotizaciones y cuentas de cobro' : 'Empresa creada'); changed(editando ? row.id : out.id); }
      catch (x) { $('[data-err]', d).textContent = x.message; }
    });
  }

  // PDF del documento para adjuntarlo al correo: se dibuja la misma página que ves en «Ver» y se corta en hojas A4 entre bloques
  const cargaLib = (src) => new Promise((ok, no) => { if ([...document.scripts].some((x) => x.src === src)) return ok(); const t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = () => no(new Error('No se pudo cargar el generador de PDF')); document.head.appendChild(t); });
  async function pdfDe(url) {
    await Promise.all([cargaLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'), cargaLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')]);
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;visibility:hidden';
    document.body.appendChild(fr);
    try {
      await new Promise((ok, no) => { fr.onload = ok; fr.onerror = no; fr.src = url; });
      const dc = fr.contentDocument; await dc.fonts?.ready; await new Promise((r) => setTimeout(r, 1200));   // fuentes y códigos QR
      const doc = dc.querySelector('.doc'); if (!doc) throw new Error('No se pudo armar el PDF');
      const base = doc.getBoundingClientRect(), W = doc.offsetWidth, pageH = Math.floor(W * 297 / 210 - 40);
      const cortes = [...doc.querySelectorAll(':scope > *, tr, li, p, .card')].map((e) => Math.round(e.getBoundingClientRect().top - base.top)).filter((y) => y > 0).sort((a, b) => a - b);
      const canvas = await window.html2canvas(doc, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const k = canvas.width / W, total = Math.round(canvas.height / k);
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), mw = 210 - 16, hmm = 297 - 16;
      if (total <= pageH * 1.3) {   // cabe en una hoja con un ajuste pequeño: todo en una sola página
        const ancho = Math.min(mw, hmm * canvas.width / canvas.height);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', (210 - ancho) / 2, 8, ancho, ancho * canvas.height / canvas.width);
        return pdf.output('datauristring').replace(/^data:application\/pdf;filename=[^;]*;base64,/, 'data:application/pdf;base64,');
      }
      for (let y = 0, n = 0; y < total; n++) {
        let fin = Math.min(total, y + pageH);
        if (fin < total) { const c = cortes.filter((v) => v > y + 120 && v <= fin).pop(); if (c) fin = c; }
        const t = document.createElement('canvas'); t.width = canvas.width; t.height = Math.max(1, Math.round((fin - y) * k));
        t.getContext('2d').drawImage(canvas, 0, Math.round(y * k), canvas.width, t.height, 0, 0, canvas.width, t.height);
        if (n) pdf.addPage();
        pdf.addImage(t.toDataURL('image/jpeg', 0.92), 'JPEG', 8, 8, mw, mw * t.height / canvas.width);
        y = fin;
      }
      return pdf.output('datauristring').replace(/^data:application\/pdf;filename=[^;]*;base64,/, 'data:application/pdf;base64,');
    } finally { fr.remove(); }
  }

  // Enviar por correo (Mensajes): redacción lista, editable, con el enlace público al PDF
  async function enviar(tipo, id, despues) {
    let b;
    try { b = await api(`${B}/correo/borrador?tipo=${tipo}&id=${id}`); } catch (x) { toast(x.message, false); return; }
    const { el: d } = modal(`<form novalidate>
      <div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Enviar ${tipo === 'cuenta' ? 'la cuenta de cobro' : 'la cotización'} ${esc(b.numero || '')}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">
        ${b.bandejas.length ? '' : '<div class="alert alert-warning small">Necesitas una bandeja de correo activa en <b>Mensajes → Bandejas</b> para enviar desde aquí.</div>'}
        <div class="row g-2"><div class="col-sm-7"><label class="form-label small mb-1">Para</label><input class="form-control" name="para" type="email" value="${esc(b.para)}" placeholder="correo@empresa.com"></div>
          <div class="col-sm-5"><label class="form-label small mb-1">Enviar desde</label><select class="form-select" name="bandeja">${b.bandejas.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}</select></div>
          <div class="col-12"><label class="form-label small mb-1">Asunto</label><input class="form-control" name="asunto" value="${esc(b.asunto)}"></div>
          <div class="col-12"><label class="form-label small mb-1">Mensaje <span class="text-body-secondary">· lleva el enlace para ver y descargar el PDF</span></label><textarea class="form-control" name="mensaje" rows="11">${esc(b.mensaje)}</textarea></div>
          <div class="col-12"><label class="form-label small mb-1">Adjuntos</label>
            <div class="form-check"><input class="form-check-input" type="checkbox" id="adjpdf" name="adjpdf" checked><label class="form-check-label" for="adjpdf">PDF ${tipo === 'cuenta' ? 'de la cuenta de cobro' : 'de la cotización'} ${esc(b.numero || '')}</label></div>
            ${(b.docs || []).map((x) => `<div class="form-check"><input class="form-check-input" type="checkbox" id="adj_${x.kind}" data-doc="${x.kind}" checked><label class="form-check-label" for="adj_${x.kind}">${esc(x.nombre)}</label></div>`).join('')}
            ${(b.docs || []).length < 2 ? '<div class="small text-body-secondary mt-1">Sube tu RUT y tu certificado bancario en «RUT y certificado bancario» para adjuntarlos también.</div>' : ''}</div></div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><a class="btn btn-outline-secondary" href="${esc(b.enlace)}" target="_blank" rel="noopener"><i class="bi bi-filetype-pdf me-1"></i>Ver PDF</a>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Ahora no</button> <button class="btn btn-primary" ${b.bandejas.length ? '' : 'disabled'}><i class="bi bi-send me-1"></i>Enviar</button></span></div></form>`, { size: 'modal-lg' });
    const f = $('form', d);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button:not([type=button])', f), txt = btn.innerHTML; btn.disabled = true; $('[data-err]', d).textContent = '';
      try {
        let pdfAdj; if (f.adjpdf.checked) { btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Armando el PDF…'; pdfAdj = { nombre: `${tipo === 'cuenta' ? 'Cuenta de cobro' : 'Cotización'} ${b.numero || ''}`.trim(), data: await pdfDe(tipo === 'cuenta' ? `${F}/invoices/${id}/pdf` : `${B}/quotes/${id}/pdf`) }; }
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Enviando…';
        await api(`${B}/correo/enviar`, { method: 'POST', body: { tipo, id, para: f.para.value.trim(), asunto: f.asunto.value.trim(), mensaje: f.mensaje.value.trim(), bandeja_id: +f.bandeja.value, pdf: pdfAdj, incluir: $$('[data-doc]', d).filter((x) => x.checked).map((x) => x.dataset.doc) } });
        hide(d); toast('Enviado con sus adjuntos: queda en tus chats de Mensajes'); despues?.();
      } catch (x) { $('[data-err]', d).textContent = x.message; btn.disabled = false; btn.innerHTML = txt; }
    });
  }

  // Cuenta de cobro: se eligen las líneas (todas, o p. ej. un anticipo), se crea sin pagar y se ofrece enviarla
  async function cobrar(qid, despues) {
    let q; try { q = await api(`${B}/quotes/${qid}`); } catch (x) { toast(x.message, false); return; }
    let lines = []; try { lines = JSON.parse(q.items || '[]'); } catch { /* vacío */ }
    const { el: d } = modal(`<form novalidate>
      <div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Cuenta de cobro · ${esc(q.number)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">${esc(q.counterparty)} · ${esc(q.title || '')}. Elige qué líneas cobrar; la cuenta queda sin pagar en Finanzas.</p>
        <div class="list-group mb-3">${lines.map((l, i) => `<label class="list-group-item d-flex gap-2 align-items-start"><input class="form-check-input mt-1" type="checkbox" data-i="${i}" checked><span class="flex-grow-1">${esc(l.concepto)}${l.detalle ? sub(l.detalle) : ''}</span><b class="text-nowrap">${l.moneda === 'USD' ? `USD ${l.valor}` : money(l.total)}</b></label>`).join('')}</div>
        <div class="row g-2"><div class="col-sm-6"><label class="form-label small mb-1">Fecha de la cuenta</label><input class="form-control" name="fecha" type="date" value="${C.todayCo()}"></div>
          <div class="col-sm-6"><label class="form-label small mb-1">Pagar antes del</label><input class="form-control" name="vence" type="date"></div></div>
        <div class="text-end mt-3">Total de la cotización <b>${money(q.total)}</b></div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary"><i class="bi bi-receipt me-1"></i>Cobrar</button></div></form>`, { size: 'modal-lg' });
    const f = $('form', d);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idx = $$('[data-i]', d).filter((x) => x.checked).map((x) => +x.dataset.i);
      if (!idx.length) { $('[data-err]', d).textContent = 'Elige al menos una línea'; return; }
      const body = { lineas: idx.length === lines.length ? undefined : idx, fecha: f.fecha.value || undefined, vence: f.vence.value || undefined };
      try {
        const x = await api(`${B}/quotes/${qid}/cobrar`, { method: 'POST', body }); hide(d); toast(`Cuenta de cobro ${x.numero} creada`); despues?.();
        enviar('cuenta', x.id, despues);
      } catch (x) { $('[data-err]', d).textContent = x.message; }
    });
  }

  // Mismo diseño de Mensajes: lista de empresas a la izquierda y, a la derecha, el detalle con sus cotizaciones como tarjetas
  if (!document.getElementById('pj-css')) document.head.insertAdjacentHTML('beforeend', `<style id="pj-css">
.pj-box{display:grid;grid-template-columns:340px 1fr;height:calc(100dvh - 230px);min-height:480px;border:1px solid var(--bs-border-color);border-radius:14px;overflow:hidden;background:var(--bs-body-bg)}
.pj-list{display:flex;flex-direction:column;border-right:1px solid var(--bs-border-color);min-height:0}.pj-search{padding:10px}
.pj-items{overflow-y:auto;flex:1}.pj-it{display:flex;gap:10px;padding:11px 12px;border:0;border-bottom:1px solid var(--bs-border-color-translucent);background:none;width:100%;text-align:left;color:inherit;align-items:center}
.pj-it:hover{background:rgba(var(--bs-emphasis-color-rgb),.04)}.pj-it.on{background:rgba(var(--bs-primary-rgb),.12)}
.pj-av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:600;background:rgba(var(--bs-emphasis-color-rgb),.1)}
.pj-it .t{min-width:0;flex:1}.pj-it .t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.pj-sub{display:block;font-size:.78rem;color:var(--bs-secondary-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pj-n{background:var(--bs-primary);color:#fff;border-radius:999px;font-size:.7rem;padding:1px 7px}
.pj-det{display:flex;flex-direction:column;min-width:0;min-height:0}.pj-cab{display:flex;flex-direction:column;gap:8px;padding:10px 14px;border-bottom:1px solid var(--bs-border-color);background:var(--bs-body-bg)}
.pj-cab1{display:flex;gap:10px;align-items:center;min-width:0}.pj-cab1 .t{flex:1;min-width:0}.pj-cab1 .t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1.02rem;line-height:1.2}
.pj-tb{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.pj-tb .btn{--bs-btn-padding-y:.22rem;--bs-btn-padding-x:.55rem;--bs-btn-font-size:.8rem;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.pj-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:rgba(var(--bs-emphasis-color-rgb),.03)}
.pj-q{background:var(--bs-body-bg);border:1px solid var(--bs-border-color-translucent);border-radius:14px;padding:10px 14px}.pj-q1{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pj-q1 .tot{margin-left:auto;font-weight:600;font-size:1.05rem}
.pj-qa{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.pj-qa .btn{--bs-btn-padding-y:.2rem;--bs-btn-padding-x:.55rem;--bs-btn-font-size:.8rem;display:inline-flex;align-items:center;gap:5px}
.pj-vacio{margin:auto;text-align:center;color:var(--bs-secondary-color);padding:24px}.pj-back{display:none}
@media (max-width:767px){.pj-box{grid-template-columns:1fr;height:calc(100dvh - 190px)}.pj-box .pj-det{display:none}.pj-box.abierto{height:calc(100dvh - 90px)}.pj-box.abierto .pj-list{display:none}.pj-box.abierto .pj-det{display:flex}.pj-back{display:inline-block}}
</style>`);
  function proyectos(el) {
    let lista = [], sel = null;
    el.innerHTML = `<div class="pj-box"><aside class="pj-list"><div class="pj-search d-flex gap-2"><input class="form-control form-control-sm" data-bus placeholder="Buscar empresa…" aria-label="Buscar empresa">${RO ? '' : '<button class="btn btn-sm btn-primary text-nowrap" data-new><i class="bi bi-plus-lg me-1"></i>Empresa</button>'}</div><div class="pj-items" data-items></div></aside>
      <section class="pj-det" data-der><div class="pj-vacio"><i class="bi bi-buildings fs-1 d-block mb-2"></i>Elige una empresa para ver sus cotizaciones y cuentas de cobro.</div></section></div>`;
    const caja = $('.pj-box', el), der = $('[data-der]', el), box = $('[data-items]', el);
    const ini = (r) => esc(String(r.name || '?').trim()[0]?.toUpperCase() || '?');
    const pintaLista = () => {
      box.innerHTML = lista.length ? lista.map((r) => `<button type="button" class="pj-it ${r.id === sel ? 'on' : ''}" data-id="${r.id}"><span class="pj-av">${ini(r)}</span><div class="t"><b>${esc(r.name)}</b><span class="pj-sub">${money(r.cotizado)} cotizado · ${money(r.cobrado)} cobrado</span></div>${r.cotizaciones ? `<span class="pj-n">${r.cotizaciones}</span>` : ''}</button>`).join('')
        : '<div class="pj-vacio">Sin empresas. Crea la primera o pídeselo a la IA.</div>';
    };
    async function cargaLista(q = '') {
      try { lista = (await api(`${B}/projects?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}`)).rows; } catch (x) { toast(x.message, false); lista = []; }
      if (sel && !lista.some((r) => r.id === sel)) sel = null;
      pintaLista(); if (sel) detalle(sel);
    }
    async function detalle(id) {
      sel = id; pintaLista(); caja.classList.add('abierto');
      let d; try { d = await api(`${B}/projects/${id}/detalle`); } catch (x) { der.innerHTML = `<div class="pj-vacio text-danger">${esc(x.message)}</div>`; return; }
      const p = d.proyecto, cuentas = new Map(d.cuentas_de_cobro.map((x) => [x.id, x])), recarga = () => cargaLista($('[data-bus]', el).value.trim());
      const datos = [p.tax_id && `NIT ${esc(p.tax_id)}`, p.client_email && esc(p.client_email), p.client_city && esc(p.client_city)].filter(Boolean).join(' · ');
      der.innerHTML = `<div class="pj-cab"><div class="pj-cab1"><button class="btn btn-sm btn-outline-secondary pj-back" data-back aria-label="Volver"><i class="bi bi-arrow-left"></i></button><span class="pj-av">${ini(p)}</span>
          <div class="t"><b>${esc(p.name)}</b><span class="pj-sub">${datos || 'Sin NIT, correo ni ciudad: agrégalos en «Datos»'}</span></div></div>
          ${RO ? '' : '<div class="pj-tb"><button class="btn btn-sm btn-primary" data-cot><i class="bi bi-plus-lg"></i>Cotización</button><button class="btn btn-sm btn-outline-secondary" data-edit><i class="bi bi-pencil"></i>Datos</button></div>'}</div>
        <div class="pj-log">${d.cotizaciones.length ? d.cotizaciones.map((x) => {
          const cu = cuentas.get(x.invoice_id);
          return `<div class="pj-q" data-q="${x.id}"><div class="pj-q1"><a href="#" data-act="edit" class="fw-semibold text-decoration-none">${esc(x.number)}</a>${chip(...(COT[x.status] || ['free', x.status]))}<span class="tot">${money(x.total)}</span></div>
            <div class="small text-body-secondary">${esc(x.title || 'Sin título')} · ${day(x.issue_date)}${x.valid_until ? ` · válida hasta ${day(x.valid_until)}` : ''}</div>
            ${cu ? `<div class="small mt-1"><i class="bi bi-receipt me-1"></i>${esc(cu.number)} · ${money(cu.total)} · ${chip(...(COB[cu.status] || ['free', cu.status]))}</div>` : ''}
            <div class="pj-qa"><button class="btn btn-outline-primary" data-act="ver"><i class="bi bi-eye"></i>Ver cotización</button>
              ${RO ? '' : cu ? `<button class="btn btn-outline-primary" data-act="vercuenta" data-inv="${cu.id}"><i class="bi bi-receipt"></i>Ver cuenta</button><button class="btn btn-outline-secondary" data-act="enviarcuenta" data-inv="${cu.id}"><i class="bi bi-send"></i>Enviar cuenta</button>`
                : `<button class="btn btn-primary" data-act="cobrar"><i class="bi bi-receipt"></i>Cuenta de cobro</button>`}
              ${RO ? '' : '<button class="btn btn-outline-secondary" data-act="enviar"><i class="bi bi-send"></i>Enviar cotización</button>'}</div></div>`; }).join('')
          : '<div class="pj-vacio"><i class="bi bi-file-earmark-text fs-1 d-block mb-2"></i>Sin cotizaciones todavía.<br>Crea la primera con «Cotización» o pídeselo a la IA.</div>'}</div>`;
      $('[data-back]', der)?.addEventListener('click', () => caja.classList.remove('abierto'));
      $('[data-edit]', der)?.addEventListener('click', () => empresa(p, (id2) => { if (!id2) sel = null; else sel = id2; recarga(); }));
      $('[data-cot]', der)?.addEventListener('click', () => cotizacion({ project_id: p.id, counterparty: p.name, tax_id: p.tax_id, client_city: p.client_city, client_email: p.client_email }, recarga));
      der.onclick = async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return; e.preventDefault();
        const qid = +b.closest('[data-q]').dataset.q, a = b.dataset.act;
        if (a === 'ver') pdf(`${B}/quotes/${qid}/pdf`);
        else if (a === 'vercuenta') pdf(`${F}/invoices/${b.dataset.inv}/pdf`);
        else if (a === 'cobrar') cobrar(qid, recarga);
        else if (a === 'enviar') enviar('cotizacion', qid, recarga);
        else if (a === 'enviarcuenta') enviar('cuenta', +b.dataset.inv, recarga);
        else if (a === 'edit') { try { cotizacion(await api(`${B}/quotes/${qid}`), recarga); } catch (x) { toast(x.message, false); } }
      };
    }
    box.onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) detalle(+b.dataset.id); };
    $('[data-bus]', el).addEventListener('input', debounce((e) => cargaLista(e.target.value.trim())));
    $('[data-new]', el)?.addEventListener('click', () => empresa(null, (id) => { sel = id; cargaLista(); }));
    cargaLista();
  }

  function cotizaciones(el) {
    el.innerHTML = '<div data-t></div>';
    const t = C.table({ el: $('[data-t]', el), base: B, entity: 'quotes', title: 'cotización', newText: 'Nueva cotización', fields: [], empty: 'Sin cotizaciones. Crea la primera o pídeselo a la IA: «hazle una cotización a…».', emptyIcon: 'bi-file-earmark-text',
      filters: [{ k: 'status', options: [['', 'Todas'], ['borrador', 'Borradores'], ['enviada', 'Enviadas'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']] }],
      onEdit: (row, changed) => cotizacion(row, changed),
      columns: [{ label: 'Cotización', main: true, html: (r) => `${esc(r.number)}${sub(r.title)}` }, { label: 'Cliente', html: (r) => `${esc(r.counterparty)}${sub(r.tax_id)}` }, { label: 'Fecha', html: (r) => day(r.issue_date) },
        { label: 'Vigencia', html: (r) => (r.vencida ? `<span class="text-danger">${day(r.valid_until)}</span>` : day(r.valid_until)) }, { label: 'Total', cls: 'text-end', html: (r) => money(r.total) },
        { label: 'Estado', html: (r) => chip(...(COT[r.status] || ['free', r.status])) }],
      rowActions: (r) => `<button class="btn btn-sm btn-outline-primary" data-act="pdf"><i class="bi bi-filetype-pdf me-1"></i>PDF</button>${RO || r.invoice_id || r.status === 'rechazada' ? '' : ' <button class="btn btn-sm btn-primary" data-act="cobrar"><i class="bi bi-receipt me-1"></i>Aprobar y cobrar</button>'}`,
      onAction: async (a, r) => {
        if (a === 'pdf') return pdf(`${B}/quotes/${r.id}/pdf`);
        if (a === 'cobrar') cobrar(r.id, () => t.load());
      } });
    t.load();
  }

  // Editor de la cotización: datos del cliente, líneas, condiciones y total
  function cotizacion(row, changed) {
    if (RO && !(row && row.id)) return;
    const editando = !!(row && row.id), bloqueada = editando && !!row.invoice_id;
    const v = editando ? { ...row } : { issue_date: C.todayCo(), ...row };
    let lines = []; try { lines = JSON.parse(v.items || '[]'); } catch { /* vacío */ }
    let ex = {}; try { ex = JSON.parse(v.extra || '{}') || {}; } catch { /* vacío */ }
    const desdeEmpresa = !!v.project_id, lst = (a) => (Array.isArray(a) ? a.join('\n') : '');
    if (!lines.length) lines = [{ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }];
    const n = (x) => Number(String(x ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
    const { el: d } = modal(`<form novalidate>
      <div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${editando ? `Cotización ${esc(row.number)}` : 'Nueva cotización'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        ${desdeEmpresa ? `<div class="col-12"><div class="small text-body-secondary border rounded p-2"><b>${esc(v.counterparty || '')}</b>${[v.tax_id && ' · NIT ' + esc(v.tax_id), v.client_email && ' · ' + esc(v.client_email), v.client_city && ' · ' + esc(v.client_city)].filter(Boolean).join('')}<br>Los datos de la empresa se cambian en «Datos» y se actualizan aquí solos.</div></div>`
          : `        <div class="col-12"><label class="form-label small mb-1">Cliente</label><input class="form-control" name="counterparty" required value="${esc(v.counterparty || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">NIT o documento</label><input class="form-control" name="tax_id" value="${esc(v.tax_id || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">Ciudad</label><input class="form-control" name="client_city" value="${esc(v.client_city || '')}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1">Correo</label><input class="form-control" name="client_email" type="email" value="${esc(v.client_email || '')}"></div>
`}
        <div class="col-12"><label class="form-label small mb-1">Título del trabajo</label><input class="form-control" name="title" value="${esc(v.title || '')}" placeholder="Landing de campaña"></div>
        <div class="col-12"><label class="form-label small mb-1">Resumen del alcance</label><textarea class="form-control" name="concept" rows="2">${esc(v.concept || '')}</textarea></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Fecha</label><input class="form-control" name="issue_date" type="date" required value="${esc(v.issue_date || '')}"></div>
        <div class="col-sm-6"><label class="form-label small mb-1">Válida hasta</label><input class="form-control" name="valid_until" type="date" value="${esc(v.valid_until || '')}"></div></div>
        <div class="mt-3" data-lines></div>
        ${bloqueada ? '<p class="small text-body-secondary">Ya tiene cuenta de cobro: las líneas no se pueden cambiar.</p>' : '<button class="btn btn-sm btn-outline-primary mt-1" type="button" data-add><i class="bi bi-plus-lg me-1"></i>Agregar línea</button>'}
        <div class="text-end mt-2">Total <b class="fs-4" data-total>$0</b></div>
        <div class="row g-2 mt-1"><div class="col-12"><label class="form-label small mb-1">Condiciones <span class="text-body-secondary">· forma de pago, entrega, qué no incluye</span></label><textarea class="form-control" name="conditions" rows="3">${esc(v.conditions || '')}</textarea></div>
          <div class="col-12"><label class="form-label small mb-1">Sugerencias <span class="text-body-secondary">· una por línea; salen aparte en el PDF y no suman al total</span></label><textarea class="form-control" name="sugerencias" rows="3">${esc(lst(ex.sugerencias))}</textarea></div>
          <div class="col-sm-8"><label class="form-label small mb-1">Lo que necesitamos del cliente <span class="text-body-secondary">· una por línea</span></label><textarea class="form-control" name="necesitamos" rows="2">${esc(lst(ex.necesitamos))}</textarea></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Plazo de entrega</label><input class="form-control" name="plazo" value="${esc(ex.plazo || '')}" placeholder="3 semanas"></div>
          ${editando ? `<div class="col-sm-6"><label class="form-label small mb-1">Estado</label><select class="form-select" name="status">${Object.entries(COT).map(([k, x]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>` : ''}</div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${editando && me.canManage ? '<button type="button" class="btn btn-sm btn-outline-danger" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-outline-primary" value="save">Guardar</button> <button class="btn btn-primary" value="pdf"><i class="bi bi-filetype-pdf me-1"></i>Guardar y ver PDF</button></span></div></form>`, { size: 'modal-xl' });
    const f = $('form', d), box = $('[data-lines]', d);
    const draw = () => {
      box.innerHTML = lines.map((l, i) => `<div class="row g-2 align-items-start mb-2" data-i="${i}">
        <div class="col-12 col-md-5"><input class="form-control" data-k="concepto" value="${esc(l.concepto || '')}" placeholder="Concepto" ${bloqueada ? 'disabled' : ''}><input class="form-control form-control-sm mt-1" data-k="detalle" value="${esc(l.detalle || '')}" placeholder="Detalle (opcional)" ${bloqueada ? 'disabled' : ''}></div>
        <div class="col-3 col-md-1"><input class="form-control" data-k="cantidad" type="number" min="0" step="any" value="${esc(l.cantidad ?? 1)}" ${bloqueada ? 'disabled' : ''}></div>
        <div class="col-4 col-md-2"><select class="form-select" data-k="moneda" ${bloqueada ? 'disabled' : ''}><option value="COP" ${l.moneda !== 'USD' ? 'selected' : ''}>COP</option><option value="USD" ${l.moneda === 'USD' ? 'selected' : ''}>USD</option></select></div>
        <div class="col-5 col-md-2"><input class="form-control" data-k="valor" type="number" min="0" step="any" value="${esc(l.valor ?? '')}" placeholder="Valor unitario" ${bloqueada ? 'disabled' : ''}></div>
        <div class="col-10 col-md-1 text-md-end pt-2"><b data-lt>$0</b></div>
        <div class="col-2 col-md-1 text-end">${bloqueada ? '' : '<button class="btn btn-sm btn-light" type="button" data-rm aria-label="Quitar"><i class="bi bi-x-lg"></i></button>'}</div></div>`).join('');
      calc();
    };
    const read = () => $$('[data-i]', box).forEach((r) => { const l = lines[+r.dataset.i]; $$('[data-k]', r).forEach((x) => { l[x.dataset.k] = x.value; }); });
    function calc() {
      read(); let total = 0;
      $$('[data-i]', box).forEach((r) => { const l = lines[+r.dataset.i], usd = l.moneda === 'USD', t = usd ? Math.round(n(l.valor) * (n(l.cantidad) || 1) * 1000) / 1000 : Math.round(n(l.valor) * (n(l.cantidad) || 1)); total += usd ? 0 : t; $('[data-lt]', r).textContent = usd ? `USD ${t}` : money(t); });
      $('[data-total]', d).textContent = money(total) + (lines.some((l) => l.moneda === 'USD') ? ' + USD (TRM al guardar)' : '');
    }
    box.addEventListener('input', calc); box.addEventListener('change', calc);
    box.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { read(); lines.splice(+e.target.closest('[data-i]').dataset.i, 1); if (!lines.length) lines.push({ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }); draw(); } });
    $('[data-add]', d)?.addEventListener('click', () => { read(); lines.push({ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }); draw(); });
    $('[data-del]', d)?.addEventListener('click', async () => { if (!await confirm('¿Borrar esta cotización?')) return; try { await api(`${B}/quotes/${row.id}`, { method: 'DELETE' }); bootstrap.Modal.getInstance(d)?.hide(); toast('Borrada'); changed(); } catch (x) { toast(x.message, false); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); read();
      const go = e.submitter?.value, body = Object.fromEntries(new FormData(f));
      const ll = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
      body.extra = JSON.stringify({ ...ex, sugerencias: ll(body.sugerencias), necesitamos: ll(body.necesitamos), plazo: (body.plazo || '').trim() });
      delete body.sugerencias; delete body.necesitamos; delete body.plazo;
      if (!bloqueada) body.items = lines.filter((l) => String(l.concepto).trim()).map((l) => ({ concepto: l.concepto, detalle: l.detalle || undefined, cantidad: n(l.cantidad) || 1, moneda: l.moneda, valor: n(l.valor) }));
      if (v.project_id) { body.project_id = v.project_id; body.counterparty ||= v.counterparty; }
      if (!body.valid_until) delete body.valid_until;
      try {
        const out = await api(editando ? `${B}/quotes/${row.id}` : `${B}/quotes`, { method: editando ? 'PATCH' : 'POST', body });
        bootstrap.Modal.getInstance(d)?.hide(); toast('Guardada'); changed(); if (go === 'pdf') pdf(`${B}/quotes/${editando ? row.id : out.id}/pdf`);
      } catch (x) { $('[data-err]', d).textContent = x.message; }
    });
    draw();
  }

  function cobros(el) {
    el.innerHTML = '<p class="small text-body-secondary">Las cuentas de cobro se crean al aprobar una cotización (o con la IA) y viven en Finanzas → Cobros, donde registras sus pagos y recibos.</p><div data-t></div>';
    const t = C.table({ el: $('[data-t]', el), base: F, entity: 'invoices', title: 'cuenta de cobro', fields: [], readOnly: true, onOpen: (r) => pdf(`${F}/invoices/${r.id}/pdf`), empty: 'Aún no hay cuentas de cobro.', emptyIcon: 'bi-receipt',
      filters: [{ k: 'kind', options: [['emitida', 'Por cobrar']] }],
      columns: [{ label: 'Cuenta', main: true, html: (r) => `${esc(r.number || '#' + r.id)}${sub(r.counterparty)}` }, { label: 'Emisión', html: (r) => day(r.issue_date) }, { label: 'Vence', html: (r) => day(r.due_date) },
        { label: 'Total', cls: 'text-end', html: (r) => money(r.total) }, { label: 'Saldo', cls: 'text-end', html: (r) => money(Math.max(0, r.total - r.paid)) }, { label: 'Estado', html: (r) => chip(...(COB[r.state] || ['free', r.state])) }],
      rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="pdf"><i class="bi bi-filetype-pdf me-1"></i>PDF</button>',
      onAction: (a, r) => { if (a === 'pdf') pdf(`${F}/invoices/${r.id}/pdf`); } });
    t.load();
  }

  function render() {
    root.innerHTML = '';
    ({ proyectos, cotizaciones, cobros })[view](root);
  }
  const seg = $('[data-seg]');
  seg.className = 'dw-segb'; seg.hidden = false;
  if (!document.getElementById('dw-segb-css')) document.head.insertAdjacentHTML('beforeend', '<style id="dw-segb-css">.dw-segb{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}.dw-segb .btn{flex:none;white-space:nowrap}</style>');
  seg.innerHTML = VIEWS.map(([k, l]) => `<button type="button" class="btn btn-sm btn-outline-secondary ${k === view ? 'active' : ''}" data-k="${k}">${esc(l)}</button>`).join('');
  seg.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; view = b.dataset.k; location.hash = view; $$('.btn', seg).forEach((x) => x.classList.toggle('active', x === b)); render(); };
  cabecera().then(render);
});

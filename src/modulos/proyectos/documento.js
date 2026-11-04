// Cotización en PDF (diseño propuesta): encabezado con degradado de la marca, indicadores, secciones con bloques, inversión,
// propuesta sugerida, lo que se necesita del cliente, condiciones y firma. HTML A4 que el navegador guarda como PDF.
// El contenido extra (`pr_quotes.extra`, JSON) es opcional: { subtitulo, kpis:[{label,valor}], secciones:[{titulo, salto, bloques}],
// sugerido:{etiqueta,titulo,bloques}, necesitamos:[texto], plazo }. Bloques: texto | etiqueta | chips | lista | nota | tabla.
import { getProfile, skin } from '../finanzas/documento.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const usd = (n) => 'USD ' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const lineas = (t) => String(t || '').split(/\n+/).map((x) => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
const parse = (v, def) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v || ''); } catch { return def; } };

function bloque(b) {
  const it = (b.items || []).map((x) => String(x));
  switch (b.tipo) {
    case 'texto': return `<p>${rich(b.texto ?? b.html)}</p>`;
    case 'etiqueta': return `<div class="label">${esc(b.texto)}</div>`;
    case 'chips': return `<div class="chips">${it.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>`;
    case 'lista': return `<ul class="bl">${it.map((i) => `<li>${rich(i)}</li>`).join('')}</ul>`;
    case 'nota': return `<div class="note">${rich(b.texto ?? b.html)}</div>`;
    case 'tabla': {
      const cols = b.columnas || [], filas = b.filas || [];
      return `<table${b.junta ? ' class="junta"' : ''}><thead><tr>${cols.map((c, i) => `<th${b.valores && i === cols.length - 1 ? ' class="r"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${i === 0 && !b.valores ? 'k' : ''}${b.valores && i === f.length - 1 ? ' r' : ''}">${rich(c)}</td>`).join('')}</tr>`).join('')}${b.total ? `<tr class="total">${b.total.map((c, i) => `<td${i === b.total.length - 1 ? ' class="r"' : ''}>${esc(c)}</td>`).join('')}</tr>` : ''}</tbody></table>`;
    }
    default: return '';
  }
}
const seccion = (s) => `${s.salto ? '<div style="break-before:page"></div>' : ''}<h2>${esc(s.titulo)}</h2>${(s.bloques || []).map(bloque).join('')}`;

export async function cotizacionDocument(env, org, q, { autoprint = false, logo = null } = {}) {
  const p = await getProfile(env, org), K = await skin(env, org), x = parse(q.extra, {}) || {};
  const items = parse(q.items, []);
  const marca = p.brand || p.issuer_name || 'Diwilo', total = q.total || 0;
  const diasValidez = q.valid_until && q.issue_date ? Math.max(0, Math.round((new Date(q.valid_until) - new Date(q.issue_date)) / 864e5)) : 15;
  const money = (i, v) => (i.moneda === 'USD' ? usd(v) : pesos(v));
  const tablaInversion = { tipo: 'tabla', valores: true, columnas: ['Concepto', 'Cant.', 'Valor', 'Total (COP)'],
    filas: items.map((i) => [`**${i.concepto || 'Servicio'}**`, i.cantidad ?? 1, money(i, i.valor), pesos(i.total)]),
    total: [q.tax ? 'Total con impuestos' : 'Inversión total', '', '', pesos(total)] };
  if (q.tax) tablaInversion.filas.push(['Impuestos', '', '', pesos(q.tax)]);
  const alcance = lineas(q.concept);
  const secciones = Array.isArray(x.secciones) && x.secciones.length ? [...x.secciones] : [];
  if (!secciones.length && (alcance.length || q.title)) secciones.push({ titulo: 'Alcance de la propuesta', bloques: [q.title ? { tipo: 'texto', texto: `**${q.title}**` } : null, alcance.length > 1 ? { tipo: 'lista', items: alcance } : alcance.length ? { tipo: 'texto', texto: alcance[0] } : null].filter(Boolean) });
  if (!secciones.some((s) => /inversi/i.test(s.titulo))) secciones.push({ titulo: 'Inversión', bloques: [tablaInversion, ...(items.some((i) => i.moneda === 'USD') ? [{ tipo: 'nota', texto: 'Los valores en USD se convierten a pesos con la TRM oficial del día de la cotización.' }] : [])] });
  const kpis = Array.isArray(x.kpis) && x.kpis.length ? x.kpis : [{ label: 'Inversión total', valor: pesos(total) }, { label: 'Válida hasta', valor: fecha(q.valid_until) || '—' }, { label: 'Conceptos', valor: String(items.length || 1) }, ...(x.plazo ? [{ label: 'Plazo', valor: x.plazo }] : [])];
  const cond = lineas(q.conditions), nec = Array.isArray(x.necesitamos) ? x.necesitamos : [];
  const sug = x.sugerido;
  const cliente = q.counterparty, ciudad = q.client_city ? `, ${q.client_city}` : '';
  const sub = x.subtitulo || `Preparada por ${marca} para ${cliente}${ciudad}`;
  const emisor = p.issuer_name || marca;
  const fileName = `Cotización ${q.number} - ${cliente}`.replace(/[\\/:*?"<>|]/g, '');
  const contacto = [p.web, p.email].filter(Boolean).join(' · ');
  const logoHtml = logo ? `<img src="${esc(logo)}" alt="">` : `<span class="ini">${esc(marca.slice(0, 1).toUpperCase())}</span>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(fileName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:16mm 14mm 18mm 14mm;@bottom-left{content:"${esc(marca)}${contacto ? ' · ' + esc(contacto) : ''}";font-family:Inter;font-size:7.5pt;color:#8a8698}@bottom-right{content:"Página " counter(page) " de " counter(pages);font-family:Inter;font-size:7.5pt;color:#8a8698}}
:root{--p:${K.c500};--p2:${K.c700};--pl:${K.c50};--pb:${K.c100};--tx:#1F1A2E;--mu:#6B6680}
*{box-sizing:border-box}html{background:#e9e7f1}body{font-family:Inter,sans-serif;font-size:9pt;line-height:1.55;color:var(--tx);margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc{max-width:190mm;margin:0 auto;background:#fff;padding:14mm}
h1,h2,h3{font-family:Poppins,sans-serif;font-weight:700}b,strong{font-weight:600}
.bar{position:sticky;top:0;z-index:5;background:#1F1A2E;color:#fff;padding:8px 14px;display:flex;gap:8px;align-items:center;font:500 12px Inter,sans-serif}.bar button{border:0;border-radius:6px;padding:6px 12px;font:600 12px Inter;background:var(--p);color:#fff;cursor:pointer}.bar .sec{background:#413b57}.bar span{opacity:.7;margin-left:auto}
.hero{border-radius:14px;padding:18px 22px 22px;color:#fff;position:relative;overflow:hidden;background:linear-gradient(120deg,${K.c400} 0%,${K.c500} 45%,${K.c700} 100%)}
.hero:after{content:"";position:absolute;right:-60px;top:-40px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.07)}
.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.brand{display:flex;align-items:center;gap:10px;flex-shrink:0}
.logo{width:40px;height:40px;background:#fff;border-radius:9px;padding:5px;display:flex;align-items:center;justify-content:center;color:var(--p2);font:700 18px Poppins}.logo img{width:30px;height:30px;object-fit:contain}
.brand .name{font-family:Poppins;font-weight:700;font-size:15pt;line-height:1.1}.brand .tag{font-size:6.5pt;letter-spacing:2px;text-transform:uppercase;opacity:.85;white-space:nowrap}
.meta{text-align:right;font-size:7.5pt;line-height:1.45}.meta .kind{font-family:Poppins;font-weight:700;font-size:9pt;letter-spacing:3px}
.hero h1{font-size:21pt;line-height:1.15;margin:16px 0 6px}.hero .sub{font-size:8.5pt;opacity:.9}
.kpis{display:flex;gap:8px;margin:10px 0 14px}.kpi{flex:1;border:1px solid var(--pb);border-radius:10px;padding:8px 12px;background:var(--pl)}
.kpi .l{font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu)}.kpi .v{font-family:Poppins;font-weight:700;font-size:12.5pt;color:var(--p2);line-height:1.3}
.kpi.main{background:linear-gradient(120deg,${K.c500},${K.c700});border:none}.kpi.main .l{color:rgba(255,255,255,.85)}.kpi.main .v{color:#fff}
h2{font-size:12pt;color:var(--p2);margin:14px 0 8px;padding-bottom:5px;border-bottom:1.5px solid var(--pb);break-after:avoid}
h2:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--p);margin:0 8px 1px 2px;box-shadow:0 0 0 2px var(--pb)}
p{margin:0 0 6px}.label{color:var(--p2);font-weight:600;margin:8px 0 4px}.chips{margin:2px 0 4px}.chip{display:inline-block;background:var(--pb);color:var(--p2);font-weight:600;font-size:7.5pt;border-radius:20px;padding:3px 10px;margin:0 3px 4px 0}
.note{font-size:7.8pt;color:var(--mu);margin-top:6px}ul.bl{margin:4px 0 6px;padding-left:14px}ul.bl li{margin-bottom:2px}ul.bl li::marker{color:var(--p)}
table{width:100%;border-collapse:collapse;font-size:8.3pt}thead th{background:var(--p);color:#fff;text-align:left;font-weight:600;padding:6px 9px}thead th:first-child{border-top-left-radius:6px}thead th:last-child{border-top-right-radius:6px}
td{padding:6px 9px;border-bottom:1px solid var(--pb);vertical-align:top}tr{break-inside:avoid}tbody tr:nth-child(even) td{background:var(--pl)}td.k{color:var(--p2);font-weight:600;width:30%}.r{text-align:right}
tr.total td{background:var(--pl)!important;font-weight:700;color:var(--p2);border-bottom:2px solid var(--p)}table.junta{break-inside:avoid}
.sug{border:1.5px dashed var(--p);border-radius:12px;padding:12px 14px;margin:12px 0;break-inside:avoid}.sug .pill{display:inline-block;background:var(--p);color:#fff;font-size:6.5pt;letter-spacing:2px;text-transform:uppercase;border-radius:20px;padding:2px 9px}.sug h3{font-size:11.5pt;color:var(--p2);margin:6px 0 4px}
.cards{display:flex;gap:10px;margin-top:10px;break-inside:avoid}.card{flex:1;border:1px solid var(--pb);border-radius:12px;padding:10px 14px}.card h3{font-size:9.5pt;color:var(--p2);margin:0 0 4px}.card ul{margin:0;padding-left:14px;font-size:8.3pt}.card li{margin-bottom:3px}.card li::marker{color:var(--p)}
.sign{margin-top:16px;break-inside:avoid}.sign img{max-height:54px;max-width:220px;display:block;margin-bottom:-6px}.sign .line{border-top:1px solid var(--tx);padding-top:6px;margin-top:${p.signature ? '4px' : '48px'};display:inline-block;min-width:240px}.sign b{display:block}.sign span{display:block;color:var(--mu);font-size:8pt}
.foot{margin-top:12px;border-radius:12px;padding:12px 18px;color:#fff;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,${K.c400},${K.c700});break-inside:avoid}.foot .name{font:700 11pt Poppins}.foot .contact{font-size:8pt;opacity:.9}.foot .thanks{font-size:7.8pt;opacity:.9}
@media print{html{background:#fff}.bar{display:none}.doc{max-width:none;padding:0}}
@media screen and (max-width:700px){.doc{padding:12px}.kpis,.cards{flex-direction:column}.hero-top{flex-direction:column}.meta{text-align:left}}
</style></head><body>
<div class="bar"><button onclick="print()">Descargar PDF</button><button class="sec" onclick="history.length>1?history.back():close()">Cerrar</button><span>En la ventana de impresión elige «Guardar como PDF»</span></div>
<div class="doc">
<div class="hero"><div class="hero-top"><div class="brand"><div class="logo">${logoHtml}</div><div><div class="name">${esc(marca)}</div>${p.tagline ? `<div class="tag">${esc(p.tagline)}</div>` : ''}</div></div>
<div class="meta"><div class="kind">COTIZACIÓN</div><div>${esc(q.number || '')}</div><div>${esc(fecha(q.issue_date))}</div><div>Válida por ${diasValidez} días</div></div></div>
<h1>${esc(q.title || 'Propuesta de servicios')}</h1><div class="sub">${esc(sub)}</div></div>
<div class="kpis">${kpis.map((k, i) => `<div class="kpi${i === 0 ? ' main' : ''}"><div class="l">${esc(k.label)}</div><div class="v">${esc(k.valor)}</div></div>`).join('')}</div>
${secciones.map(seccion).join('')}
${sug ? `${sug.salto ? '<div style="break-before:page"></div>' : ''}<div class="sug"><span class="pill">${esc(sug.etiqueta || 'Sugerido')}</span><h3>${esc(sug.titulo)}</h3>${(sug.bloques || []).map(bloque).join('')}</div>` : ''}
${nec.length || cond.length ? `<div class="cards">${nec.length ? `<div class="card"><h3>Lo que necesitamos de ${esc(x.cliente_corto || cliente)}</h3><ul>${nec.map((i) => `<li>${rich(i)}</li>`).join('')}</ul></div>` : ''}${cond.length ? `<div class="card"><h3>Condiciones</h3><ul>${cond.map((i) => `<li>${rich(i)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
<section class="sign">${p.signature ? `<img src="${esc(p.signature)}" alt="Firma">` : ''}<div class="line"><b>${esc(emisor)}</b>${p.issuer_doc ? `<span>${esc(p.signer_doc_label || p.issuer_doc_label || 'Documento')}: ${esc(p.issuer_doc)}${p.issuer_doc_city ? ` de ${esc(p.issuer_doc_city)}` : ''}</span>` : ''}${p.phone ? `<span>${esc(p.phone)}</span>` : ''}</div></section>
<div class="foot"><div class="brand"><div class="logo" style="width:34px;height:34px;padding:4px">${logoHtml}</div><div><div class="name">${esc(marca)}</div><div class="contact">${esc(contacto)}</div></div></div><div class="thanks">Gracias por confiar en nosotros</div></div>
</div>
${autoprint ? "<script>addEventListener('load',function(){setTimeout(function(){print()},500)})</script>" : ''}
</body></html>`;
}

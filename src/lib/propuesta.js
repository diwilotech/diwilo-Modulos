// Diseño común de los documentos «propuesta» (cotización y cuenta de cobro): encabezado con degradado de la marca, indicadores,
// secciones con bloques, tarjetas, firma y pie. HTML A4 que el navegador guarda como PDF (con texto real).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
export const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
export const usd = (n) => 'USD ' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fecha = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const lineas = (t) => String(t || '').split(/\n+/).map((x) => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
export const parse = (v, def) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v || ''); } catch { return def; } };

export function bloque(b) {
  const it = (b.items || []).map((x) => String(x));
  switch (b.tipo) {
    case 'texto': return `<p>${rich(b.texto ?? b.html)}</p>`;
    case 'etiqueta': return `<div class="label">${esc(b.texto)}</div>`;
    case 'chips': return `<div class="chips">${it.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>`;
    case 'lista': return `<ul class="bl">${it.map((i) => `<li>${rich(i)}</li>`).join('')}</ul>`;
    case 'nota': return `<div class="note">${rich(b.texto ?? b.html)}</div>`;
    case 'tabla': {
      const cols = b.columnas || [], filas = b.filas || [], der = (i) => b.derecha?.includes(i) || (b.valores && i === cols.length - 1);
      return `<table${b.junta ? ' class="junta"' : ''}><thead><tr>${cols.map((c, i) => `<th${der(i) ? ' class="r"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${b.idx && i === 0 ? 'idx' : (i === 0 && !b.valores ? 'k' : '') + (der(i) ? ' r' : '')}">${rich(c)}</td>`).join('')}</tr>`).join('')}${b.total ? `<tr class="total">${b.total.map((c, i) => `<td${der(i) ? ' class="r"' : ''}>${esc(c)}</td>`).join('')}</tr>` : ''}</tbody></table>`;
    }
    default: return '';
  }
}
export const seccion = (s) => `${s.salto ? '<div style="break-before:page"></div>' : ''}<h2>${esc(s.titulo)}</h2>${(s.bloques || []).map(bloque).join('')}`;
export const logoHtml = (logo, marca) => (logo ? `<img src="${esc(logo)}" alt="">` : `<span class="ini">${esc(String(marca || 'D').slice(0, 1).toUpperCase())}</span>`);

export const hero = ({ marca, tagline, logo, tipo, numero, lineasMeta = [], titulo, sub }) => `<div class="hero"><div class="hero-top"><div class="brand"><div class="logo">${logoHtml(logo, marca)}</div><div><div class="name">${esc(marca)}</div>${tagline ? `<div class="tag">${esc(tagline)}</div>` : ''}</div></div>
<div class="meta"><div class="kind">${esc(tipo)}</div><div>${esc(numero || '')}</div>${lineasMeta.map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>
<h1>${esc(titulo)}</h1><div class="sub">${esc(sub)}</div></div>`;
export const kpisHtml = (kpis) => `<div class="kpis">${kpis.map((k, i) => `<div class="kpi${i === 0 ? ' main' : ''}"><div class="l">${esc(k.label)}</div><div class="v">${esc(k.valor)}</div></div>`).join('')}</div>`;
export const firmaHtml = (p, emisor, extra = '') => `<section class="sign"><div class="who">${p.signature ? `<img src="${esc(p.signature)}" alt="Firma">` : ''}<div class="line"><b>${esc(emisor)}</b>${p.issuer_doc ? `<span>${esc(p.signer_doc_label || p.issuer_doc_label || 'Documento')}: ${esc(p.issuer_doc)}${p.issuer_doc_city ? ` de ${esc(p.issuer_doc_city)}` : ''}</span>` : ''}${p.phone ? `<span>${esc(p.phone)}</span>` : ''}</div></div>${extra}</section>`;
export const pieHtml = ({ marca, contacto, logo }) => `<div class="foot"><div class="brand"><div class="logo" style="width:34px;height:34px;padding:4px">${logoHtml(logo, marca)}</div><div><div class="name">${esc(marca)}</div><div class="contact">${esc(contacto)}</div></div></div><div class="thanks">Gracias por confiar en nosotros</div></div>`;
export const barra = '<div class="bar"><button onclick="print()">Descargar PDF</button><button class="sec" onclick="history.length>1?history.back():close()">Cerrar</button><span>En la ventana de impresión elige «Guardar como PDF»</span></div>';

export const estilos = (K, p, { marca, contacto }) => `
@page{size:A4;margin:16mm 14mm 18mm 14mm;@bottom-left{content:"${esc(marca)}${contacto ? ' · ' + esc(contacto) : ''}";font-family:Inter;font-size:7.5pt;color:#8a8698}@bottom-right{content:"Página " counter(page) " de " counter(pages);font-family:Inter;font-size:7.5pt;color:#8a8698}}
:root{--p:${K.c500};--p2:${K.c700};--pl:${K.c50};--pb:${K.c100};--tx:#1F1A2E;--mu:#6B6680}
*{box-sizing:border-box}html{background:#e9e7f1}body{font-family:Inter,sans-serif;font-size:9pt;line-height:1.55;color:var(--tx);margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc{max-width:190mm;margin:0 auto;background:#fff;padding:14mm;position:relative}
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
td{padding:6px 9px;border-bottom:1px solid var(--pb);vertical-align:top}tr{break-inside:avoid}tbody tr:nth-child(even) td{background:var(--pl)}td.k{color:var(--p2);font-weight:600;width:30%}td.idx{width:26px;color:var(--mu)}.r{text-align:right}td small{display:block;color:var(--mu);font-size:7pt}
tr.total td{background:var(--pl)!important;font-weight:700;color:var(--p2);border-bottom:2px solid var(--p)}table.junta{break-inside:avoid}
.sug{border:1.5px dashed var(--p);border-radius:12px;padding:12px 14px;margin:12px 0;break-inside:avoid}.sug .pill{display:inline-block;background:var(--p);color:#fff;font-size:6.5pt;letter-spacing:2px;text-transform:uppercase;border-radius:20px;padding:2px 9px}.sug h3{font-size:11.5pt;color:var(--p2);margin:6px 0 4px}
.cards{display:flex;gap:10px;margin-top:10px;break-inside:avoid}.card{flex:1;border:1px solid var(--pb);border-radius:12px;padding:10px 14px}.card h3{font-size:9.5pt;color:var(--p2);margin:0 0 4px}.card ul{margin:0;padding-left:14px;font-size:8.3pt}.card li{margin-bottom:3px}.card li::marker{color:var(--p)}
.card p{font-size:8.3pt;margin:0 0 3px;color:var(--mu)}.card p b{color:var(--tx)}.card .big{font:700 10pt Poppins;color:var(--tx);text-transform:uppercase}
.pay{display:flex;gap:14px;align-items:center;border:1px solid var(--pb);border-radius:12px;padding:10px 14px;margin-top:10px;break-inside:avoid}.pay>div:first-child{flex:1}.pay p{font-size:8.5pt;margin:0 0 4px}.bb{display:inline-block;background:var(--p);color:#fff;font-size:6.5pt;letter-spacing:1px;text-transform:uppercase;border-radius:10px;padding:1px 7px;margin-right:6px}
.qr{width:84px;text-align:center;font-size:6.5pt;color:var(--mu);line-height:1.3}.qr svg{width:64px;height:64px}
.legal{margin-top:10px;color:var(--mu);font-size:7.5pt}
.sign{margin-top:16px;break-inside:avoid;display:flex;justify-content:space-between;align-items:flex-end;gap:16px}.sign .who{min-width:240px}.sign img{max-height:60px;max-width:220px;display:block;margin:0 0 -8px 4px}.sign .line{border-top:1px solid var(--tx);padding-top:6px;margin-top:${p.signature ? '4px' : '48px'};min-width:240px}.sign b{display:block}.sign span{display:block;color:var(--mu);font-size:8pt}
.verify{display:flex;gap:9px;align-items:center;border:1px solid var(--pb);border-radius:10px;padding:7px 9px;font-size:7.5pt;color:var(--mu)}.verify svg{width:54px;height:54px;display:block}.verify b{display:block;color:var(--tx)}.verify code{font-size:7.5pt;letter-spacing:.05em}
.foot{margin-top:12px;border-radius:12px;padding:12px 18px;color:#fff;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,${K.c400},${K.c700});break-inside:avoid}.foot .name{font:700 11pt Poppins}.foot .contact{font-size:8pt;opacity:.9}.foot .thanks{font-size:7.8pt;opacity:.9}
.stamp{position:absolute;top:110px;right:30px;transform:rotate(-12deg);border:3px solid currentColor;border-radius:10px;padding:4px 16px;font:700 22pt Poppins;letter-spacing:.12em;text-transform:uppercase;opacity:.5;z-index:2}.stamp.ok{color:#16a34a}.stamp.bad{color:#dc2626}
@media print{html{background:#fff}.bar{display:none}.doc{max-width:none;padding:0}}
@media screen and (max-width:700px){.doc{padding:12px}.kpis,.cards,.pay,.sign{flex-direction:column;align-items:stretch}.hero-top{flex-direction:column}.meta{text-align:left}}`;
export const cabeza = (titulo) => `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet">`;

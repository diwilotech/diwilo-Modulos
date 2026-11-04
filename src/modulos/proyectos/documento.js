// Cotización en PDF (diseño propuesta, ver src/lib/propuesta.js). El contenido extra (`pr_quotes.extra`, JSON) es opcional:
// { subtitulo, kpis:[{label,valor}], secciones:[{titulo, salto, bloques}], sugerido:{etiqueta,titulo,bloques,salto}, sugerencias:[texto], necesitamos:[texto], plazo }.
// Bloques: texto | etiqueta | chips | lista | nota | tabla. Las `sugerencias` salen aparte, en su recuadro «Sugerido», y no suman al total.
import { getProfile, skin } from '../finanzas/documento.js';
import { esc, rich, pesos, usd, fecha, lineas, parse, bloque, seccion, hero, kpisHtml, firmaHtml, pieHtml, barra, estilos, cabeza } from '../../lib/propuesta.js';

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
  const sugs = lineas(Array.isArray(x.sugerencias) ? x.sugerencias.join('\n') : x.sugerencias);
  const sug = x.sugerido || (sugs.length ? { etiqueta: 'Sugerencias', titulo: 'Para sacarle más provecho', bloques: [{ tipo: 'lista', items: sugs }, { tipo: 'nota', texto: 'Son opcionales y no están incluidas en la inversión total. Las cotizamos aparte si te interesan.' }] } : null);
  const cliente = q.counterparty, ciudad = q.client_city ? `, ${q.client_city}` : '';
  const contacto = [p.web, p.email].filter(Boolean).join(' · '), emisor = p.issuer_name || marca;
  const fileName = `Cotización ${q.number} - ${cliente}`.replace(/[\\/:*?"<>|]/g, '');
  return `<!doctype html><html lang="es"><head>${cabeza(fileName)}<style>${estilos(K, p, { marca, contacto })}</style></head><body>${barra}
<div class="doc">
${hero({ marca, tagline: p.tagline, logo, tipo: 'COTIZACIÓN', numero: q.number, lineasMeta: [fecha(q.issue_date), `Válida por ${diasValidez} días`], titulo: q.title || 'Propuesta de servicios', sub: x.subtitulo || `Preparada por ${marca} para ${cliente}${ciudad}` })}
${kpisHtml(kpis)}
<div class="cards"><div class="card"><h3>Preparada para</h3><p class="big">${esc(cliente)}</p>${q.tax_id ? `<p>NIT ${esc(q.tax_id)}</p>` : ''}${q.client_city ? `<p>${esc(q.client_city)}</p>` : ''}${q.client_email ? `<p>${esc(q.client_email)}</p>` : ''}</div>
<div class="card"><h3>Presentada por</h3><p class="big">${esc(emisor)}</p>${p.issuer_doc ? `<p>${esc(p.issuer_doc_label || 'NIT')} ${esc(p.issuer_doc)}${p.issuer_doc_city ? ` de ${esc(p.issuer_doc_city)}` : ''}</p>` : ''}<p>${[p.phone, p.email].filter(Boolean).map(esc).join(' · ')}</p></div></div>
${secciones.map(seccion).join('')}
${sug ? `${sug.salto ? '<div style="break-before:page"></div>' : ''}<div class="sug"><span class="pill">${esc(sug.etiqueta || 'Sugerido')}</span><h3>${esc(sug.titulo)}</h3>${(sug.bloques || []).map(bloque).join('')}</div>` : ''}
${nec.length || cond.length ? `<div class="cards">${nec.length ? `<div class="card"><h3>Lo que necesitamos de ${esc(x.cliente_corto || cliente)}</h3><ul>${nec.map((i) => `<li>${rich(i)}</li>`).join('')}</ul></div>` : ''}${cond.length ? `<div class="card"><h3>Condiciones</h3><ul>${cond.map((i) => `<li>${rich(i)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
${firmaHtml(p, emisor)}
${pieHtml({ marca, contacto, logo })}
</div>
${autoprint ? "<script>addEventListener('load',function(){setTimeout(function(){print()},500)})</script>" : ''}
</body></html>`;
}

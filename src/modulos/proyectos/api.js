// Proyectos: clientes/proyectos y sus cotizaciones (con PDF y firma, igual que las cuentas de cobro). Al aprobar una cotización se crea su cuenta de cobro
// en Finanzas (fin_invoices, ligada por project_id). Ver: todo el equipo; borrar: administrador.
//   CRUD   /api/proyectos/{projects|quotes}
//   GET    /api/proyectos/quotes/:id/pdf          cotización lista para imprimir o guardar como PDF (con tu firma y tus datos de Finanzas)
//   POST   /api/proyectos/quotes/:id/cobrar       { fecha?, vence? } la aprueba y crea su cuenta de cobro (sin pagar) en Finanzas
//   GET    /api/proyectos/projects/:id/detalle    el proyecto con sus cotizaciones y cuentas de cobro
//   GET    /api/proyectos/summary                 indicador del Inicio
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, today, addDays, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { Router } from '../../router.js';
import { ENTITIES as FIN, trm } from '../finanzas/api.js';
import { priceItems, invoiceDocument, verifyCode, getProfile } from '../finanzas/documento.js';
import { llamar } from '../../lib/interno.js';
import { cotizacionDocument } from './documento.js';

const MOD = 'proyectos', B = '/api/proyectos';
const fin = crud(new Router(), { base: '/ia/finanzas', modulo: 'finanzas', entities: { invoices: FIN.invoices } });

async function numeroCotizacion(c) {
  const filas = await all(c.env, 'SELECT number FROM pr_quotes WHERE business_id = ? ORDER BY id DESC LIMIT 300', c.businessId);
  const max = filas.reduce((m, f) => Math.max(m, Number(/(\d+)\s*$/.exec(f.number || '')?.[1]) || 0), 0);
  return `COT-${String(max + 1).padStart(4, '0')}`;
}
// Líneas con su total (USD con la TRM de la fecha) y el total de la cotización
async function precio(c, row, before = {}) {
  if (Array.isArray(row.items)) {
    const items = await priceItems(row.items, () => trm(c.env, row.issue_date ?? before.issue_date));
    row.items = JSON.stringify(items);
    if (items.length) { row.subtotal = items.reduce((t, i) => t + i.total, 0); row.total = row.subtotal + (row.tax ?? before.tax ?? 0); }
  } else if (row.items === null) delete row.items;
}


const TXT = (v) => (v == null ? '' : String(v).trim());
// Contacto de Marketing de la empresa: se enlaza el que ya existe (por nombre o empresa) o se crea. Así el nombre vive en un solo lugar.
async function contactoDe(c, { id, name, email }) {
  let k = id ? await one(c.env, 'SELECT * FROM mk_contacts WHERE id = ? AND business_id = ?', id, c.businessId) : null;
  if (!k && name) k = await one(c.env, 'SELECT * FROM mk_contacts WHERE business_id = ? AND (lower(company) = lower(?) OR lower(name) = lower(?)) ORDER BY id LIMIT 1', c.businessId, name, name);
  if (!k) {
    const t = now();
    const r = await c.env.DB.prepare("INSERT INTO mk_contacts (business_id, name, email, company, stage, source, created_at, updated_at) VALUES (?, ?, ?, ?, 'cliente', 'proyectos', ?, ?)").bind(c.businessId, name, email || null, name, t, t).run();
    return { id: r.meta.last_row_id, name, email: email || null };
  }
  if (email && email !== k.email) { await c.env.DB.prepare('UPDATE mk_contacts SET email = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(email, now(), k.id, c.businessId).run(); k.email = email; }
  return k;
}
// Los datos de la empresa viajan a sus cotizaciones y cuentas de cobro (también a las que ya existen)
async function propagar(c, id) {
  const p = await one(c.env, 'SELECT * FROM pr_projects WHERE id = ? AND business_id = ?', id, c.businessId);
  if (!p) return;
  const v = [p.name, p.tax_id || null, p.client_email || null, p.client_city || null, id, c.businessId], t = now();
  await c.env.DB.prepare('UPDATE pr_quotes SET counterparty = ?, tax_id = ?, client_email = ?, client_city = ?, updated_at = ? WHERE project_id = ? AND business_id = ?').bind(v[0], v[1], v[2], v[3], t, id, c.businessId).run();
  await c.env.DB.prepare("UPDATE fin_invoices SET counterparty = ?, tax_id = ?, client_email = ?, client_city = ? WHERE project_id = ? AND business_id = ? AND kind = 'emitida'").bind(...v).run();
}

export const ENTITIES = {
  projects: { table: 'pr_projects', label: 'el proyecto', title: 'name', search: ['name', 'client', 'tax_id'], order: "CASE status WHEN 'activo' THEN 0 WHEN 'propuesta' THEN 1 ELSE 2 END, id DESC",
    fields: { name: 'text!', client: 'text', tax_id: 'text', client_email: 'text', client_city: 'text', contact_id: 'int', status: ['propuesta', 'activo', 'terminado', 'cancelado'], notes: 'long' },
    async beforeCreate(c, row) {
      row.client = row.name;
      const k = await contactoDe(c, { id: row.contact_id, name: row.name, email: TXT(row.client_email) });
      row.contact_id = k.id; row.client_email ||= k.email || null;
    },
    async beforeUpdate(c, row, before) {
      if ('name' in row) row.client = row.name;
      if (row.client_email) { const k = await contactoDe(c, { id: before.contact_id, name: row.name || before.name, email: TXT(row.client_email) }); row.contact_id ??= k.id; }
    },
    async afterUpdate(c, id) { await propagar(c, id); },
    async decorate(c, rows) {
      const q = await all(c.env, 'SELECT project_id, COUNT(*) n, SUM(total) total FROM pr_quotes WHERE business_id = ? AND project_id IS NOT NULL AND status <> \'rechazada\' GROUP BY project_id', c.businessId);
      const f = await all(c.env, "SELECT project_id, COUNT(*) n, SUM(total) total, SUM(paid) paid FROM fin_invoices WHERE business_id = ? AND project_id IS NOT NULL AND kind = 'emitida' AND status <> 'anulada' GROUP BY project_id", c.businessId);
      return rows.map((r) => { const a = q.find((x) => x.project_id === r.id), b = f.find((x) => x.project_id === r.id); return { ...r, cotizaciones: a?.n || 0, cotizado: a?.total || 0, cobros: b?.n || 0, cobrado: b?.total || 0, pagado: b?.paid || 0 }; });
    } },
  quotes: { table: 'pr_quotes', label: 'la cotización', title: 'number', search: ['number', 'counterparty', 'title', 'tax_id'], order: 'issue_date DESC, id DESC',
    fields: { project_id: 'int', number: 'text', counterparty: 'text!', tax_id: 'text', client_email: 'text', client_city: 'text', title: 'text', concept: 'long', issue_date: 'date!', valid_until: 'date',
      items: 'json', subtotal: 'money', tax: 'money', total: 'money', conditions: 'long', extra: 'long', status: ['borrador', 'enviada', 'aprobada', 'rechazada'], ref: 'text' },
    refs: { project_id: 'pr_projects' },
    async beforeCreate(c, row) {
      if (row.project_id) {
        const p = await one(c.env, 'SELECT * FROM pr_projects WHERE id = ? AND business_id = ?', row.project_id, c.businessId);
        if (p) { row.counterparty = p.name; row.tax_id ||= p.tax_id; row.client_email ||= p.client_email; row.client_city ||= p.client_city; }
      }
      await precio(c, row);
      row.number ||= await numeroCotizacion(c);
      row.valid_until ||= addDays(row.issue_date, 15);
      row.total = row.total || (row.subtotal || 0) + (row.tax || 0);
      if (!(row.total > 0)) throw new HttpError(400, 'La cotización necesita líneas con valor');
    },
    async beforeUpdate(c, row, before) {
      if (before.invoice_id && ('items' in row || 'tax' in row)) throw new HttpError(409, 'Esa cotización ya tiene cuenta de cobro: no se puede cambiar su valor');
      await precio(c, row, before);
    },
    decorate(c, rows) { const t = today(); rows.forEach((r) => { r.vencida = r.status === 'enviada' && r.valid_until && r.valid_until < t ? 1 : 0; }); return rows; } },
};

const api = crud(new Router(), { base: B, modulo: MOD, entities: ENTITIES });
export { api };

// Aprueba la cotización y crea su cuenta de cobro en Finanzas (una sola vez)
export async function cobrarCotizacion(c, id, { fecha, vence, lineas } = {}) {
  const q = await api.get(c, 'quotes', id);
  if (q.invoice_id && await one(c.env, 'SELECT id FROM fin_invoices WHERE id = ? AND business_id = ?', q.invoice_id, c.businessId)) throw new HttpError(409, 'Esa cotización ya tiene su cuenta de cobro');
  if (q.status === 'rechazada') throw new HttpError(409, 'Esa cotización está rechazada');
  let items = []; try { items = JSON.parse(q.items || '[]'); } catch { /* sin líneas */ }
  if (Array.isArray(lineas) && lineas.length) items = items.filter((_, i) => lineas.includes(i));   // cobrar solo algunas líneas (p. ej. un anticipo)
  if (!items.length) throw new HttpError(400, 'Elige al menos una línea para cobrar');
  const r = await fin.create(c, 'invoices', { kind: 'emitida', counterparty: q.counterparty, tax_id: q.tax_id, client_email: q.client_email, client_city: q.client_city, issue_date: fecha || today(), due_date: vence,
    concept: q.title ? `${q.title}, según la cotización ${q.number} aprobada.` : `Según la cotización ${q.number} aprobada.`, items, tax: q.tax || 0, project_id: q.project_id || undefined });
  await c.env.DB.prepare("UPDATE pr_quotes SET status = 'aprobada', invoice_id = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(r.id, now(), id, c.businessId).run();
  const inv = await fin.get(c, 'invoices', r.id);
  await audit(c, `Creó la cuenta de cobro ${inv.number} desde la cotización ${q.number}`, { modulo: MOD });
  return { id: r.id, numero: inv.number, total: inv.total, cotizacion: q.number, proyecto_id: q.project_id || null };
}

export async function resumen(c) {
  const [q, p, cobro] = await Promise.all([
    all(c.env, 'SELECT status, COUNT(*) n, SUM(total) total FROM pr_quotes WHERE business_id = ? GROUP BY status', c.businessId),
    one(c.env, "SELECT COUNT(*) n FROM pr_projects WHERE business_id = ? AND status IN ('propuesta','activo')", c.businessId),
    one(c.env, "SELECT COUNT(*) n, SUM(total - paid) saldo FROM fin_invoices WHERE business_id = ? AND kind = 'emitida' AND project_id IS NOT NULL AND status = 'pendiente'", c.businessId),
  ]);
  const por = (s) => q.find((x) => x.status === s) || { n: 0, total: 0 };
  return { proyectos_abiertos: p?.n || 0, cotizaciones: Object.fromEntries(q.map((x) => [x.status, { cantidad: x.n, total: x.total || 0 }])),
    por_aprobar: { cantidad: por('enviada').n + por('borrador').n, total: por('enviada').total + por('borrador').total }, cuentas_de_cobro_pendientes: { cantidad: cobro?.n || 0, saldo: cobro?.saldo || 0 } };
}

// RUT y certificación bancaria del negocio: se suben una vez (R2) y viajan con el enlace público de cada cotización o cuenta de cobro
export const DOCS = { rut: 'RUT', banco: 'Certificación bancaria' };
const MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], MAX_DOC = 4 * 1024 * 1024;
const aBase64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const documentosDe = (env, org) => all(env, 'SELECT kind, name, mime, size, updated_at FROM pr_docs WHERE business_id = ?', org);
const tipoDoc = (c) => { const k = c.params.kind; if (!DOCS[k]) throw new HttpError(404, 'Documento no válido: rut o banco'); return k; };
async function guardarDoc(c, kind, { nombre, data }) {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m || !MIMES.includes(m[1])) throw new HttpError(400, 'Sube un PDF o una imagen (PNG, JPG o WEBP)');
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  if (bytes.length > MAX_DOC) throw new HttpError(400, 'El archivo pesa más de 4 MB');
  const viejo = await one(c.env, 'SELECT key FROM pr_docs WHERE business_id = ? AND kind = ?', c.businessId, kind);
  const key = `proyectos/${c.businessId}/${kind}-${crypto.randomUUID().slice(0, 8)}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: m[1] } });
  await c.env.DB.prepare('INSERT INTO pr_docs (business_id, kind, name, mime, size, key, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(business_id, kind) DO UPDATE SET name = excluded.name, mime = excluded.mime, size = excluded.size, key = excluded.key, updated_at = excluded.updated_at')
    .bind(c.businessId, kind, String(nombre || DOCS[kind]).slice(0, 120), m[1], bytes.length, key, now()).run();
  if (viejo?.key) await c.env.MEDIA.delete(viejo.key).catch(() => {});
  await audit(c, `Subió el documento ${DOCS[kind]}`, { modulo: MOD });
}
// Archivo para quien recibe el correo: se pide con el código del documento (cotización o cuenta de cobro) del mismo negocio
export async function archivoPublico(env, app, code, kind) {
  const cod = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20), nf = { status: 404 };
  if (cod.length < 8 || !DOCS[kind]) return nf;
  const d = (await env.DB.prepare('SELECT business_id FROM fin_invoices WHERE verify_code = ? AND business_id LIKE ?').bind(cod, `${app}:%`).first())
    || (await env.DB.prepare('SELECT business_id FROM pr_quotes WHERE verify_code = ? AND business_id LIKE ?').bind(cod, `${app}:%`).first());
  if (!d) return nf;
  const f = await env.DB.prepare('SELECT * FROM pr_docs WHERE business_id = ? AND kind = ?').bind(d.business_id, kind).first();
  const o = f ? await env.MEDIA.get(f.key) : null;
  return o ? { status: 200, mime: f.mime, nombre: f.name, bytes: await o.arrayBuffer() } : nf;
}

const fechaLarga = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const cop = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
async function codigoCotizacion(c, q) {
  if (q.verify_code) return q.verify_code;
  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  await c.env.DB.prepare('UPDATE pr_quotes SET verify_code = ? WHERE id = ? AND business_id = ?').bind(code, q.id, c.businessId).run();
  return code;
}
// Borrador del correo (asunto + redacción + enlace público al PDF) de una cotización o una cuenta de cobro
export async function borradorCorreo(c, tipo, id) {
  const perfil = await getProfile(c.env, c.businessId), origin = c.ctx?.origin || c.url.origin;
  let doc, nombre, email, proyecto, asunto, cuerpo, enlace;
  if (tipo === 'cotizacion') {
    const q = await api.get(c, 'quotes', id); doc = q; nombre = q.counterparty; email = q.client_email; proyecto = q.project_id;
    enlace = `${origin}/validar/${await codigoCotizacion(c, q)}/documento`;
    asunto = `Cotización ${q.number}${q.title ? ` · ${q.title}` : ''}`;
    cuerpo = `Hola, equipo de ${nombre},\n\nTe comparto la cotización ${q.number}${q.title ? ` para «${q.title}»` : ''} por ${cop(q.total)} COP, válida hasta el ${fechaLarga(q.valid_until)}.\n\nPuedes verla y descargarla en PDF aquí:\n${enlace}\n\nSi quieres ajustar algo o resolver dudas, con gusto lo revisamos.`;
  } else {
    const inv = await fin.get(c, 'invoices', id); if (!inv || inv.kind !== 'emitida') throw new HttpError(404, 'Cuenta de cobro no encontrada');
    doc = inv; nombre = inv.counterparty; email = inv.client_email; proyecto = inv.project_id;
    enlace = `${origin}/validar/${await verifyCode(c.env, inv)}/documento`;
    asunto = `Cuenta de cobro ${inv.number} · ${nombre}`;
    const pago = [perfil.breb_key && `Bre-B: llave ${perfil.breb_key}`, perfil.account_number && `${perfil.bank || 'Cuenta'} · ${perfil.account_type || 'ahorros'} N.º ${perfil.account_number} a nombre de ${perfil.issuer_name}`].filter(Boolean);
    cuerpo = `Hola, equipo de ${nombre},\n\nTe envío la cuenta de cobro ${inv.number} por ${cop(inv.total)} COP${inv.due_date ? `, para pagar antes del ${fechaLarga(inv.due_date)}` : ''}.\n\nPuedes verla y descargarla en PDF aquí:\n${enlace}\n\n${pago.length ? `Formas de pago:\n${pago.map((x) => `• ${x}`).join('\n')}\n\n` : ''}Cuando hagas el pago, por favor envíame el comprobante por este medio.`;
  }
  const docsOk = await documentosDe(c.env, c.businessId), base = enlace.replace(/\/documento$/, '');
  if (docsOk.length) cuerpo += `\n\nDocumentos para tu proceso:\n${docsOk.map((x) => `• ${DOCS[x.kind]}: ${base}/${x.kind}`).join('\n')}`;
  cuerpo += `\n\nGracias,\n${perfil.issuer_name || perfil.brand || ''}${perfil.phone ? `\n${perfil.phone}` : ''}`;
  let bandejas = [];
  try { bandejas = (await llamar(c, 'GET', '/api/whatsapp/bandejas')).rows.filter((b) => b.canal === 'correo' && b.activo).map((b) => ({ id: b.id, nombre: b.nombre })); } catch { /* Mensajes no activo */ }
  return { tipo, id, docs: docsOk.map((x) => ({ kind: x.kind, nombre: DOCS[x.kind] })), para: email || '', empresa: nombre, proyecto_id: proyecto || null, asunto, mensaje: cuerpo, enlace, bandejas, numero: doc.number };
}
// Manda el correo por Mensajes (queda en sus chats); la cotización pasa a «enviada»
export async function enviarPorCorreo(c, { tipo, id, para, asunto, mensaje, bandeja_id, pdf, incluir }) {
  const b = await borradorCorreo(c, tipo, id);
  if (!b.bandejas.length) throw new HttpError(400, 'Necesitas una bandeja de correo activa en Mensajes (Mensajes → Bandejas)');
  para = TXT(para || b.para).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) throw new HttpError(400, 'Falta un correo válido de la empresa: agrégalo en sus datos');
  const proy = b.proyecto_id ? await one(c.env, 'SELECT * FROM pr_projects WHERE id = ? AND business_id = ?', b.proyecto_id, c.businessId) : null;
  const k = await contactoDe(c, { id: proy?.contact_id, name: b.empresa, email: para });
  if (proy && !proy.contact_id) await c.env.DB.prepare('UPDATE pr_projects SET contact_id = ? WHERE id = ? AND business_id = ?').bind(k.id, proy.id, c.businessId).run();
  // Adjuntos: el PDF del documento (lo arma la pantalla) y, si existen, el RUT y la certificación bancaria subidos
  const adjuntos = [];
  const pm = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(String(pdf?.data || ''));
  if (pm) adjuntos.push({ filename: `${String(pdf.nombre || `${b.numero}.pdf`).replace(/[^\w .()-]/g, '').slice(0, 100) || 'documento'}`.replace(/\.pdf$/i, '') + '.pdf', type: 'application/pdf', content: pm[1] });
  for (const f of await all(c.env, 'SELECT * FROM pr_docs WHERE business_id = ?', c.businessId)) {
    if (Array.isArray(incluir) && !incluir.includes(f.kind)) continue;
    const o = await c.env.MEDIA.get(f.key); if (!o) continue;
    const ext = f.mime === 'application/pdf' ? '.pdf' : f.mime === 'image/png' ? '.png' : f.mime === 'image/webp' ? '.webp' : '.jpg';
    adjuntos.push({ filename: `${DOCS[f.kind]}${ext}`, type: f.mime, content: aBase64(await o.arrayBuffer()) });
  }
  const out = await llamar(c, 'POST', '/api/whatsapp/correo/enviar', { body: { bandeja_id: Number(bandeja_id) || b.bandejas[0].id, asunto: TXT(asunto) || b.asunto, mensaje: TXT(mensaje) || b.mensaje, contactos: [k.id], adjuntos } });
  if (tipo === 'cotizacion') await c.env.DB.prepare("UPDATE pr_quotes SET status = 'enviada', updated_at = ? WHERE id = ? AND business_id = ? AND status = 'borrador'").bind(now(), id, c.businessId).run();
  await audit(c, `Envió por correo ${tipo === 'cotizacion' ? 'la cotización' : 'la cuenta de cobro'} ${b.numero} a ${para}`, { modulo: MOD });
  return { ok: true, para, adjuntos: adjuntos.map((a) => a.filename), ...out };
}
// Página pública /validar/<código>/documento: el PDF de la cotización o cuenta de cobro que se envió por correo
export async function documentoPublico(env, app, code, origin) {
  const cod = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  const H = (type) => ({ 'content-type': type, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' });
  const nf = () => ({ status: 404, headers: H('text/plain; charset=utf-8'), body: 'Documento no encontrado' });
  if (cod.length < 8) return nf();
  const inv = await env.DB.prepare('SELECT * FROM fin_invoices WHERE verify_code = ? AND business_id LIKE ?').bind(cod, `${app}:%`).first();
  const conDocs = async (html, org) => {
    const ds = await documentosDe(env, org); if (!ds.length) return html;
    const bloque = `<style>@media print{.adj{display:none}}.adj{margin-top:16px;border:1px solid #ddd;border-radius:12px;padding:10px 14px;font:13px Inter,sans-serif}.adj a{display:inline-block;margin:4px 8px 0 0;padding:5px 12px;border-radius:999px;background:#1F1A2E;color:#fff;text-decoration:none}</style><div class="adj"><b>Documentos para tu proceso de pago</b><br>${ds.map((x) => `<a href="${origin}/validar/${cod}/${x.kind}" target="_blank" rel="noopener">${DOCS[x.kind]}</a>`).join('')}</div>`;
    return html.replace('<section class="sign">', bloque + '<section class="sign">');
  };
  if (inv) return { status: 200, headers: H('text/html; charset=utf-8'), body: await conDocs(await invoiceDocument(env, inv.business_id, inv, { origin }), inv.business_id) };
  const q = await env.DB.prepare('SELECT * FROM pr_quotes WHERE verify_code = ? AND business_id LIKE ?').bind(cod, `${app}:%`).first();
  if (q) return { status: 200, headers: H('text/html; charset=utf-8'), body: await conDocs(await cotizacionDocument(env, q.business_id, q), q.business_id) };
  return nf();
}

export function routes(r) {
  crud(r, { base: B, modulo: MOD, entities: ENTITIES });
  r.get(`${B}/quotes/:id/pdf`, `tenant:${MOD}`, async (c) => {
    const q = await api.get(c, 'quotes', Number(c.params.id));
    const html = await cotizacionDocument(c.env, c.businessId, q, { autoprint: c.url.searchParams.has('imprimir'), logo: c.ctx?.business?.logo || null });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });

  r.get(`${B}/quotes/:id`, `tenant:${MOD}`, async (c) => json(await api.get(c, 'quotes', Number(c.params.id))));
  r.get(`${B}/documentos`, `tenant:${MOD}`, async (c) => json({ rows: await documentosDe(c.env, c.businessId) }));
  r.get(`${B}/documentos/:kind`, `tenant:${MOD}`, async (c) => {
    const k = tipoDoc(c), f = await one(c.env, 'SELECT * FROM pr_docs WHERE business_id = ? AND kind = ?', c.businessId, k), o = f ? await c.env.MEDIA.get(f.key) : null;
    if (!o) throw new HttpError(404, `Aún no subes tu ${DOCS[k]}`);
    return json({ nombre: f.name, mime: f.mime, data: `data:${f.mime};base64,${aBase64(await o.arrayBuffer())}` });
  });
  r.post(`${B}/documentos/:kind`, `tenant:${MOD}`, async (c) => { await guardarDoc(c, tipoDoc(c), await readJson(c.req)); return json({ ok: true }); });
  r.delete(`${B}/documentos/:kind`, `tenant:${MOD}`, async (c) => {
    const k = tipoDoc(c), f = await one(c.env, 'SELECT key FROM pr_docs WHERE business_id = ? AND kind = ?', c.businessId, k);
    if (f) { await c.env.MEDIA.delete(f.key).catch(() => {}); await c.env.DB.prepare('DELETE FROM pr_docs WHERE business_id = ? AND kind = ?').bind(c.businessId, k).run(); }
    return json({ ok: true });
  });
  r.get(`${B}/contactos`, `tenant:${MOD}`, async (c) => {
    const q = `%${TXT(c.url.searchParams.get('q'))}%`;
    return json({ rows: await all(c.env, 'SELECT id, name, email, company FROM mk_contacts WHERE business_id = ? AND (name LIKE ? OR company LIKE ?) ORDER BY name LIMIT 8', c.businessId, q, q) });
  });
  r.get(`${B}/correo/borrador`, `tenant:${MOD}`, async (c) => {
    const tipo = c.url.searchParams.get('tipo') === 'cuenta' ? 'cuenta' : 'cotizacion';
    return json(await borradorCorreo(c, tipo, Number(c.url.searchParams.get('id'))));
  });
  r.post(`${B}/correo/enviar`, `tenant:${MOD}`, async (c) => json(await enviarPorCorreo(c, await readJson(c.req))));
  r.post(`${B}/quotes/:id/cobrar`, `tenant:${MOD}`, async (c) => json(await cobrarCotizacion(c, Number(c.params.id), await readJson(c.req).catch(() => ({})))));
  r.get(`${B}/projects/:id/detalle`, `tenant:${MOD}`, async (c) => {
    const id = Number(c.params.id), proyecto = await api.get(c, 'projects', id);
    return json({ proyecto,
      cotizaciones: await all(c.env, 'SELECT id, number, title, issue_date, valid_until, total, status, (SELECT f.id FROM fin_invoices f WHERE f.id = pr_quotes.invoice_id AND f.business_id = pr_quotes.business_id) AS invoice_id FROM pr_quotes WHERE business_id = ? AND project_id = ? ORDER BY id DESC', c.businessId, id),
      cuentas_de_cobro: await all(c.env, "SELECT id, number, issue_date, due_date, total, paid, status FROM fin_invoices WHERE business_id = ? AND project_id = ? AND kind = 'emitida' ORDER BY id DESC", c.businessId, id) });
  });
  r.get(`${B}/summary`, `tenant:${MOD}`, async (c) => {
    const s = await resumen(c), n = s.por_aprobar.cantidad;
    return json({ ...s, titulo: 'Proyectos', icono: 'bi-kanban', valor: `${s.proyectos_abiertos} ${s.proyectos_abiertos === 1 ? 'proyecto' : 'proyectos'}`, detalle: n ? `${n} ${n === 1 ? 'cotización' : 'cotizaciones'} por aprobar` : 'Sin cotizaciones pendientes' });
  });
}

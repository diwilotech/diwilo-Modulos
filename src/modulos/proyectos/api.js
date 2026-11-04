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
import { priceItems, invoiceDocument } from '../finanzas/documento.js';

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

export const ENTITIES = {
  projects: { table: 'pr_projects', label: 'el proyecto', title: 'name', search: ['name', 'client', 'tax_id'], order: "CASE status WHEN 'activo' THEN 0 WHEN 'propuesta' THEN 1 ELSE 2 END, id DESC",
    fields: { name: 'text!', client: 'text!', tax_id: 'text', client_email: 'text', client_city: 'text', status: ['propuesta', 'activo', 'terminado', 'cancelado'], notes: 'long' },
    async decorate(c, rows) {
      const q = await all(c.env, 'SELECT project_id, COUNT(*) n, SUM(total) total FROM pr_quotes WHERE business_id = ? AND project_id IS NOT NULL AND status <> \'rechazada\' GROUP BY project_id', c.businessId);
      const f = await all(c.env, "SELECT project_id, COUNT(*) n, SUM(total) total, SUM(paid) paid FROM fin_invoices WHERE business_id = ? AND project_id IS NOT NULL AND kind = 'emitida' AND status <> 'anulada' GROUP BY project_id", c.businessId);
      return rows.map((r) => { const a = q.find((x) => x.project_id === r.id), b = f.find((x) => x.project_id === r.id); return { ...r, cotizaciones: a?.n || 0, cotizado: a?.total || 0, cobros: b?.n || 0, cobrado: b?.total || 0, pagado: b?.paid || 0 }; });
    } },
  quotes: { table: 'pr_quotes', label: 'la cotización', title: 'number', search: ['number', 'counterparty', 'title', 'tax_id'], order: 'issue_date DESC, id DESC',
    fields: { project_id: 'int', number: 'text', counterparty: 'text!', tax_id: 'text', client_email: 'text', client_city: 'text', title: 'text', concept: 'long', issue_date: 'date!', valid_until: 'date',
      items: 'json', subtotal: 'money', tax: 'money', total: 'money', conditions: 'long', status: ['borrador', 'enviada', 'aprobada', 'rechazada'], ref: 'text' },
    refs: { project_id: 'pr_projects' },
    async beforeCreate(c, row) {
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
export async function cobrarCotizacion(c, id, { fecha, vence } = {}) {
  const q = await api.get(c, 'quotes', id);
  if (q.invoice_id) throw new HttpError(409, 'Esa cotización ya tiene su cuenta de cobro');
  if (q.status === 'rechazada') throw new HttpError(409, 'Esa cotización está rechazada');
  let items = []; try { items = JSON.parse(q.items || '[]'); } catch { /* sin líneas */ }
  const r = await fin.create(c, 'invoices', { kind: 'emitida', counterparty: q.counterparty, tax_id: q.tax_id, client_email: q.client_email, client_city: q.client_city, issue_date: fecha || today(), due_date: vence,
    concept: q.title ? `${q.title}, según la cotización ${q.number} aprobada.` : `Según la cotización ${q.number} aprobada.`, items, tax: q.tax || 0, project_id: q.project_id || undefined });
  await c.env.DB.prepare("UPDATE pr_quotes SET status = 'aprobada', invoice_id = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(r.id, now(), id, c.businessId).run();
  const inv = await fin.get(c, 'invoices', r.id);
  await audit(c, `Creó la cuenta de cobro ${inv.number} desde la cotización ${q.number}`, { modulo: MOD });
  return { id: r.id, numero: inv.number, total: inv.total, cotizacion: q.number };
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

export function routes(r) {
  crud(r, { base: B, modulo: MOD, entities: ENTITIES });
  r.get(`${B}/quotes/:id/pdf`, `tenant:${MOD}`, async (c) => {
    const q = await api.get(c, 'quotes', Number(c.params.id));
    const inv = { id: q.id, number: q.number, counterparty: q.counterparty, tax_id: q.tax_id, client_email: q.client_email, client_city: q.client_city, issue_date: q.issue_date, due_date: q.valid_until,
      concept: [q.title, q.concept].filter(Boolean).join('\n\n'), items: q.items, subtotal: q.subtotal, tax: q.tax, total: q.total, status: 'pendiente' };
    const html = await invoiceDocument(c.env, c.businessId, inv, { autoprint: c.url.searchParams.has('imprimir'), origin: c.url.origin, logo: c.ctx?.business?.logo || null, cot: { titulo: 'Cotización', condiciones: q.conditions } });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });
  r.post(`${B}/quotes/:id/cobrar`, `tenant:${MOD}`, async (c) => json(await cobrarCotizacion(c, Number(c.params.id), await readJson(c.req).catch(() => ({})))));
  r.get(`${B}/projects/:id/detalle`, `tenant:${MOD}`, async (c) => {
    const id = Number(c.params.id), proyecto = await api.get(c, 'projects', id);
    return json({ proyecto,
      cotizaciones: await all(c.env, 'SELECT id, number, title, issue_date, valid_until, total, status, invoice_id FROM pr_quotes WHERE business_id = ? AND project_id = ? ORDER BY id DESC', c.businessId, id),
      cuentas_de_cobro: await all(c.env, "SELECT id, number, issue_date, due_date, total, paid, status FROM fin_invoices WHERE business_id = ? AND project_id = ? AND kind = 'emitida' ORDER BY id DESC", c.businessId, id) });
  });
  r.get(`${B}/summary`, `tenant:${MOD}`, async (c) => {
    const s = await resumen(c), n = s.por_aprobar.cantidad;
    return json({ ...s, titulo: 'Proyectos', icono: 'bi-kanban', valor: `${s.proyectos_abiertos} ${s.proyectos_abiertos === 1 ? 'proyecto' : 'proyectos'}`, detalle: n ? `${n} ${n === 1 ? 'cotización' : 'cotizaciones'} por aprobar` : 'Sin cotizaciones pendientes' });
  });
}

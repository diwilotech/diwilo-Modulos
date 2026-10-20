// Finanzas (Finance Hub de Diwilo, por negocio). Ver: administrador y propietario.
//   CRUD   /api/finanzas/{movements|invoices|recurring|cost_centers|budgets|accounts}
//   GET    /api/finanzas/summary?month=AAAA-MM        ingresos, gastos, presupuesto vs real, cartera, flujo de caja, cuentas
//   GET    /api/finanzas/resumen                       widget del dashboard
//   POST   /api/finanzas/invoices/:id/pay              { date, amount, account_id } registra el cobro o pago de una factura
//   GET    /api/finanzas/invoices/:id/pdf              cuenta de cobro lista para imprimir o guardar como PDF
//   GET/PUT /api/finanzas/billing/profile              datos de quien cobra · GET /api/finanzas/billing/fx?date= TRM oficial
//   GET    /api/finanzas/bank-lines?account_id=        extracto importado · POST /api/finanzas/bank-import · POST /api/finanzas/bank-lines/:id/match
//   GET    /api/finanzas/export?kind=movements|invoices&from=&to=   CSV para el contador
//   POST   /api/finanzas/recurring/:id/charges         { dates: [...] } registra cobros ya hechos de un recurrente
//   CRUD   /api/finanzas/reports  ·  GET /api/finanzas/reports/datos?month=   informes del analista (los escribe el asistente por MCP)
//   /validar/:código (público, en el dominio de cada app): validar() de src/index.js usa validatePage
// Tarea diaria: los gastos recurrentes que vencen se registran como gasto (daily).
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, cast, today, now, addDays, addMonths, all, one, DATE, MONTH } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { getProfile, saveProfile, nextNumber, priceItems, invoiceDocument, receiptDocument, pagoDocument } from './documento.js';
export { validatePage } from './documento.js';

const MOD = 'finanzas';
const B = '/api/finanzas';

/* ---------------- dólares: TRM oficial (Banco de la República vía datos.gov.co) ---------------- */
export async function trm(env, date) {
  const d = DATE.test(String(date || '')) ? String(date) : today();
  const hit = await one(env, 'SELECT rate FROM fin_trm WHERE date = ?', d);
  if (hit) return hit.rate;
  try {
    const q = `$where=${encodeURIComponent(`vigenciadesde <= '${d}T00:00:00.000'`)}&$order=${encodeURIComponent('vigenciadesde DESC')}&$limit=1`;
    const r = await fetch(`https://www.datos.gov.co/resource/32sa-8pi3.json?${q}`, { signal: AbortSignal.timeout(8000) });
    const rate = Number((await r.json())?.[0]?.valor);
    if (rate > 1000) {
      if (d < today()) await env.DB.prepare('INSERT OR REPLACE INTO fin_trm (date, rate) VALUES (?, ?)').bind(d, rate).run();
      return rate;
    }
  } catch {}
  const last = await one(env, 'SELECT rate FROM fin_trm ORDER BY date DESC LIMIT 1');
  if (last) return last.rate;
  throw new HttpError(503, 'No pude consultar la TRM oficial. Intenta de nuevo en un momento o escribe el valor en pesos.');
}
// Si el registro está en dólares, calcula el monto en pesos con la TRM de su fecha.
async function applyFx(c, entity, row, before = {}) {
  const cur = row.currency ?? before.currency ?? 'COP';
  if (cur !== 'USD') { if ('currency' in row) { row.amount_usd = null; row.fx_rate = null; } return; }
  const usd = row.amount_usd ?? before.amount_usd;
  if (!(usd > 0)) throw new HttpError(400, 'Escribe el valor en dólares');
  const date = entity === 'movements' ? (row.date ?? before.date) : (row.next_date ?? before.next_date);
  row.fx_rate = await trm(c.env, date);
  row.amount = Math.round(usd * row.fx_rate);
}

/* ---------------- facturas ---------------- */
const invoiceState = (i, t = today()) => (i.status === 'anulada' ? 'anulada' : i.status === 'pagada' ? 'pagada' : i.due_date && i.due_date < t ? 'vencida' : 'pendiente');
// Pagado = suma de los movimientos ligados. Estado: pagada si cubre el total (anulada se respeta).
async function recomputeInvoice(env, biz, invoiceId) {
  const inv = await one(env, 'SELECT total, status FROM fin_invoices WHERE id = ? AND business_id = ?', invoiceId, biz);
  if (!inv) return;
  const s = await one(env, 'SELECT COALESCE(SUM(amount), 0) n FROM fin_movements WHERE invoice_id = ? AND business_id = ?', invoiceId, biz);
  const status = inv.status === 'anulada' ? 'anulada' : s.n >= inv.total && inv.total > 0 ? 'pagada' : 'pendiente';
  await env.DB.prepare('UPDATE fin_invoices SET paid = ?, status = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(s.n, status, now(), invoiceId, biz).run();
}
// Ingresos, gastos y número de movimientos por centro de costo (todo el tiempo). La clave null = movimientos sin centro.
async function totalesPorCentro(env, biz) {
  const rows = await all(env, "SELECT cost_center_id id, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE 0 END) ingresos, SUM(CASE WHEN kind = 'gasto' THEN amount ELSE 0 END) gastos, COUNT(*) movimientos FROM fin_movements WHERE business_id = ? GROUP BY cost_center_id", biz);
  return new Map(rows.map((r) => [r.id, { ingresos: r.ingresos, gastos: r.gastos, movimientos: r.movimientos }]));
}

// Recibos de caja: cada pago recibido de una cuenta por cobrar. Crean su ingreso ligado a la cuenta y llevan su propio consecutivo (RC-0001…).
async function nextReceiptNumber(env, biz) {
  const m = (await one(env, "SELECT COALESCE(MAX(CAST(substr(number, 4) AS INTEGER)), 0) m FROM fin_receipts WHERE business_id = ?", biz)).m;
  return `RC-${String(m + 1).padStart(4, '0')}`;
}
// Archivos de un recibo que llegan de otra app: solo rutas de la propia app (empiezan por «/»), nunca enlaces externos.
const limpiarArchivos = (v) => JSON.stringify((Array.isArray(v) ? v : []).slice(0, 10).map((f) => ({ nombre: String(f?.nombre || 'Archivo').slice(0, 100), url: String(f?.url || '') }))
  .filter((f) => /^\/(?!\/)[\w\-./%?=&]{1,300}$/.test(f.url)));
async function createReceipt(c, { inv = null, date, amount, method = null, accountId = null, counterparty = null, concept = null, notes = null, ref = null, costCenterId = null, files = null }) {
  const t = now(), number = await nextReceiptNumber(c.env, c.businessId);
  const desc = `Recibo de caja ${number}${inv ? ` · cuenta ${inv.number || '#' + inv.id}` : ''}${counterparty ? ` · ${counterparty}` : ''}`.slice(0, 300);
  const mov = await c.env.DB.prepare(`INSERT INTO fin_movements (business_id, kind, date, amount, category, description, counterparty, cost_center_id, account_id, invoice_id, ref, created_at, updated_at)
    VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, date, amount, inv?.category || concept || 'Recibos de caja', desc, counterparty, costCenterId ?? inv?.cost_center_id ?? null, accountId, inv?.id || null, `recibo:${number}`, t, t).run();
  const rc = await c.env.DB.prepare(`INSERT INTO fin_receipts (business_id, number, invoice_id, movement_id, date, amount, method, account_id, counterparty, concept, notes, ref, files, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, number, inv?.id || null, mov.meta.last_row_id, date, amount, method, accountId, counterparty, concept, notes, ref, files, t, t).run();
  if (inv) await recomputeInvoice(c.env, c.businessId, inv.id);
  await audit(c, `Recibo de caja ${number} por $${amount.toLocaleString('es-CO')}${counterparty ? ` de ${counterparty}` : ''}`, { modulo: MOD });
  return { id: rc.meta.last_row_id, number };
}
async function voidReceipt(c, rc) {
  if (rc.voided) return;
  const t = now();
  await c.env.DB.prepare('UPDATE fin_receipts SET voided = 1, updated_at = ? WHERE id = ? AND business_id = ?').bind(t, rc.id, c.businessId).run();
  if (rc.movement_id) {
    await c.env.DB.prepare('UPDATE fin_bank_lines SET movement_id = NULL WHERE movement_id = ? AND business_id = ?').bind(rc.movement_id, c.businessId).run();
    await c.env.DB.prepare('DELETE FROM fin_movements WHERE id = ? AND business_id = ?').bind(rc.movement_id, c.businessId).run();
  }
  if (rc.invoice_id) await recomputeInvoice(c.env, c.businessId, rc.invoice_id);
  await audit(c, `Anuló el recibo de caja ${rc.number}`, { modulo: MOD });
}

// Cuentas de cobro con líneas: el total sale de las líneas (las de dólares, con la TRM de la fecha) y las emitidas reciben consecutivo
async function priceInvoice(c, row, before, creating) {
  if (Array.isArray(row.items)) {
    const items = await priceItems(row.items, () => trm(c.env, row.issue_date ?? before.issue_date));
    row.items = JSON.stringify(items);
    if (items.length) { row.subtotal = items.reduce((t, i) => t + i.total, 0); row.total = row.subtotal + (row.tax ?? before.tax ?? 0); }
  } else if (row.items === null) delete row.items;
  if (creating && (row.kind || 'emitida') === 'emitida' && !row.number) row.number = await nextNumber(c.env, c.businessId);
}

/* ---------------- entidades ---------------- */
const parseFiles = (t) => { try { const a = JSON.parse(t || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
export const ENTITIES = {
  movements: { table: 'fin_movements', label: 'el movimiento', title: 'description', search: ['description', 'counterparty', 'category'], order: 'date DESC, id DESC',
    fields: { kind: ['ingreso', 'gasto'], date: 'date!', currency: ['COP', 'USD'], amount_usd: 'usd', amount: 'money!', fx_rate: 'num', category: 'text', description: 'text', counterparty: 'text', tax_id: 'text', cost_center_id: 'int', account_id: 'int', invoice_id: 'int', reconciled: 'bool' },
    async beforeCreate(c, row, body) { if (row.currency === 'USD') await applyFx(c, 'movements', row); },
    async afterCreate(c, id, row) { if (row.invoice_id) await recomputeInvoice(c.env, c.businessId, row.invoice_id); },
    async beforeUpdate(c, row, before) { if (['currency', 'amount_usd', 'date'].some((k) => k in row)) await applyFx(c, 'movements', row, before); },
    async afterUpdate(c, id, row, before) { for (const inv of new Set([before.invoice_id, row.invoice_id].filter(Boolean))) await recomputeInvoice(c.env, c.businessId, inv); },
    // Cada movimiento que viene de un recibo de caja lo trae (número y archivos) para verlo desde Movimientos.
    async decorate(c, rows) {
      const ids = rows.map((r) => r.id);
      if (!ids.length) return rows;
      const rc = await all(c.env, `SELECT id, number, movement_id, files, voided FROM fin_receipts WHERE business_id = ? AND movement_id IN (${ids.map(() => '?').join(',')})`, c.businessId, ...ids);
      rows.forEach((r) => { const x = rc.find((y) => y.movement_id === r.id); if (x) { r.receipt_id = x.id; r.receipt_number = x.number; r.receipt_files = parseFiles(x.files); } });
      // Los pagos armados en «Pagos del mes» traen su documento (total con sus ítems, nombre y cédula)
      const planes = await all(c.env, 'SELECT month, tipo, key, recurring_id, tax_id, items FROM fin_pagos_plan WHERE business_id = ?', c.businessId);
      for (const r of rows) {
        const m = /^pago:(nomina|servicios):(\d{4}-\d{2}):([^:]+):\d+$/.exec(r.ref || '');
        const pl = m ? planes.find((x) => x.tipo === m[1] && x.month === m[2] && x.key.replace(/[^\w.-]/g, '_').slice(0, 60) === m[3]) : r.recurring_id ? planes.find((x) => x.recurring_id === r.recurring_id && x.month === String(r.date).slice(0, 7)) : null;
        if (pl) { r.pago_doc = { tipo: pl.tipo, month: pl.month, key: pl.key, items: parseFiles(pl.items).length }; if (!r.tax_id) r.tax_id = pl.tax_id || null; }
      }
      return rows;
    },
    async afterDelete(c, before) {
      if (before.invoice_id) await recomputeInvoice(c.env, c.businessId, before.invoice_id);
      await c.env.DB.prepare('UPDATE fin_bank_lines SET movement_id = NULL WHERE movement_id = ? AND business_id = ?').bind(before.id, c.businessId).run();
    } },
  invoices: { table: 'fin_invoices', label: 'la factura', title: 'number', search: ['number', 'counterparty', 'tax_id'], order: 'issue_date DESC, id DESC',
    fields: { kind: ['emitida', 'recibida'], number: 'text', counterparty: 'text!', tax_id: 'text', client_email: 'text', client_city: 'text', issue_date: 'date!', due_date: 'date', concept: 'long', items: 'json',
      subtotal: 'money', tax: 'money', total: 'money', status: ['pendiente', 'pagada', 'anulada'], cost_center_id: 'int', category: 'text', notes: 'long' },
    async beforeCreate(c, row) {
      await priceInvoice(c, row, {}, true);
      row.total = row.total || (row.subtotal || 0) + (row.tax || 0);
      if (!(row.total > 0)) throw new HttpError(400, 'La factura necesita un total (o líneas con valor)');
    },
    async beforeUpdate(c, row, before) { await priceInvoice(c, row, before, false); },
    async afterUpdate(c, id) { await recomputeInvoice(c.env, c.businessId, id); },
    decorate(c, rows) { const t = today(); rows.forEach((r) => { r.state = invoiceState(r, t); }); return rows; } },
  recurring: { table: 'fin_recurring', label: 'el gasto recurrente', title: 'name', search: ['name', 'vendor'], order: 'active DESC, next_date',
    fields: { name: 'text!', vendor: 'text', category: ['infraestructura', 'software', 'api', 'ia', 'marketing', 'nomina', 'otro'], currency: ['COP', 'USD'], tax_id: 'text', url: 'text', amount_usd: 'usd', amount: 'money!', fx_rate: 'num', cycle: ['mensual', 'anual', 'quincenal', 'semanal'], next_date: 'date!', cost_center_id: 'int', account_id: 'int', active: 'bool+', notes: 'long' },
    async beforeCreate(c, row) { if (row.currency === 'USD') await applyFx(c, 'recurring', row); },
    async beforeUpdate(c, row, before) { if (['currency', 'amount_usd', 'next_date'].some((k) => k in row)) await applyFx(c, 'recurring', row, before); } },
  reports: { table: 'fin_reports', label: 'el informe', title: 'title', search: ['title', 'content'], order: 'created_at DESC', crear: 'manager',
    fields: { title: 'text!', content: 'long!', origen: ['manual', 'ia'] } },
  cost_centers: { table: 'fin_cost_centers', label: 'el centro de costo', title: 'name', search: ['name', 'code'], order: 'active DESC, kind, name',
    fields: { name: 'text!', kind: ['proyecto', 'app', 'cliente', 'departamento'], code: 'text', active: 'bool+', notes: 'long' },
    // Total acumulado de cada centro: lo que ha entrado, lo que ha salido y lo que deja.
    async decorate(c, rows) {
      const t = await totalesPorCentro(c.env, c.businessId);
      return rows.map((r) => { const x = t.get(r.id) || { ingresos: 0, gastos: 0, movimientos: 0 }; return { ...r, ...x, resultado: x.ingresos - x.gastos }; });
    } },
  accounts: { table: 'fin_accounts', label: 'la cuenta', title: 'name', search: ['name', 'bank'], order: 'name',
    fields: { name: 'text!', kind: ['banco', 'efectivo', 'tarjeta', 'billetera'], bank: 'text', last4: 'text', opening_balance: 'money' },
    // Saldo según los registros (saldo inicial + ingresos − gastos de la cuenta) y cuánto falta por conciliar
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const mes1 = `${today().slice(0, 7)}-01`, mesSig = addMonths(mes1, 1);
      const m = await all(c.env, `SELECT account_id id, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) n, COUNT(*) total, SUM(reconciled = 0) sin, COALESCE(SUM(CASE WHEN reconciled = 0 THEN (CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) END), 0) valor_sin, COALESCE(SUM(CASE WHEN date < ? THEN (CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) END), 0) antes, COALESCE(SUM(CASE WHEN date >= ? AND date < ? THEN (CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) END), 0) del_mes FROM fin_movements WHERE business_id = ? AND account_id IS NOT NULL GROUP BY account_id`, mes1, mes1, mesSig, c.businessId);
      const l = await all(c.env, 'SELECT account_id id, COUNT(*) n FROM fin_bank_lines WHERE business_id = ? AND movement_id IS NULL GROUP BY account_id', c.businessId);
      rows.forEach((r) => { const x = m.find((y) => y.id === r.id); r.balance = (r.opening_balance || 0) + (x?.n || 0); r.movimientos = x?.total || 0; r.sin_conciliar = x?.sin || 0; r.valor_sin_conciliar = x?.valor_sin || 0; r.saldo_mes_anterior = (r.opening_balance || 0) + (x?.antes || 0); r.movimiento_mes = x?.del_mes || 0; r.lineas_sin_conciliar = l.find((y) => y.id === r.id)?.n || 0; });
      return rows;
    } },
  budgets: { table: 'fin_budgets', label: 'el presupuesto', title: 'month', search: ['category'], order: 'month DESC, id DESC',
    fields: { month: 'month!', cost_center_id: 'int', category: 'text', amount: 'money!' } },
};
// Los valores en USD llegan sin monto en pesos: se pone uno provisional que la TRM reemplaza.
const usdBody = (body) => (body.currency === 'USD' && !body.amount ? { ...body, amount: 1 } : body);
ENTITIES.movements.prepareBody = usdBody;
ENTITIES.recurring.prepareBody = usdBody;
// Referencias: cuentas, centros de costo y facturas del mismo negocio.
const CC = { cost_center_id: 'fin_cost_centers' };
ENTITIES.movements.refs = { ...CC, account_id: 'fin_accounts', invoice_id: 'fin_invoices' };
ENTITIES.invoices.refs = CC;
ENTITIES.recurring.refs = { ...CC, account_id: 'fin_accounts' };
ENTITIES.budgets.refs = CC;

/* ---------------- resumen ---------------- */
export async function financeSummary(c, monthParam) {
  const biz = c.businessId, env = c.env;
  const month = MONTH.test(monthParam || '') ? monthParam : today().slice(0, 7);
  const t = today(), first = `${month}-01`, next = addMonths(first, 1);
  const [mov, byCat, byCc, budgets, invoices, recurring, accounts, accMov, unrec, ccs] = await Promise.all([
    one(env, "SELECT COALESCE(SUM(CASE WHEN kind = 'ingreso' THEN amount END), 0) income, COALESCE(SUM(CASE WHEN kind = 'gasto' THEN amount END), 0) expense FROM fin_movements WHERE business_id = ? AND date >= ? AND date < ?", biz, first, next),
    all(env, "SELECT kind, COALESCE(NULLIF(category, ''), 'Sin categoría') k, SUM(amount) n FROM fin_movements WHERE business_id = ? AND date >= ? AND date < ? GROUP BY kind, k ORDER BY n DESC", biz, first, next),
    all(env, "SELECT cost_center_id id, SUM(CASE WHEN kind = 'gasto' THEN amount ELSE 0 END) expense, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE 0 END) income FROM fin_movements WHERE business_id = ? AND date >= ? AND date < ? GROUP BY cost_center_id", biz, first, next),
    all(env, 'SELECT cost_center_id id, category, SUM(amount) amount FROM fin_budgets WHERE business_id = ? AND month = ? GROUP BY cost_center_id, category', biz, month),
    all(env, "SELECT id, kind, number, counterparty, issue_date, due_date, total, paid, status FROM fin_invoices WHERE business_id = ? AND status <> 'anulada' AND status <> 'pagada'", biz),
    all(env, 'SELECT id, name, category, amount, cycle, next_date FROM fin_recurring WHERE business_id = ? AND active = 1', biz),
    all(env, 'SELECT id, name, kind, opening_balance FROM fin_accounts WHERE business_id = ?', biz),
    all(env, "SELECT account_id id, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) n FROM fin_movements WHERE business_id = ? AND account_id IS NOT NULL GROUP BY account_id", biz),
    one(env, 'SELECT COUNT(*) n FROM fin_bank_lines WHERE business_id = ? AND movement_id IS NULL', biz),
    all(env, 'SELECT id, name, kind FROM fin_cost_centers WHERE business_id = ?', biz),
  ]);
  const aging = (kind) => {
    const out = { total: 0, overdue: 0, buckets: { al_dia: 0, d30: 0, d60: 0, d90: 0, mas90: 0 }, items: [] };
    for (const i of invoices.filter((x) => x.kind === kind)) {
      const due = i.total - i.paid; if (due <= 0) continue;
      const late = i.due_date && i.due_date < t ? Math.round((Date.parse(t) - Date.parse(i.due_date)) / 86400000) : 0;
      out.total += due; if (late > 0) out.overdue += due;
      out.buckets[late <= 0 ? 'al_dia' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'mas90'] += due;
      out.items.push({ ...i, due, late, state: invoiceState(i, t) });
    }
    out.items.sort((a, b) => b.late - a.late || b.due - a.due);
    out.items = out.items.slice(0, 8);
    return out;
  };
  // Flujo de caja: 6 meses reales + 3 proyectados (recurrentes + facturas por vencer)
  const curFirst = `${t.slice(0, 7)}-01`;
  const past = await all(env, "SELECT substr(date, 1, 7) m, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE 0 END) income, SUM(CASE WHEN kind = 'gasto' THEN amount ELSE 0 END) expense FROM fin_movements WHERE business_id = ? AND date >= ? GROUP BY m", biz, addMonths(curFirst, -5));
  const flow = [];
  for (let k = -5; k <= 3; k++) {
    const m = addMonths(curFirst, k).slice(0, 7);
    const real = past.find((p) => p.m === m);
    const row = { month: m, income: real?.income || 0, expense: real?.expense || 0, projected: k > 0 };
    if (k >= 0) {
      const mFirst = `${m}-01`, mNext = addMonths(mFirst, 1);
      for (const r of recurring) {
        let d = r.next_date, guard = 0;
        while (d < mNext && guard++ < 40) { if (d >= mFirst && (k > 0 || d >= t)) row.expense += r.amount; d = siguienteCobro(d, r.cycle); }
      }
      for (const i of invoices) {
        const due = i.total - i.paid; if (due <= 0 || !i.due_date) continue;
        if (i.due_date >= mFirst && i.due_date < mNext && (k > 0 || i.due_date >= t)) row[i.kind === 'emitida' ? 'income' : 'expense'] += due;
      }
      if (k === 0) row.partial = true;
    }
    row.net = row.income - row.expense;
    flow.push(row);
  }
  const ccName = Object.fromEntries(ccs.map((x) => [x.id, x.name]));
  const centers = {};
  for (const r of byCc) centers[r.id ?? 0] = { id: r.id, name: r.id ? ccName[r.id] || `#${r.id}` : 'Sin centro de costo', expense: r.expense, income: r.income, budget: 0 };
  for (const b of budgets) { const k = b.id ?? 0; centers[k] ||= { id: b.id, name: b.id ? ccName[b.id] || `#${b.id}` : 'General', expense: 0, income: 0, budget: 0 }; centers[k].budget += b.amount; }
  const recurringMonthly = {};
  for (const r of recurring) recurringMonthly[r.category] = (recurringMonthly[r.category] || 0) + aMes(r);
  const bal = Object.fromEntries(accMov.map((a) => [a.id, a.n]));
  return {
    month, today: t,
    totals: { income: mov.income, expense: mov.expense, net: mov.income - mov.expense, budget: budgets.reduce((n, b) => n + b.amount, 0) },
    expense_by_category: byCat.filter((r) => r.kind === 'gasto').map(({ k, n }) => ({ k, n })),
    income_by_category: byCat.filter((r) => r.kind === 'ingreso').map(({ k, n }) => ({ k, n })),
    cost_centers: Object.values(centers).sort((a, b) => b.expense - a.expense),
    receivable: aging('emitida'), payable: aging('recibida'),
    cash_flow: flow, recurring_monthly: recurringMonthly,
    recurring_total: Object.values(recurringMonthly).reduce((a, b) => a + b, 0),
    accounts: accounts.map((a) => ({ ...a, balance: a.opening_balance + (bal[a.id] || 0) })),
    bank_pending: unrec.n,
  };
}

/* ---------------- banco: importar extracto y conciliar ---------------- */
async function link(c, lineId, movementId, accountId) {
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE fin_bank_lines SET movement_id = ? WHERE id = ? AND business_id = ?').bind(movementId, lineId, c.businessId),
    c.env.DB.prepare('UPDATE fin_movements SET reconciled = 1, account_id = COALESCE(account_id, ?), updated_at = ? WHERE id = ? AND business_id = ?').bind(accountId, now(), movementId, c.businessId),
  ]);
}
// Concilia solo lo inequívoco: mismo valor, mismo sentido, ±3 días y un único movimiento candidato.
async function autoMatch(c, accountId) {
  const lines = await all(c.env, 'SELECT * FROM fin_bank_lines WHERE business_id = ? AND account_id = ? AND movement_id IS NULL', c.businessId, accountId);
  let matched = 0;
  for (const l of lines) {
    const cands = await all(c.env, `SELECT id FROM fin_movements WHERE business_id = ? AND reconciled = 0 AND kind = ? AND amount = ? AND date BETWEEN ? AND ?
      AND (account_id IS NULL OR account_id = ?)`, c.businessId, l.amount > 0 ? 'ingreso' : 'gasto', Math.abs(l.amount), addDays(l.date, -3), addDays(l.date, 3), accountId);
    if (cands.length !== 1) continue;
    await link(c, l.id, cands[0].id, accountId);
    matched++;
  }
  return matched;
}

/* ---------------- gastos recurrentes ---------------- */
// Siguiente fecha de cobro de un gasto recurrente: mensual, anual, quincenal (15 y fin de mes) o semanal (cada 7 días).
export function siguienteCobro(date, ciclo) {
  if (ciclo === 'anual') return addMonths(date, 12);
  if (ciclo === 'semanal') return addDays(date, 7);
  if (ciclo === 'quincenal') { const d = Number(String(date).slice(8)); return d < 15 ? `${String(date).slice(0, 7)}-15` : d === 15 ? addDays(addMonths(`${String(date).slice(0, 7)}-01`, 1), -1) : `${addMonths(`${String(date).slice(0, 7)}-01`, 1).slice(0, 7)}-15`; }
  return addMonths(date, 1);
}
const aMes = (r) => (r.cycle === 'anual' ? Math.round(r.amount / 12) : r.cycle === 'semanal' ? Math.round(r.amount * 4.33) : r.cycle === 'quincenal' ? r.amount * 2 : r.amount);
// `o` (pago manual): periodo (fecha de vencimiento que se paga; evita duplicar), amount (COP), vendor, accountId.
export async function chargeRecurring(env, r, d, o = {}) {
  const manual = o.amount > 0, usd = !manual && r.currency === 'USD' && r.amount_usd > 0, rate = usd ? await trm(env, d).catch(() => r.fx_rate || null) : null;
  const t = now();
  return env.DB.prepare(`INSERT OR IGNORE INTO fin_movements (business_id, kind, date, amount, currency, amount_usd, fx_rate, category, description, counterparty, tax_id, cost_center_id, account_id, recurring_id, ref, created_at, updated_at)
    VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.business_id, d, manual ? o.amount : usd && rate ? Math.round(r.amount_usd * rate) : r.amount, usd ? 'USD' : 'COP', usd ? r.amount_usd : null, rate,
    o.category ?? r.category, r.name, o.vendor ?? r.vendor, o.taxId ?? r.tax_id ?? null, o.costCenterId === undefined ? r.cost_center_id : o.costCenterId, o.accountId ?? r.account_id, r.id, `rec:${r.id}:${o.periodo || d}`, t, t).run();
}
// Tarea diaria: los recurrentes que vencen se registran como gasto y la fecha pasa al siguiente cobro.
export async function daily(env) {
  const t = today();
  const due = await all(env, 'SELECT * FROM fin_recurring WHERE active = 1 AND ref IS NULL AND next_date <= ?', t);
  for (const r of due) {
    let d = r.next_date, guard = 0;
    while (d <= t && guard++ < 24) { await chargeRecurring(env, r, d); d = siguienteCobro(d, r.cycle); }
    await env.DB.prepare('UPDATE fin_recurring SET next_date = ?, updated_at = ? WHERE id = ?').bind(d, now(), r.id).run();
  }
  return due.length;
}

/* ---------------- exportar para el contador ---------------- */
const csvCell = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Informe del analista de finanzas: la instrucción es la misma de Diwilo; lo escribe el asistente del negocio.
export async function reportData(c, month) {
  const name = (await one(c.env, 'SELECT name FROM orgs WHERE id = ?', c.businessId))?.name || 'el negocio';
  return { instruccion: `Eres el analista de finanzas de ${name}. Escribe en español de Colombia un informe breve para el dueño:
1) qué pasó (con cifras en pesos colombianos), 2) qué preocupa, 3) tres acciones concretas para esta semana.
Usa solo los datos que te doy; si faltan datos, dilo y sugiere qué registrar. Máximo 220 palabras, con títulos cortos y viñetas.`, datos: await financeSummary(c, month) };
}

export function routes(r) {
  // Movimientos que llegan de otro sistema (pagos de suscripciones, cuotas de una app…): no se duplican por `ref`.
  //   POST /api/finanzas/movements/externo { ref, kind, date, amount, category?, description?, counterparty?, centro_costo? (nombre; se crea si no existe) }
  r.post(`${B}/movements/externo`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), ref = String(b.ref || '').slice(0, 120);
    if (!ref) throw new HttpError(400, 'Falta ref');
    const prev = await one(c.env, 'SELECT id FROM fin_movements WHERE business_id = ? AND ref = ?', c.businessId, ref);
    if (prev) return json({ id: prev.id, nuevo: false });
    // Anulación: el cobro original deja de contar en su cuenta de cobro (el movimiento de reverso queda en libros).
    if (b.anula_ref) {
      const orig = await one(c.env, 'SELECT id, invoice_id FROM fin_movements WHERE business_id = ? AND ref = ?', c.businessId, String(b.anula_ref).slice(0, 120));
      if (orig?.invoice_id) { await c.env.DB.prepare('UPDATE fin_movements SET invoice_id = NULL, updated_at = ? WHERE id = ? AND business_id = ?').bind(now(), orig.id, c.businessId).run(); await recomputeInvoice(c.env, c.businessId, orig.invoice_id); }
    }
    const inv = b.invoice_ref ? await one(c.env, 'SELECT id FROM fin_invoices WHERE business_id = ? AND ref = ?', c.businessId, String(b.invoice_ref).slice(0, 120)) : null;
    const kind = b.kind === 'gasto' ? 'gasto' : 'ingreso', amount = cast('valor', 'money!', b.amount), date = cast('fecha', 'date', b.date) || today();
    let cc = null;
    if (b.centro_costo) {
      const name = String(b.centro_costo).slice(0, 120);
      cc = (await one(c.env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(name) = lower(?)', c.businessId, name))?.id;
      if (!cc) { const t0 = now(); cc = (await c.env.DB.prepare("INSERT INTO fin_cost_centers (business_id, name, kind, active, created_at, updated_at) VALUES (?, ?, 'app', 1, ?, ?)").bind(c.businessId, name, t0, t0).run()).meta.last_row_id; }
    }
    const t = now();
    const res = await c.env.DB.prepare(`INSERT OR IGNORE INTO fin_movements (business_id, kind, date, amount, category, description, counterparty, cost_center_id, ref, invoice_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(c.businessId, kind, date, amount, b.category ? String(b.category).slice(0, 120) : null, b.description ? String(b.description).slice(0, 300) : null, b.counterparty ? String(b.counterparty).slice(0, 200) : null, cc, ref, inv?.id || null, t, t).run();
    if (res.meta.changes && inv) await recomputeInvoice(c.env, c.businessId, inv.id);
    if (res.meta.changes) await audit(c, `Registró ${kind === 'ingreso' ? 'el ingreso' : 'el gasto'} «${String(b.description || ref).slice(0, 60)}» por $${amount.toLocaleString('es-CO')}`, { modulo: MOD });
    return json({ id: res.meta.last_row_id, nuevo: !!res.meta.changes }, res.meta.changes ? 201 : 200);
  });
  // Cuenta de cobro que crea otra app (una por matrícula, por ejemplo). Se identifica por `ref`: si ya existe se actualiza (mientras no esté anulada).
  //   POST /api/finanzas/invoices/externo { ref, update?: true (reescribe una existente; por defecto queda igual), counterparty, tax_id?, client_email?, issue_date?, due_date?, concept, detail?, items?: [{concepto, detalle?, valor}], total, category?, centro_costo? }
  r.post(`${B}/invoices/externo`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), ref = String(b.ref || '').slice(0, 120);
    if (!ref) throw new HttpError(400, 'Falta ref');
    const total = cast('total', 'money!', b.total);
    if (total <= 0) throw new HttpError(400, 'El total debe ser mayor que cero');
    const counterparty = String(b.counterparty || '').trim().slice(0, 200);
    if (!counterparty) throw new HttpError(400, 'Falta quién paga');
    const concept = String(b.concept || 'Servicio').slice(0, 300), issue = cast('fecha', 'date', b.issue_date) || today(), due = cast('vence', 'date', b.due_date) || null;
    // `items` opcional (p. ej. una línea por cuota): deben sumar el total; si no, queda una sola línea con el concepto.
    const lineas = (Array.isArray(b.items) ? b.items : []).slice(0, 40).map((i) => { const v = Math.round(Number(i.valor) || 0); return { concepto: String(i.concepto || '').slice(0, 300), detalle: i.detalle ? String(i.detalle).slice(0, 300) : undefined, cantidad: 1, moneda: 'COP', valor: v, total: v }; }).filter((i) => i.concepto);
    const items = JSON.stringify(lineas.length && lineas.reduce((a, i) => a + i.total, 0) === total ? lineas : [{ concepto: concept, detalle: b.detail ? String(b.detail).slice(0, 300) : undefined, cantidad: 1, moneda: 'COP', valor: total, total }]);
    let cc = null;
    if (b.centro_costo) {
      const name = String(b.centro_costo).slice(0, 120);
      cc = (await one(c.env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(name) = lower(?)', c.businessId, name))?.id;
      if (!cc) { const t0 = now(); cc = (await c.env.DB.prepare("INSERT INTO fin_cost_centers (business_id, name, kind, active, created_at, updated_at) VALUES (?, ?, 'app', 1, ?, ?)").bind(c.businessId, name, t0, t0).run()).meta.last_row_id; }
    }
    const taxId = b.tax_id ? String(b.tax_id).slice(0, 60) : null, email = b.client_email ? String(b.client_email).slice(0, 200) : null, category = b.category ? String(b.category).slice(0, 120) : 'Matrículas';
    const prev = await one(c.env, 'SELECT id, number, status FROM fin_invoices WHERE business_id = ? AND ref = ?', c.businessId, ref);
    const t = now();
    // La cuenta de cobro queda como se emitió: solo se reescribe si la app lo pide (`update: true`).
    if (prev) {
      if (prev.status !== 'anulada' && b.update === true) {
        await c.env.DB.prepare('UPDATE fin_invoices SET counterparty = ?, tax_id = ?, client_email = ?, due_date = ?, concept = ?, items = ?, subtotal = ?, total = ?, cost_center_id = ?, category = ?, updated_at = ? WHERE id = ? AND business_id = ?')
          .bind(counterparty, taxId, email, due, concept, items, total, total, cc, category, t, prev.id, c.businessId).run();
        await recomputeInvoice(c.env, c.businessId, prev.id);
      }
      return json({ id: prev.id, number: prev.number, nuevo: false });
    }
    const number = await nextNumber(c.env, c.businessId);
    const res = await c.env.DB.prepare(`INSERT INTO fin_invoices (business_id, kind, number, counterparty, tax_id, client_email, issue_date, due_date, concept, items, subtotal, tax, total, paid, status, cost_center_id, category, ref, created_at, updated_at)
      VALUES (?, 'emitida', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 'pendiente', ?, ?, ?, ?, ?)`).bind(c.businessId, number, counterparty, taxId, email, issue, due, concept, items, total, total, cc, category, ref, t, t).run();
    await audit(c, `Creó la cuenta de cobro ${number} para ${counterparty} por $${total.toLocaleString('es-CO')}`, { modulo: MOD });
    return json({ id: res.meta.last_row_id, number, nuevo: true }, 201);
  });

  // Totales de todos los centros de costo (y de lo que no tiene centro) para el resumen de la vista.
  r.get(`${B}/cost_centers/totales`, `tenant:${MOD}`, async (c) => {
    const t = await totalesPorCentro(c.env, c.businessId), sin = t.get(null) || { ingresos: 0, gastos: 0, movimientos: 0 };
    let ingresos = 0, gastos = 0; for (const x of t.values()) { ingresos += x.ingresos; gastos += x.gastos; }
    return json({ ingresos, gastos, resultado: ingresos - gastos, sin_centro: { ...sin, resultado: sin.ingresos - sin.gastos } });
  });

  // ---- Recibos de caja ----
  //   GET  /api/finanzas/invoices/:id/receipts         los recibos de una cuenta por cobrar
  //   POST /api/finanzas/invoices/:id/receipts         { date, amount, method?, account_id?, notes? }  (igual a /pay)
  //   GET  /api/finanzas/receipts?q=&limit=            lista de recibos
  //   POST /api/finanzas/receipts/:id/void             anula el recibo (el ingreso desaparece y la cuenta vuelve a deber)
  //   GET  /api/finanzas/receipts/:id/pdf              recibo de caja para imprimir
  //   POST /api/finanzas/receipts/externo              { ref, invoice_ref?, date?, amount, method?, concept?, counterparty?, centro_costo?, notes?, files?: [{ nombre, url }] }  de otras apps (no duplica por ref)
  //   POST /api/finanzas/receipts/externo/void         { ref }
  r.get(`${B}/invoices/:id/receipts`, `tenant:${MOD}`, async (c) => {
    if (!(await one(c.env, 'SELECT id FROM fin_invoices WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId))) throw new HttpError(404, 'No encontrada');
    return json({ rows: await all(c.env, 'SELECT * FROM fin_receipts WHERE business_id = ? AND invoice_id = ? ORDER BY id DESC', c.businessId, Number(c.params.id)) });
  });
  r.post(`${B}/invoices/:id/receipts`, `tenant:${MOD}`, async (c) => {
    const inv = await one(c.env, 'SELECT * FROM fin_invoices WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!inv) throw new HttpError(404, 'No encontrada');
    if (inv.kind !== 'emitida') throw new HttpError(400, 'Los recibos de caja son de las cuentas por cobrar');
    if (inv.status === 'anulada') throw new HttpError(409, 'La cuenta de cobro está anulada');
    const b = await readJson(c.req), amount = cast('monto', 'money!', b.amount ?? inv.total - inv.paid);
    if (amount <= 0) throw new HttpError(400, 'El monto debe ser mayor que cero');
    if (amount > inv.total - inv.paid) throw new HttpError(400, `El recibo supera el saldo (${'$' + Math.max(0, inv.total - inv.paid).toLocaleString('es-CO')})`);
    const accountId = cast('cuenta', 'int', b.account_id);
    if (accountId) await api.get(c, 'accounts', accountId);
    const rc = await createReceipt(c, { inv, date: cast('fecha', 'date', b.date) || today(), amount, method: b.method ? String(b.method).slice(0, 40) : null, accountId, counterparty: inv.counterparty,
      concept: `Abono a la cuenta de cobro ${inv.number || '#' + inv.id}`, notes: b.notes ? String(b.notes).slice(0, 300) : null });
    return json({ ok: true, receipt: rc }, 201);
  });
  // Recibo de caja suelto: sin cuenta por cobrar (para quien no cobra con cuentas de cobro).
  r.post(`${B}/receipts`, `tenant:${MOD}`, async (c) => {
    const b = await readJson(c.req), amount = cast('valor', 'money!', b.amount);
    if (amount <= 0) throw new HttpError(400, 'El valor debe ser mayor que cero');
    const accountId = cast('cuenta', 'int', b.account_id), ccId = cast('centro de costo', 'int', b.cost_center_id);
    if (accountId) await api.get(c, 'accounts', accountId);
    if (ccId) await api.get(c, 'cost_centers', ccId);
    const counterparty = String(b.counterparty || '').trim().slice(0, 200);
    if (!counterparty) throw new HttpError(400, 'Escribe de quién se recibe el pago');
    const rc = await createReceipt(c, { date: cast('fecha', 'date', b.date) || today(), amount, method: b.method ? String(b.method).slice(0, 40) : null, accountId, counterparty,
      concept: String(b.concept || 'Pago recibido').slice(0, 300), notes: b.notes ? String(b.notes).slice(0, 300) : null, costCenterId: ccId });
    return json({ ok: true, receipt: rc }, 201);
  });
  // Una cuenta con todo lo suyo: sus pagos (recibos con sus archivos) o, si es por pagar, los pagos registrados.
  r.get(`${B}/invoices/:id/detalle`, `tenant:${MOD}`, async (c) => {
    const inv = await one(c.env, 'SELECT * FROM fin_invoices WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!inv) throw new HttpError(404, 'No encontrada');
    const recibos = (await all(c.env, 'SELECT * FROM fin_receipts WHERE business_id = ? AND invoice_id = ? ORDER BY id', c.businessId, inv.id)).map((x) => ({ ...x, files: parseFiles(x.files) }));
    const pagos = inv.kind === 'recibida' ? await all(c.env, 'SELECT id, date, amount, description FROM fin_movements WHERE business_id = ? AND invoice_id = ? ORDER BY date, id', c.businessId, inv.id) : [];
    return json({ factura: { ...inv, state: invoiceState(inv, today()) }, recibos, pagos });
  });
  // Gastos recurrentes: lo que ya se pagó este mes y lo que falta por pagar (los que vencen antes de que acabe el mes).
  r.get(`${B}/recurring/estado`, `tenant:${MOD}`, async (c) => {
    const mes = MONTH.test(c.url.searchParams.get('month') || '') ? c.url.searchParams.get('month') : today().slice(0, 7), fin = `${mes}-31`;
    const pagados = await all(c.env, 'SELECT recurring_id, SUM(amount) AS pagado FROM fin_movements WHERE business_id = ? AND recurring_id IS NOT NULL AND date BETWEEN ? AND ? GROUP BY recurring_id', c.businessId, `${mes}-01`, fin);
    const recs = await all(c.env, 'SELECT id, amount, next_date FROM fin_recurring WHERE business_id = ? AND active = 1', c.businessId);
    const porPagar = recs.filter((x) => x.next_date <= fin).map((x) => ({ id: x.id, valor: x.amount, fecha: x.next_date }));
    return json({ mes, pagados, por_pagar: porPagar, total_pagado: pagados.reduce((a, x) => a + x.pagado, 0), total_por_pagar: porPagar.reduce((a, x) => a + x.valor, 0) });
  });
  r.get(`${B}/receipts`, `tenant:${MOD}`, async (c) => {
    const q = (c.url.searchParams.get('q') || '').trim(), limit = Math.min(1000, Math.max(1, Number(c.url.searchParams.get('limit')) || 200));
    const rows = q
      ? await all(c.env, `SELECT * FROM fin_receipts WHERE business_id = ? AND (counterparty LIKE ? OR number LIKE ? OR concept LIKE ?) ORDER BY id DESC LIMIT ${limit}`, c.businessId, `%${q}%`, `%${q}%`, `%${q}%`)
      : await all(c.env, `SELECT * FROM fin_receipts WHERE business_id = ? ORDER BY id DESC LIMIT ${limit}`, c.businessId);
    return json({ rows: rows.map((x) => ({ ...x, files: parseFiles(x.files) })) });
  });
  r.post(`${B}/receipts/externo/void`, `manager:${MOD}`, async (c) => {
    const ref = String((await readJson(c.req)).ref || '').slice(0, 120);
    const rc = ref && await one(c.env, 'SELECT * FROM fin_receipts WHERE business_id = ? AND ref = ?', c.businessId, ref);
    if (!rc) throw new HttpError(404, 'No encontrado');
    await voidReceipt(c, rc);
    return json({ ok: true, number: rc.number });
  });
  r.post(`${B}/receipts/:id/void`, `manager:${MOD}`, async (c) => {
    const rc = await one(c.env, 'SELECT * FROM fin_receipts WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!rc) throw new HttpError(404, 'No encontrado');
    await voidReceipt(c, rc);
    return json({ ok: true });
  });
  r.get(`${B}/receipts/:id/pdf`, `tenant:${MOD}`, async (c) => {
    const rc = await one(c.env, 'SELECT * FROM fin_receipts WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!rc) throw new HttpError(404, 'No encontrado');
    const inv = rc.invoice_id ? await one(c.env, 'SELECT * FROM fin_invoices WHERE id = ? AND business_id = ?', rc.invoice_id, c.businessId) : null;
    const antes = inv ? (await one(c.env, 'SELECT COALESCE(SUM(amount), 0) s FROM fin_receipts WHERE business_id = ? AND invoice_id = ? AND voided = 0 AND id <= ?', c.businessId, inv.id, rc.id)).s : null;
    return new Response(await receiptDocument(c.env, c.businessId, rc, inv, { autoprint: c.url.searchParams.has('imprimir'), abonado: antes, logo: c.ctx?.business?.logo || null }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });
  r.post(`${B}/receipts/externo`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), ref = String(b.ref || '').slice(0, 120);
    if (!ref) throw new HttpError(400, 'Falta ref');
    const prev = await one(c.env, 'SELECT id, number FROM fin_receipts WHERE business_id = ? AND ref = ?', c.businessId, ref);
    if (prev) return json({ id: prev.id, number: prev.number, nuevo: false });
    const amount = cast('valor', 'money!', b.amount);
    if (amount <= 0) throw new HttpError(400, 'El valor debe ser mayor que cero');
    const inv = b.invoice_ref ? await one(c.env, 'SELECT * FROM fin_invoices WHERE business_id = ? AND ref = ?', c.businessId, String(b.invoice_ref).slice(0, 120)) : null;
    let cc = null;
    if (b.centro_costo && !inv) {
      const name = String(b.centro_costo).slice(0, 120);
      cc = (await one(c.env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(name) = lower(?)', c.businessId, name))?.id;
      if (!cc) { const t0 = now(); cc = (await c.env.DB.prepare("INSERT INTO fin_cost_centers (business_id, name, kind, active, created_at, updated_at) VALUES (?, ?, 'app', 1, ?, ?)").bind(c.businessId, name, t0, t0).run()).meta.last_row_id; }
    }
    const rc = await createReceipt(c, { inv, date: cast('fecha', 'date', b.date) || today(), amount, method: b.method ? String(b.method).slice(0, 40) : null,
      counterparty: b.counterparty ? String(b.counterparty).slice(0, 200) : inv?.counterparty || null, concept: b.concept ? String(b.concept).slice(0, 300) : null, notes: b.notes ? String(b.notes).slice(0, 300) : null, ref, costCenterId: cc, files: b.files ? limpiarArchivos(b.files) : null });
    return json({ ...rc, nuevo: true }, 201);
  });

  const api = crud(r, { base: B, modulo: MOD, entities: ENTITIES });
  r.get(`${B}/reports/datos`, `tenant:${MOD}`, async (c) => json(await reportData(c, c.url.searchParams.get('month'))));

  r.get(`${B}/summary`, `tenant:${MOD}`, async (c) => json(await financeSummary(c, c.url.searchParams.get('month'))));
  r.get(`${B}/resumen`, `tenant:${MOD}`, async (c) => {
    const s = await financeSummary(c);
    const p = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO');
    return json({ titulo: 'Resultado del mes', valor: p(s.totals.net), detalle: `Ingresos ${p(s.totals.income)} · Gastos ${p(s.totals.expense)}${s.receivable.overdue ? ` · ${p(s.receivable.overdue)} vencido por cobrar` : ''}`, icono: 'bi-cash-coin', ruta: '/staff/finanzas.html' });
  });

  r.post(`${B}/invoices/:id/pay`, `tenant:${MOD}`, async (c) => {
    const inv = await api.get(c, 'invoices', Number(c.params.id));
    if (inv.status === 'anulada') throw new HttpError(409, 'La factura está anulada');
    const body = await readJson(c.req);
    const amount = cast('monto', 'money!', body.amount ?? inv.total - inv.paid);
    if (amount <= 0) throw new HttpError(400, 'El monto debe ser mayor que cero');
    const date = cast('fecha', 'date', body.date) || today(), t = now();
    const accountId = cast('cuenta', 'int', body.account_id);
    if (accountId) await api.get(c, 'accounts', accountId);
    if (inv.kind === 'emitida') {   // por cobrar: cada cobro es un recibo de caja
      if (amount > inv.total - inv.paid) throw new HttpError(400, `El recibo supera el saldo (${'$' + Math.max(0, inv.total - inv.paid).toLocaleString('es-CO')})`);
      const rc = await createReceipt(c, { inv, date, amount, method: body.method ? String(body.method).slice(0, 40) : null, accountId, counterparty: inv.counterparty, concept: `Abono a la cuenta de cobro ${inv.number || '#' + inv.id}`, notes: body.notes ? String(body.notes).slice(0, 300) : null });
      return json({ ok: true, receipt: rc }, 201);
    }
    await c.env.DB.prepare(`INSERT INTO fin_movements (business_id, kind, date, amount, category, description, counterparty, cost_center_id, account_id, invoice_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, inv.kind === 'emitida' ? 'ingreso' : 'gasto', date, amount, inv.category || 'Facturas',
      `Pago factura ${inv.number || '#' + inv.id}`, inv.counterparty, inv.cost_center_id, accountId, inv.id, t, t).run();
    await recomputeInvoice(c.env, c.businessId, inv.id);
    await audit(c, `Registró el ${inv.kind === 'emitida' ? 'cobro' : 'pago'} de ${'$' + amount.toLocaleString('es-CO')} de la factura ${inv.number || '#' + inv.id}`, { modulo: MOD });
    return json({ ok: true });
  });

  r.get(`${B}/invoices/:id/pdf`, `tenant:${MOD}`, async (c) => {
    const inv = await api.get(c, 'invoices', Number(c.params.id));
    return new Response(await invoiceDocument(c.env, c.businessId, inv, { autoprint: c.url.searchParams.has('imprimir'), origin: c.url.origin, logo: c.ctx?.business?.logo || null }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });
  r.get(`${B}/billing/profile`, `tenant:${MOD}`, async (c) => json(await getProfile(c.env, c.businessId)));
  r.put(`${B}/billing/profile`, `manager:${MOD}`, async (c) => {
    let out; try { out = await saveProfile(c.env, c.businessId, await readJson(c.req)); } catch (e) { throw new HttpError(400, e.message); }
    await audit(c, 'Actualizó los datos de facturación', { modulo: MOD });
    return json(out);
  });
  r.get(`${B}/billing/fx`, `tenant:${MOD}`, async (c) => json({ date: c.url.searchParams.get('date') || today(), rate: await trm(c.env, c.url.searchParams.get('date')) }));

  // Conciliación de una cuenta: sus movimientos (con su recibo) y cuántos faltan por conciliar con el banco.
  r.get(`${B}/accounts/:id/conciliacion`, `tenant:${MOD}`, async (c) => {
    const acc = await one(c.env, 'SELECT * FROM fin_accounts WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!acc) throw new HttpError(404, 'No encontrada');
    const solo = c.url.searchParams.get('estado') !== 'todos';
    const rows = await all(c.env, `SELECT * FROM fin_movements WHERE business_id = ? AND account_id = ? ${solo ? 'AND reconciled = 0' : ''} ORDER BY date DESC, id DESC LIMIT 1500`, c.businessId, acc.id);
    await ENTITIES.movements.decorate(c, rows);
    const t = await one(c.env, `SELECT SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) n, COUNT(*) total, COALESCE(SUM(reconciled = 0), 0) sin, COALESCE(SUM(CASE WHEN reconciled = 1 THEN (CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) END), 0) conc FROM fin_movements WHERE business_id = ? AND account_id = ?`, c.businessId, acc.id);
    const l = await one(c.env, 'SELECT COUNT(*) n FROM fin_bank_lines WHERE business_id = ? AND account_id = ? AND movement_id IS NULL', c.businessId, acc.id);
    return json({ cuenta: acc, balance: (acc.opening_balance || 0) + (t.n || 0), saldo_conciliado: (acc.opening_balance || 0) + (t.conc || 0), movimientos: t.total, sin_conciliar: t.sin, lineas_sin_conciliar: l.n, rows });
  });
  r.get(`${B}/bank-lines`, `tenant:${MOD}`, async (c) => {
    const acc = Number(c.url.searchParams.get('account_id')) || null;
    const lines = await all(c.env, `SELECT b.*, m.description AS m_description, m.category AS m_category FROM fin_bank_lines b
      LEFT JOIN fin_movements m ON m.id = b.movement_id AND m.business_id = b.business_id WHERE b.business_id = ? ${acc ? 'AND b.account_id = ?' : ''} ORDER BY b.movement_id IS NOT NULL, b.date DESC LIMIT 500`, c.businessId, ...(acc ? [acc] : []));
    for (const l of lines.filter((x) => !x.movement_id).slice(0, 100)) {
      l.candidates = await all(c.env, `SELECT id, date, description, counterparty, amount FROM fin_movements WHERE business_id = ? AND reconciled = 0 AND kind = ? AND amount = ?
        AND date BETWEEN ? AND ? ${l.account_id ? 'AND (account_id = ? OR account_id IS NULL)' : ''} ORDER BY account_id IS NULL LIMIT 5`, c.businessId, l.amount > 0 ? 'ingreso' : 'gasto', Math.abs(l.amount), addDays(l.date, -7), addDays(l.date, 7), ...(l.account_id ? [l.account_id] : []));
    }
    return json({ lines });
  });
  r.post(`${B}/bank-import`, `manager:${MOD}`, async (c) => {
    const body = await readJson(c.req);
    const accountId = cast('cuenta', 'int!', body.account_id);
    await api.get(c, 'accounts', accountId);
    const lines = Array.isArray(body.lines) ? body.lines.slice(0, 2000) : [];
    if (!lines.length) throw new HttpError(400, 'El extracto no trae movimientos');
    const t = now(), stmts = [];
    for (const l of lines) {
      const date = cast('fecha', 'date!', l.date), amount = Math.round(Number(l.amount));
      if (!Number.isFinite(amount) || amount === 0) continue;
      stmts.push(c.env.DB.prepare('INSERT INTO fin_bank_lines (business_id, account_id, date, description, amount, ref, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(c.businessId, accountId, date, String(l.description || '').slice(0, 300), amount, l.ref ? String(l.ref).slice(0, 100) : null, t));
    }
    for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
    const matched = await autoMatch(c, accountId);
    await audit(c, `Importó un extracto con ${stmts.length} líneas (${matched} conciliadas solas)`, { modulo: MOD });
    return json({ imported: stmts.length, matched });
  });
  r.post(`${B}/bank-lines/:id/match`, `tenant:${MOD}`, async (c) => {
    const l = await one(c.env, 'SELECT * FROM fin_bank_lines WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!l) throw new HttpError(404, 'Línea no encontrada');
    const body = await readJson(c.req);
    if (body.unlink) {
      if (l.movement_id) await c.env.DB.batch([
        c.env.DB.prepare('UPDATE fin_bank_lines SET movement_id = NULL WHERE id = ? AND business_id = ?').bind(l.id, c.businessId),
        c.env.DB.prepare('UPDATE fin_movements SET reconciled = 0 WHERE id = ? AND business_id = ?').bind(l.movement_id, c.businessId),
      ]);
      return json({ ok: true });
    }
    let movementId = body.movement_id ? cast('movimiento', 'int', body.movement_id) : null;
    if (movementId) await api.get(c, 'movements', movementId);
    else if (body.create) {
      const ccId = cast('centro', 'int', body.create.cost_center_id);
      if (ccId) await api.get(c, 'cost_centers', ccId);
      const t = now();
      const res = await c.env.DB.prepare(`INSERT INTO fin_movements (business_id, kind, date, amount, category, description, cost_center_id, account_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, l.amount > 0 ? 'ingreso' : 'gasto', l.date, Math.abs(l.amount), cast('categoría', 'text', body.create.category),
        l.description, ccId, l.account_id, t, t).run();
      movementId = res.meta.last_row_id;
    } else throw new HttpError(400, 'Elige un movimiento o crea uno');
    await link(c, l.id, movementId, l.account_id);
    await audit(c, 'Concilió una línea del extracto', { modulo: MOD });
    return json({ ok: true, movement_id: movementId });
  });

  // Centro de costo por nombre (se crea si no existe): lo usan los gastos que llegan de otras apps
  const centroPorNombre = async (c, nombre) => {
    const n = String(nombre || '').trim().slice(0, 120);
    if (!n) return null;
    const hit = await one(c.env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(name) = lower(?)', c.businessId, n);
    if (hit) return hit.id;
    const t0 = now();
    return (await c.env.DB.prepare("INSERT INTO fin_cost_centers (business_id, name, kind, active, created_at, updated_at) VALUES (?, ?, 'area', 1, ?, ?)").bind(c.businessId, n, t0, t0).run()).meta.last_row_id;
  };
  // Gasto recurrente que crea otra app (p. ej. la nómina de Equipo). Se identifica por `ref`: si existe se actualiza (la fecha del próximo cobro no se toca) y no se cobra solo.
  //   POST /api/finanzas/recurring/externo { ref, name, vendor?, tax_id?, category?, amount, cycle?, next_date?, centro_costo?, notes?, url?, active? }
  r.post(`${B}/recurring/externo`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), ref = String(b.ref || '').slice(0, 120);
    if (!ref) throw new HttpError(400, 'Falta ref');
    const name = String(b.name || '').trim().slice(0, 200);
    if (!name) throw new HttpError(400, 'Falta el nombre');
    const amount = cast('valor', 'money', b.amount) || 0, ciclo = ['mensual', 'anual', 'quincenal', 'semanal'].includes(b.cycle) ? b.cycle : 'mensual';
    const category = ['infraestructura', 'software', 'api', 'ia', 'marketing', 'nomina', 'otro'].includes(b.category) ? b.category : 'otro';
    const cc = await centroPorNombre(c, b.centro_costo);
    const vendor = b.vendor ? String(b.vendor).slice(0, 200) : null, taxId = b.tax_id ? String(b.tax_id).slice(0, 60) : null, notes = b.notes ? String(b.notes).slice(0, 300) : null, url = /^\/[\w\-./#:%?=&]{0,300}$/.test(b.url || '') ? b.url : null;
    const prev = await one(c.env, 'SELECT id FROM fin_recurring WHERE business_id = ? AND ref = ?', c.businessId, ref), t = now();
    if (prev) {
      await c.env.DB.prepare('UPDATE fin_recurring SET name = ?, vendor = ?, tax_id = ?, category = ?, amount = ?, cycle = ?, cost_center_id = ?, notes = ?, url = ?, active = ?, updated_at = ? WHERE id = ? AND business_id = ?')
        .bind(name, vendor, taxId, category, amount, ciclo, cc, notes, url, b.active === false ? 0 : 1, t, prev.id, c.businessId).run();
      return json({ id: prev.id, nuevo: false });
    }
    const next = DATE.test(b.next_date || '') ? b.next_date : today();
    const res = await c.env.DB.prepare(`INSERT INTO fin_recurring (business_id, name, vendor, tax_id, category, amount, currency, cycle, next_date, cost_center_id, active, notes, url, ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'COP', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, name, vendor, taxId, category, amount, ciclo, next, cc, b.active === false ? 0 : 1, notes, url, ref, t, t).run();
    return json({ id: res.meta.last_row_id, nuevo: true }, 201);
  });
  // Pagos del mes: se arma el pago de UNA persona (nómina) o de UN servicio con sus ítems; cada plan suma al presupuesto del mes (por centro de costo y categoría)
  // y «pagar» lo registra en Movimientos, repartido entre una o varias cuentas (p. ej. mitad efectivo y mitad banco).
  //   GET  /api/finanzas/pagos-mes?month=AAAA-MM  → planes guardados, pagos hechos y servicios recurrentes por pagar
  //   POST /api/finanzas/pagos-mes { month, tipo: 'nomina'|'servicios', key, tercero, cost_center_id?, recurring_id?, items: [{ concepto, valor }], pagar?: true, fecha?, fuentes?: [{ account_id, valor }] }
  const refKey = (k) => String(k || '').replace(/[^\w.-]/g, '_').slice(0, 60);
  const reconstruirPresupuesto = async (c, month, cc, categoria) => {
    const filtro = cc === null ? 'cost_center_id IS NULL' : 'cost_center_id = ?', args = cc === null ? [] : [cc];
    const total = (await one(c.env, `SELECT COALESCE(SUM(amount), 0) n FROM fin_pagos_plan WHERE business_id = ? AND month = ? AND category = ? AND ${filtro}`, c.businessId, month, categoria, ...args)).n;
    await c.env.DB.prepare(`DELETE FROM fin_budgets WHERE business_id = ? AND month = ? AND category = ? AND ${filtro}`).bind(c.businessId, month, categoria, ...args).run();
    if (total > 0) { const t = now(); await c.env.DB.prepare('INSERT INTO fin_budgets (business_id, month, cost_center_id, category, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(c.businessId, month, cc, categoria, total, t, t).run(); }
  };
  r.get(`${B}/pagos-mes`, `tenant:${MOD}`, async (c) => {
    const month = MONTH.test(c.url.searchParams.get('month') || '') ? c.url.searchParams.get('month') : today().slice(0, 7), fin = `${month}-31`;
    const planes = (await all(c.env, 'SELECT tipo, key, tercero, tax_id, cost_center_id, category, amount, items, recurring_id FROM fin_pagos_plan WHERE business_id = ? AND month = ?', c.businessId, month)).map((x) => ({ ...x, items: parseFiles(x.items) }));
    const movs = await all(c.env, 'SELECT ref, amount, account_id FROM fin_movements WHERE business_id = ? AND ref LIKE ?', c.businessId, `pago:%:${month}:%`);
    const pagados = {};
    for (const m of movs) { const [, tipo, , k] = m.ref.split(':'); const id = `${tipo}:${k}`; (pagados[id] ||= { tipo, key: k, total: 0, fuentes: [] }); pagados[id].total += m.amount; pagados[id].fuentes.push({ account_id: m.account_id, valor: m.amount }); }
    const servicios = await all(c.env, `SELECT r.id, r.name, r.vendor, r.category, r.amount, r.next_date, r.cost_center_id, r.account_id FROM fin_recurring r WHERE r.business_id = ? AND r.active = 1 AND r.next_date <= ? ORDER BY r.next_date, r.name`, c.businessId, fin);
    const pagadosRec = await all(c.env, 'SELECT m.recurring_id, r.name, r.vendor, SUM(m.amount) AS valor FROM fin_movements m JOIN fin_recurring r ON r.id = m.recurring_id AND r.business_id = m.business_id WHERE m.business_id = ? AND m.recurring_id IS NOT NULL AND m.date BETWEEN ? AND ? GROUP BY m.recurring_id', c.businessId, `${month}-01`, fin);
    return json({ month, planes, pagados: Object.values(pagados), servicios, pagados_servicios: pagadosRec });
  });
  r.post(`${B}/pagos-mes`, `tenant:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const month = MONTH.test(b.month || '') ? b.month : null, tipo = b.tipo === 'nomina' ? 'nomina' : b.tipo === 'servicios' ? 'servicios' : null, key = String(b.key || '').slice(0, 60);
    if (!month || !tipo || !key) throw new HttpError(400, 'Falta el mes, el tipo o a quién se le paga');
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((x) => ({ concepto: String(x.concepto || '').trim().slice(0, 200), valor: Math.round(Number(x.valor)) })).filter((x) => x.concepto && Number.isFinite(x.valor) && x.valor > 0);
    const total = items.reduce((a, x) => a + x.valor, 0);
    if (!(total > 0)) throw new HttpError(400, 'Ponle valor a al menos un ítem');
    const cc = cast('centro de costo', 'int', b.cost_center_id) || null;
    if (cc) await api.get(c, 'cost_centers', cc);
    const tercero = String(b.tercero || '').trim().slice(0, 200) || null, taxId = String(b.tax_id || '').trim().slice(0, 40) || null;
    let rec = null;
    if (b.recurring_id) { rec = await one(c.env, 'SELECT * FROM fin_recurring WHERE id = ? AND business_id = ?', Number(b.recurring_id), c.businessId); if (!rec) throw new HttpError(404, 'El gasto recurrente no existe'); }
    const categoria = tipo === 'nomina' ? 'Nómina' : (rec?.category || 'Servicios');
    // 1) el plan y el presupuesto del mes
    const antes = await one(c.env, 'SELECT cost_center_id, category FROM fin_pagos_plan WHERE business_id = ? AND month = ? AND tipo = ? AND key = ?', c.businessId, month, tipo, key);
    await c.env.DB.prepare(`INSERT INTO fin_pagos_plan (business_id, month, tipo, key, tercero, tax_id, cost_center_id, category, amount, items, recurring_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, month, tipo, key) DO UPDATE SET tercero = excluded.tercero, tax_id = excluded.tax_id, cost_center_id = excluded.cost_center_id, category = excluded.category, amount = excluded.amount, items = excluded.items, recurring_id = excluded.recurring_id, updated_at = excluded.updated_at`)
      .bind(c.businessId, month, tipo, key, tercero, taxId, cc, categoria, total, JSON.stringify(items), rec?.id || null, now()).run();
    await reconstruirPresupuesto(c, month, cc, categoria);
    if (antes && (antes.cost_center_id !== cc || antes.category !== categoria)) await reconstruirPresupuesto(c, month, antes.cost_center_id, antes.category);
    if (!b.pagar) { await audit(c, `Armó el pago de ${tercero || key} (${month}) por $${total.toLocaleString('es-CO')}`, { modulo: MOD }); return json({ ok: true, total, pagado: false }, 201); }
    // 2) el pago, repartido entre las cuentas elegidas
    const fuentes = (Array.isArray(b.fuentes) && b.fuentes.length ? b.fuentes : [{ account_id: null, valor: total }]).slice(0, 6).map((f) => ({ account_id: cast('cuenta', 'int', f.account_id) || null, valor: Math.round(Number(f.valor)) }));
    if (fuentes.some((f) => !(f.valor > 0)) || fuentes.reduce((a, f) => a + f.valor, 0) !== total) throw new HttpError(400, `Lo que sale de las cuentas debe sumar ${'$' + total.toLocaleString('es-CO')}`);
    for (const f of fuentes) if (f.account_id) await api.get(c, 'accounts', f.account_id);
    const fecha = DATE.test(b.fecha || '') ? b.fecha : today(), rk = refKey(key);
    const yaPagado = rec ? await one(c.env, 'SELECT 1 FROM fin_movements WHERE business_id = ? AND recurring_id = ? AND date BETWEEN ? AND ?', c.businessId, rec.id, `${month}-01`, `${month}-31`)
      : await one(c.env, 'SELECT 1 FROM fin_movements WHERE business_id = ? AND ref LIKE ?', c.businessId, `pago:${tipo}:${month}:${rk}:%`);
    if (yaPagado) throw new HttpError(409, 'Este pago ya está registrado este mes');
    const titulo = `${tipo === 'nomina' ? 'Nómina' : 'Pago'} ${month}${tercero ? ` · ${tercero}` : ''}`;
    let hechos = 0;
    for (let i = 0; i < fuentes.length; i++) {
      const f = fuentes[i], nombreCuenta = f.account_id ? (await one(c.env, 'SELECT name FROM fin_accounts WHERE id = ? AND business_id = ?', f.account_id, c.businessId))?.name : null;
      const desc = `${titulo}${fuentes.length > 1 && nombreCuenta ? ` (${nombreCuenta})` : ''}`.slice(0, 300), t = now();
      if (rec) {   // servicio recurrente: queda ligado al gasto y este pasa al siguiente cobro
        const res = await chargeRecurring(c.env, rec, fecha, { periodo: i ? `${rec.next_date}:${i + 1}` : rec.next_date, amount: f.valor, vendor: tercero ?? undefined, accountId: f.account_id, costCenterId: cc, taxId, category: categoria });
        if (res.meta.changes) hechos++;
        await c.env.DB.prepare('UPDATE fin_movements SET description = ? WHERE business_id = ? AND ref = ?').bind(desc, c.businessId, `rec:${rec.id}:${i ? `${rec.next_date}:${i + 1}` : rec.next_date}`).run();
      } else {
        const res = await c.env.DB.prepare(`INSERT OR IGNORE INTO fin_movements (business_id, kind, date, amount, category, description, counterparty, tax_id, cost_center_id, account_id, ref, created_at, updated_at)
          VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, fecha, f.valor, categoria, desc, tercero, taxId, cc, f.account_id, `pago:${tipo}:${month}:${rk}:${i + 1}`, t, t).run();
        if (res.meta.changes) hechos++;
      }
    }
    if (rec) await c.env.DB.prepare('UPDATE fin_recurring SET next_date = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(siguienteCobro(rec.next_date, rec.cycle), now(), rec.id, c.businessId).run();
    await audit(c, `Pagó ${tercero || key} (${month}) por $${total.toLocaleString('es-CO')}${fuentes.length > 1 ? ` en ${fuentes.length} cuentas` : ''}`, { modulo: MOD });
    return json({ ok: true, total, pagado: true, movimientos: hechos }, 201);
  });
  // El documento de un pago (total con sus ítems, nombre y cédula, y de qué cuentas salió) para soportar el movimiento. GET /api/finanzas/pagos-mes/documento?tipo=&month=&key=
  r.get(`${B}/pagos-mes/documento`, `tenant:${MOD}`, async (c) => {
    const q = c.url.searchParams, tipo = q.get('tipo') === 'servicios' ? 'servicios' : 'nomina', month = MONTH.test(q.get('month') || '') ? q.get('month') : '', key = String(q.get('key') || '');
    const pl = await one(c.env, 'SELECT * FROM fin_pagos_plan WHERE business_id = ? AND month = ? AND tipo = ? AND key = ?', c.businessId, month, tipo, key);
    if (!pl) throw new HttpError(404, 'Ese pago no existe');
    const movs = await all(c.env, `SELECT m.date, m.amount, a.name AS cuenta, m.ref, m.recurring_id FROM fin_movements m LEFT JOIN fin_accounts a ON a.id = m.account_id AND a.business_id = m.business_id
      WHERE m.business_id = ? AND (m.ref LIKE ? ${pl.recurring_id ? 'OR (m.recurring_id = ? AND m.date BETWEEN ? AND ?)' : ''}) ORDER BY m.id`, c.businessId, `pago:${tipo}:${month}:${String(key).replace(/[^\w.-]/g, '_').slice(0, 60)}:%`, ...(pl.recurring_id ? [pl.recurring_id, `${month}-01`, `${month}-31`] : []));
    const cc = pl.cost_center_id ? (await one(c.env, 'SELECT name FROM fin_cost_centers WHERE id = ? AND business_id = ?', pl.cost_center_id, c.businessId))?.name : null;
    return new Response(await pagoDocument(c.env, c.businessId, { plan: { ...pl, items: parseFiles(pl.items) }, movimientos: movs, centro: cc }, { autoprint: q.has('imprimir'), logo: c.ctx?.business?.logo || null }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });
  // Pagar un gasto recurrente cuando se acerca (o cuando se quiera): registra el pago al proveedor como gasto en Movimientos y pasa al siguiente cobro.
  //   POST /api/finanzas/recurring/:id/pagar { date?, amount?, vendor?, account_id? }
  r.post(`${B}/recurring/:id/pagar`, `tenant:${MOD}`, async (c) => {
    const rec = await api.get(c, 'recurring', Number(c.params.id));
    if (!rec.active) throw new HttpError(409, 'El gasto está pausado: actívalo para registrar el pago');
    const b = await readJson(c.req), date = cast('fecha', 'date', b.date) || today();
    const amount = b.amount === undefined || b.amount === '' || b.amount === null ? null : cast('valor', 'money', b.amount);
    if (amount !== null && !(amount > 0)) throw new HttpError(400, 'El valor debe ser mayor que cero');
    const accountId = cast('cuenta', 'int', b.account_id) || null;
    if (accountId) await api.get(c, 'accounts', accountId);
    const vendor = b.vendor === undefined ? undefined : String(b.vendor || '').trim().slice(0, 200) || null;
    const res = await chargeRecurring(c.env, rec, date, { periodo: rec.next_date, amount: amount || 0, vendor, accountId });
    if (!res.meta.changes) throw new HttpError(409, 'Ese cobro ya está registrado');
    await c.env.DB.prepare('UPDATE fin_recurring SET next_date = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(siguienteCobro(rec.next_date, rec.cycle), now(), rec.id, c.businessId).run();
    await audit(c, `Pagó «${rec.name}»${vendor ?? rec.vendor ? ` a ${vendor ?? rec.vendor}` : ''} por $${(amount || rec.amount).toLocaleString('es-CO')}`, { modulo: MOD });
    return json({ ok: true, movimiento: res.meta.last_row_id, siguiente: siguienteCobro(rec.next_date, rec.cycle) }, 201);
  });
  r.post(`${B}/recurring/:id/charges`, `tenant:${MOD}`, async (c) => {
    const rec = await api.get(c, 'recurring', Number(c.params.id));
    const dates = (await readJson(c.req)).dates;
    if (!Array.isArray(dates)) throw new HttpError(400, 'dates debe ser una lista de fechas');
    const out = [];
    for (const d of [...new Set(dates)].filter((x) => DATE.test(x) && x <= today()).sort()) out.push({ fecha: d, nuevo: !!(await chargeRecurring(c.env, rec, d)).meta.changes });
    await audit(c, `Registró ${out.filter((x) => x.nuevo).length} cobros ya hechos de «${rec.name}»`, { modulo: MOD });
    return json({ cobros: out });
  });

  r.get(`${B}/export`, `manager:${MOD}`, async (c) => {
    const q = c.url.searchParams;
    const kind = q.get('kind') === 'invoices' ? 'invoices' : 'movements';
    const from = DATE.test(q.get('from') || '') ? q.get('from') : '0000-01-01', to = DATE.test(q.get('to') || '') ? q.get('to') : '9999-12-31';
    let header, rows;
    if (kind === 'movements') {
      header = ['Fecha', 'Tipo', 'Monto', 'Moneda', 'USD', 'TRM', 'Categoría', 'Descripción', 'Tercero', 'Centro de costo', 'Cuenta', 'Factura', 'Conciliado'];
      rows = (await all(c.env, `SELECT m.*, cc.name cc, a.name acc, i.number inv FROM fin_movements m LEFT JOIN fin_cost_centers cc ON cc.id = m.cost_center_id AND cc.business_id = m.business_id
        LEFT JOIN fin_accounts a ON a.id = m.account_id AND a.business_id = m.business_id LEFT JOIN fin_invoices i ON i.id = m.invoice_id AND i.business_id = m.business_id
        WHERE m.business_id = ? AND m.date BETWEEN ? AND ? ORDER BY m.date, m.id`, c.businessId, from, to))
        .map((m) => [m.date, m.kind, m.kind === 'gasto' ? -m.amount : m.amount, m.currency, m.amount_usd ?? '', m.fx_rate ?? '', m.category, m.description, m.counterparty, m.cc, m.acc, m.inv, m.reconciled ? 'sí' : 'no']);
    } else {
      header = ['Tipo', 'Número', 'Tercero', 'NIT/CC', 'Emisión', 'Vencimiento', 'Subtotal', 'Impuestos', 'Total', 'Pagado', 'Saldo', 'Estado', 'Centro de costo', 'Categoría'];
      rows = (await all(c.env, `SELECT i.*, cc.name cc FROM fin_invoices i LEFT JOIN fin_cost_centers cc ON cc.id = i.cost_center_id AND cc.business_id = i.business_id
        WHERE i.business_id = ? AND i.issue_date BETWEEN ? AND ? ORDER BY i.issue_date, i.id`, c.businessId, from, to))
        .map((i) => [i.kind === 'emitida' ? 'Por cobrar' : 'Por pagar', i.number, i.counterparty, i.tax_id, i.issue_date, i.due_date, i.subtotal, i.tax, i.total, i.paid, i.total - i.paid, invoiceState(i), i.cc, i.category]);
    }
    await audit(c, `Exportó ${kind === 'invoices' ? 'las facturas' : 'los movimientos'} (${from.startsWith('0000') ? 'todo' : from} a ${to.startsWith('9999') ? 'hoy' : to})`, { modulo: MOD });
    const body = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${kind === 'invoices' ? 'facturas' : 'movimientos'}-${from.startsWith('0000') ? 'todo' : from}.csv"`, 'cache-control': 'no-store' } });
  });
}

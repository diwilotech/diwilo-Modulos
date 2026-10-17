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
import { getProfile, saveProfile, nextNumber, priceItems, invoiceDocument, receiptDocument } from './documento.js';
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
async function createReceipt(c, { inv = null, date, amount, method = null, accountId = null, counterparty = null, concept = null, notes = null, ref = null, costCenterId = null }) {
  const t = now(), number = await nextReceiptNumber(c.env, c.businessId);
  const desc = `Recibo de caja ${number}${inv ? ` · cuenta ${inv.number || '#' + inv.id}` : ''}${counterparty ? ` · ${counterparty}` : ''}`.slice(0, 300);
  const mov = await c.env.DB.prepare(`INSERT INTO fin_movements (business_id, kind, date, amount, category, description, counterparty, cost_center_id, account_id, invoice_id, ref, created_at, updated_at)
    VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, date, amount, inv?.category || concept || 'Recibos de caja', desc, counterparty, costCenterId ?? inv?.cost_center_id ?? null, accountId, inv?.id || null, `recibo:${number}`, t, t).run();
  const rc = await c.env.DB.prepare(`INSERT INTO fin_receipts (business_id, number, invoice_id, movement_id, date, amount, method, account_id, counterparty, concept, notes, ref, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, number, inv?.id || null, mov.meta.last_row_id, date, amount, method, accountId, counterparty, concept, notes, ref, t, t).run();
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
export const ENTITIES = {
  movements: { table: 'fin_movements', label: 'el movimiento', title: 'description', search: ['description', 'counterparty', 'category'], order: 'date DESC, id DESC',
    fields: { kind: ['ingreso', 'gasto'], date: 'date!', currency: ['COP', 'USD'], amount_usd: 'usd', amount: 'money!', fx_rate: 'num', category: 'text', description: 'text', counterparty: 'text', cost_center_id: 'int', account_id: 'int', invoice_id: 'int', reconciled: 'bool' },
    async beforeCreate(c, row, body) { if (row.currency === 'USD') await applyFx(c, 'movements', row); },
    async afterCreate(c, id, row) { if (row.invoice_id) await recomputeInvoice(c.env, c.businessId, row.invoice_id); },
    async beforeUpdate(c, row, before) { if (['currency', 'amount_usd', 'date'].some((k) => k in row)) await applyFx(c, 'movements', row, before); },
    async afterUpdate(c, id, row, before) { for (const inv of new Set([before.invoice_id, row.invoice_id].filter(Boolean))) await recomputeInvoice(c.env, c.businessId, inv); },
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
    fields: { name: 'text!', vendor: 'text', category: ['infraestructura', 'software', 'api', 'ia', 'marketing', 'otro'], currency: ['COP', 'USD'], amount_usd: 'usd', amount: 'money!', fx_rate: 'num', cycle: ['mensual', 'anual'], next_date: 'date!', cost_center_id: 'int', account_id: 'int', active: 'bool+', notes: 'long' },
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
    fields: { name: 'text!', kind: ['banco', 'efectivo', 'tarjeta', 'billetera'], bank: 'text', last4: 'text', opening_balance: 'money' } },
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
        while (d < mNext && guard++ < 40) { if (d >= mFirst && (k > 0 || d >= t)) row.expense += r.amount; d = addMonths(d, r.cycle === 'anual' ? 12 : 1); }
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
  for (const r of recurring) recurringMonthly[r.category] = (recurringMonthly[r.category] || 0) + (r.cycle === 'anual' ? Math.round(r.amount / 12) : r.amount);
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
export async function chargeRecurring(env, r, d) {
  const usd = r.currency === 'USD' && r.amount_usd > 0, rate = usd ? await trm(env, d).catch(() => r.fx_rate || null) : null;
  const t = now();
  return env.DB.prepare(`INSERT OR IGNORE INTO fin_movements (business_id, kind, date, amount, currency, amount_usd, fx_rate, category, description, counterparty, cost_center_id, account_id, recurring_id, ref, created_at, updated_at)
    VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.business_id, d, usd && rate ? Math.round(r.amount_usd * rate) : r.amount, usd ? 'USD' : 'COP', usd ? r.amount_usd : null, rate,
    r.category, r.name, r.vendor, r.cost_center_id, r.account_id, r.id, `rec:${r.id}:${d}`, t, t).run();
}
// Tarea diaria: los recurrentes que vencen se registran como gasto y la fecha pasa al siguiente cobro.
export async function daily(env) {
  const t = today();
  const due = await all(env, 'SELECT * FROM fin_recurring WHERE active = 1 AND next_date <= ?', t);
  for (const r of due) {
    let d = r.next_date, guard = 0;
    while (d <= t && guard++ < 24) { await chargeRecurring(env, r, d); d = addMonths(d, r.cycle === 'anual' ? 12 : 1); }
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
  //   POST /api/finanzas/invoices/externo { ref, counterparty, tax_id?, client_email?, issue_date?, due_date?, concept, detail?, total, category?, centro_costo? }
  r.post(`${B}/invoices/externo`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), ref = String(b.ref || '').slice(0, 120);
    if (!ref) throw new HttpError(400, 'Falta ref');
    const total = cast('total', 'money!', b.total);
    if (total <= 0) throw new HttpError(400, 'El total debe ser mayor que cero');
    const counterparty = String(b.counterparty || '').trim().slice(0, 200);
    if (!counterparty) throw new HttpError(400, 'Falta quién paga');
    const concept = String(b.concept || 'Servicio').slice(0, 300), issue = cast('fecha', 'date', b.issue_date) || today(), due = cast('vence', 'date', b.due_date) || null;
    const items = JSON.stringify([{ concepto: concept, detalle: b.detail ? String(b.detail).slice(0, 300) : undefined, cantidad: 1, moneda: 'COP', valor: total, total }]);
    let cc = null;
    if (b.centro_costo) {
      const name = String(b.centro_costo).slice(0, 120);
      cc = (await one(c.env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(name) = lower(?)', c.businessId, name))?.id;
      if (!cc) { const t0 = now(); cc = (await c.env.DB.prepare("INSERT INTO fin_cost_centers (business_id, name, kind, active, created_at, updated_at) VALUES (?, ?, 'app', 1, ?, ?)").bind(c.businessId, name, t0, t0).run()).meta.last_row_id; }
    }
    const taxId = b.tax_id ? String(b.tax_id).slice(0, 60) : null, email = b.client_email ? String(b.client_email).slice(0, 200) : null, category = b.category ? String(b.category).slice(0, 120) : 'Matrículas';
    const prev = await one(c.env, 'SELECT id, number, status FROM fin_invoices WHERE business_id = ? AND ref = ?', c.businessId, ref);
    const t = now();
    if (prev) {
      if (prev.status !== 'anulada') {
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
  //   POST /api/finanzas/receipts/externo              { ref, invoice_ref?, date?, amount, method?, concept?, counterparty?, centro_costo?, notes? }  de otras apps (no duplica por ref)
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
  r.get(`${B}/receipts`, `tenant:${MOD}`, async (c) => {
    const q = (c.url.searchParams.get('q') || '').trim(), limit = Math.min(1000, Math.max(1, Number(c.url.searchParams.get('limit')) || 200));
    const rows = q
      ? await all(c.env, `SELECT * FROM fin_receipts WHERE business_id = ? AND (counterparty LIKE ? OR number LIKE ? OR concept LIKE ?) ORDER BY id DESC LIMIT ${limit}`, c.businessId, `%${q}%`, `%${q}%`, `%${q}%`)
      : await all(c.env, `SELECT * FROM fin_receipts WHERE business_id = ? ORDER BY id DESC LIMIT ${limit}`, c.businessId);
    return json({ rows });
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
    return new Response(await receiptDocument(c.env, c.businessId, rc, inv, { autoprint: c.url.searchParams.has('imprimir'), abonado: antes }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
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
      counterparty: b.counterparty ? String(b.counterparty).slice(0, 200) : inv?.counterparty || null, concept: b.concept ? String(b.concept).slice(0, 300) : null, notes: b.notes ? String(b.notes).slice(0, 300) : null, ref, costCenterId: cc });
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

  r.get(`${B}/bank-lines`, `tenant:${MOD}`, async (c) => {
    const acc = Number(c.url.searchParams.get('account_id')) || null;
    const lines = await all(c.env, `SELECT b.*, m.description AS m_description, m.category AS m_category FROM fin_bank_lines b
      LEFT JOIN fin_movements m ON m.id = b.movement_id AND m.business_id = b.business_id WHERE b.business_id = ? ${acc ? 'AND b.account_id = ?' : ''} ORDER BY b.movement_id IS NOT NULL, b.date DESC LIMIT 500`, c.businessId, ...(acc ? [acc] : []));
    for (const l of lines.filter((x) => !x.movement_id).slice(0, 100)) {
      l.candidates = await all(c.env, `SELECT id, date, description, counterparty, amount FROM fin_movements WHERE business_id = ? AND reconciled = 0 AND kind = ? AND amount = ?
        AND date BETWEEN ? AND ? LIMIT 5`, c.businessId, l.amount > 0 ? 'ingreso' : 'gasto', Math.abs(l.amount), addDays(l.date, -7), addDays(l.date, 7));
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

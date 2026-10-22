// Nómina Colombia (módulo transversal, por negocio). Ver y operar: propietario y administrador.
//   CRUD   /api/nomina/{employees|novedades|params}       empleados, novedades del periodo y parámetros por año (SMMLV, auxilio, UVT, exoneración)
//   GET    /api/nomina/summary?period=AAAA-MM              plantilla, costo estimado del mes y calendario de obligaciones
//   GET    /api/nomina/parametros?year=                    parámetros vigentes (ley + los del negocio)
//   GET    /api/nomina/runs · GET /api/nomina/runs/:id     corridas de nómina (mes o quincena), primas y cesantías, con sus líneas
//   POST   /api/nomina/runs { tipo?, period, half? }       liquida (o recalcula si sigue en borrador)
//   POST   /api/nomina/runs/:id/aprobar|reabrir            borrador ⇄ aprobada
//   POST   /api/nomina/runs/:id/pagar { date?, account_id? }  paga: deja los egresos en Finanzas (neto, seguridad social y parafiscales, retención)
//   DELETE /api/nomina/runs/:id                            solo si no está pagada
//   GET    /api/nomina/runs/:id/desprendible/:empId        desprendible de pago listo para imprimir
//   GET    /api/nomina/runs/:id/export?kind=pago|aportes   CSV para el banco o para la planilla de aportes
//   GET    /api/nomina/employees/:id/liquidacion?fin=&motivo=  simula la liquidación del contrato · POST la guarda, retira a la persona y (pagar:true) la paga
//   GET    /api/nomina/liquidaciones
// Finanzas: cada pago crea gastos con `ref` (no se duplican) en la cuenta y el centro de costo indicados. Sin Finanzas activo, la nómina funciona igual.
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, cast, today, now, addDays, all, one, DATE, MONTH } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { orgUsa } from '../../lib/contexto.js';
import { recomputeInvoice } from '../finanzas/api.js';
import { KINDS, paramsDe, liquidarEmpleado, prestacion, liquidacionFinal, dias360, r0 } from './calculo.js';

const MOD = 'nomina', B = '/api/nomina';
const HALF = ['M', '1', '2'];

export const ENTITIES = {
  employees: { table: 'nom_employees', label: 'el empleado', title: 'name', search: ['name', 'doc_number', 'position'], order: "status, name", leer: 'manager', crear: 'manager',
    fields: { name: 'text!', doc_type: ['CC', 'NIT', 'CE', 'PPT', 'PEP', 'PA', 'TI'], doc_number: 'text', email: 'email', phone: 'text', position: 'text',
      contract_type: ['indefinido', 'fijo', 'obra_labor', 'aprendizaje', 'prestacion'], salary_type: ['ordinario', 'integral'], salary: 'money', aux_transporte: 'bool+', arl_risk: 'int', pay_freq: ['mensual', 'quincenal', 'semanal'],
      start_date: 'date!', contract_end: 'date', end_date: 'date', status: ['activo', 'retirado'], eps: 'text', afp: 'text', arl: 'text', caja: 'text', cesantias_fund: 'text',
      bank: 'text', account_type: 'text', account_number: 'text', cost_center: 'text', dependientes: 'bool', deduc_vivienda: 'money', deduc_prepagada: 'money', retencion_pct: 'num', ext_ref: 'text', notes: 'long' },
    beforeCreate(c, row) { validarEmpleado(row, c.params); },
    beforeUpdate(c, row) { validarEmpleado(row); } },
  novedades: { table: 'nom_novedades', label: 'la novedad', title: 'kind', search: ['kind', 'note'], order: 'period DESC, id DESC', leer: 'manager', crear: 'manager',
    fields: { employee_id: 'int!', period: 'month!', half: HALF, kind: Object.keys(KINDS), quantity: 'num', amount: 'money', note: 'text' },
    refs: { employee_id: 'nom_employees' },
    beforeCreate(c, row) { validarNovedad(row); }, beforeUpdate(c, row) { if (row.kind) validarNovedad(row); } },
  params: { table: 'nom_params', label: 'los parámetros del año', title: 'year', order: 'year DESC', leer: 'manager', crear: 'manager',
    fields: { year: 'int!', smmlv: 'money', aux_transporte: 'money', uvt: 'money', exonerado: 'bool+', horas_mes: 'int' },
    async beforeCreate(c, row) { if (await one(c.env, 'SELECT 1 FROM nom_params WHERE business_id = ? AND year = ?', c.businessId, row.year)) throw new HttpError(409, 'Ya hay parámetros para ese año: edítalos'); } },
};
function validarEmpleado(row) {
  if (row.salary !== undefined && row.salary !== null && row.salary > 0 && row.salary < 1000) throw new HttpError(400, 'El salario es mensual y en pesos');
  if (row.arl_risk !== undefined && row.arl_risk !== null && (row.arl_risk < 1 || row.arl_risk > 5)) throw new HttpError(400, 'El riesgo ARL va de 1 a 5');
  if (row.end_date && row.start_date && row.end_date < row.start_date) throw new HttpError(400, 'El retiro no puede ser antes del ingreso');
}
function validarNovedad(row) {
  const unidad = KINDS[row.kind]?.[1];
  if (unidad === 'pesos' && !(row.amount > 0)) throw new HttpError(400, 'Escribe el valor en pesos');
  if (unidad && unidad !== 'pesos' && !(row.quantity > 0)) throw new HttpError(400, `Escribe cuántas ${unidad}`);
  if (unidad === 'días' && row.quantity > 31) throw new HttpError(400, 'Máximo 31 días');
}

/* ---------------- parámetros y cálculo ---------------- */
export async function paramsNegocio(env, biz, year) {
  const o = await one(env, 'SELECT * FROM nom_params WHERE business_id = ? AND year = ?', biz, +year);
  return paramsDe(year, o || {});
}
const nombreHalf = (h) => (h === '1' ? 'primera quincena' : h === '2' ? 'segunda quincena' : 'mes completo');
const novedadesDe = (half) => (half === '1' ? ['1'] : half === '2' ? ['2', 'M'] : ['M']);

// ¿Se incluye a la persona en este periodo?
function vinculada(e, period) {
  return e.start_date.slice(0, 7) <= period && (!e.end_date || e.end_date.slice(0, 7) >= period);
}

async function liquidarCorrida(c, run) {
  const year = +run.period.slice(0, 4), p = await paramsNegocio(c.env, c.businessId, year);
  const emps = (await all(c.env, 'SELECT * FROM nom_employees WHERE business_id = ? ORDER BY name', c.businessId)).filter((e) => vinculada(e, run.period));
  const filas = [];
  for (const e of emps) {
    if (run.tipo === 'nomina') {
      if ((run.half === 'M') !== (e.pay_freq !== 'quincenal')) continue;   // mensual y semanal se liquidan por mes (la semanal se paga en partes)
      const nov = await all(c.env, `SELECT kind, quantity, amount, note FROM nom_novedades WHERE business_id = ? AND employee_id = ? AND period = ? AND half IN (${novedadesDe(run.half).map(() => '?').join(',')})`, c.businessId, e.id, run.period, ...novedadesDe(run.half));
      let previa = null;
      if (run.half === '2') {
        const l = await one(c.env, `SELECT l.devengado, l.retencion, l.detalle FROM nom_run_lines l JOIN nom_runs r ON r.id = l.run_id WHERE l.business_id = ? AND r.tipo = 'nomina' AND r.period = ? AND r.half = '1' AND l.employee_id = ?`, c.businessId, run.period, e.id);
        if (l) previa = { devengado: l.devengado, retencion: l.retencion, descuentos_ley: JSON.parse(l.detalle || '{}').descuentos_ley || 0 };
      }
      const d = liquidarEmpleado(e, nov, p, { period: run.period, half: run.half, previa });
      if (d.dias <= 0 && !d.devengado) continue;
      filas.push({ e, d, devengado: d.devengado, deducciones: d.deducciones, neto: d.neto, aportes: d.aportes.total, provisiones: d.provisiones.total, retencion: d.retencion });
    } else {
      const x = prestacion(e, p, run.tipo, { period: run.period });
      const valor = x.valor + x.intereses;
      if (!valor) continue;
      const conceptos = [{ c: run.tipo === 'prima' ? 'Prima de servicios' : 'Cesantías', tipo: 'dev', valor: x.valor, nota: `${x.dias} días (${x.desde} a ${x.hasta})` },
        ...(x.intereses ? [{ c: 'Intereses sobre cesantías (12 %)', tipo: 'dev', valor: x.intereses }] : [])];
      filas.push({ e, d: { conceptos, base: x.base, dias: x.dias, devengado: valor, deducciones: 0, neto: valor, aportes: { total: 0 }, provisiones: { total: 0 }, retencion: 0 }, devengado: valor, deducciones: 0, neto: valor, aportes: 0, provisiones: 0, retencion: 0 });
    }
  }
  await c.env.DB.prepare('DELETE FROM nom_run_lines WHERE business_id = ? AND run_id = ?').bind(c.businessId, run.id).run();
  const t = now(), tot = { devengado: 0, deducciones: 0, neto: 0, aportes: 0, provisiones: 0, retencion: 0 };
  for (const f of filas) {
    for (const k of Object.keys(tot)) tot[k] += f[k];
    await c.env.DB.prepare('INSERT INTO nom_run_lines (business_id, run_id, employee_id, devengado, deducciones, neto, aportes, provisiones, retencion, detalle, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, run.id, f.e.id, f.devengado, f.deducciones, f.neto, f.aportes, f.provisiones, f.retencion, JSON.stringify(f.d), t).run();
  }
  await c.env.DB.prepare('UPDATE nom_runs SET devengado = ?, deducciones = ?, neto = ?, aportes = ?, provisiones = ?, retencion = ?, updated_at = ? WHERE id = ? AND business_id = ?')
    .bind(tot.devengado, tot.deducciones, tot.neto, tot.aportes, tot.provisiones, tot.retencion, t, run.id, c.businessId).run();
  return { ...tot, empleados: filas.length };
}

/* ---------------- Finanzas ---------------- */
// Un gasto en Finanzas por `ref` (idempotente). Devuelve false si el negocio no usa Finanzas.
async function gastoFinanzas(c, { ref, date, amount, description, counterparty, category, centro, accountId, invoiceId = null }) {
  if (!(amount > 0) || !(await orgUsa(c.env, c.businessId, 'finanzas'))) return false;
  let cc = null;
  if (centro) {
    const nombre = String(centro).slice(0, 120);
    cc = (await one(c.env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(name) = lower(?)', c.businessId, nombre))?.id;
    if (!cc) { const t0 = now(); cc = (await c.env.DB.prepare("INSERT INTO fin_cost_centers (business_id, name, kind, active, created_at, updated_at) VALUES (?, ?, 'departamento', 1, ?, ?)").bind(c.businessId, nombre, t0, t0).run()).meta.last_row_id; }
  }
  const acc = accountId ? (await one(c.env, 'SELECT id FROM fin_accounts WHERE id = ? AND business_id = ?', Number(accountId), c.businessId))?.id : null;
  if (accountId && !acc) throw new HttpError(400, 'La cuenta de Finanzas no es válida');
  const t = now();
  const res = await c.env.DB.prepare('INSERT OR IGNORE INTO fin_movements (business_id, kind, date, amount, category, description, counterparty, cost_center_id, account_id, invoice_id, ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(c.businessId, 'gasto', date, r0(amount), category, String(description).slice(0, 300), counterparty ? String(counterparty).slice(0, 200) : null, cc, acc, invoiceId, ref, t, t).run();
  if (res.meta.changes && invoiceId) await recomputeInvoice(c.env, c.businessId, invoiceId);
  return !!res.meta.changes;
}
async function pagarCorrida(c, run, date, accountId) {
  const lineas = await all(c.env, 'SELECT l.*, e.cost_center, e.name, e.contract_type FROM nom_run_lines l JOIN nom_employees e ON e.id = l.employee_id WHERE l.business_id = ? AND l.run_id = ?', c.businessId, run.id);
  const etiqueta = run.tipo === 'nomina' ? `Nómina ${run.period}${run.half === 'M' ? '' : ` (${nombreHalf(run.half)})`}` : run.tipo === 'prima' ? `Prima de servicios ${run.period}` : `Cesantías e intereses ${run.period.slice(0, 4)}`;
  const porCentro = new Map();
  for (const l of lineas) {
    if (run.tipo === 'nomina' && l.contract_type === 'prestacion') continue;   // los contratistas se pagan con su cuenta de cobro (abajo)
    porCentro.set(l.cost_center || '', (porCentro.get(l.cost_center || '') || 0) + l.neto);
  }
  let enviados = 0;
  for (const [cc, neto] of porCentro) if (await gastoFinanzas(c, { ref: `nomina:run:${run.id}:neto:${cc.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, date, amount: neto, description: `${etiqueta} · pago a empleados`, counterparty: 'Empleados', category: 'Nómina', centro: cc || null, accountId })) enviados++;
  if (run.tipo === 'nomina') {
    for (const l of lineas.filter((x) => x.contract_type === 'prestacion')) {
      const inv = await one(c.env, 'SELECT id, total, paid, status FROM fin_invoices WHERE business_id = ? AND ref = ?', c.businessId, `nomina:serv:${l.employee_id}:${run.period}`);
      if (!inv || inv.status === 'anulada' || inv.total - inv.paid <= 0) continue;
      if (await gastoFinanzas(c, { ref: `nomina:run:${run.id}:serv:${l.employee_id}`, date, amount: inv.total - inv.paid, description: `Cuenta de cobro de ${l.name} · ${run.period}`, counterparty: l.name, category: 'Nómina - Servicios', centro: l.cost_center, accountId, invoiceId: inv.id })) enviados++;
    }
  }
  if (run.tipo === 'nomina') {
    // lo que se paga a la planilla de aportes: aportes del empleador + salud, pensión y FSP retenidos al empleado
    let ley = 0; for (const l of lineas) ley += JSON.parse(l.detalle || '{}').descuentos_ley || 0;
    if (await gastoFinanzas(c, { ref: `nomina:run:${run.id}:aportes`, date, amount: run.aportes + ley, description: `${etiqueta} · seguridad social y parafiscales`, counterparty: 'Planilla de aportes (PILA)', category: 'Nómina - Seguridad social', accountId })) enviados++;
    if (await gastoFinanzas(c, { ref: `nomina:run:${run.id}:retencion`, date, amount: run.retencion, description: `${etiqueta} · retención en la fuente`, counterparty: 'DIAN', category: 'Nómina - Retención en la fuente', accountId })) enviados++;
  }
  return enviados;
}

const dineroCsv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

export function routes(r) {
  const api = crud(r, { base: B, modulo: MOD, entities: ENTITIES });
  const corrida = async (c) => {
    const run = await one(c.env, 'SELECT * FROM nom_runs WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!run) throw new HttpError(404, 'Corrida no encontrada');
    return run;
  };

  r.get(`${B}/parametros`, `tenant:${MOD}`, async (c) => {
    const year = Number(c.url.searchParams.get('year')) || +today().slice(0, 4);
    return json({ ...(await paramsNegocio(c.env, c.businessId, year)), kinds: Object.fromEntries(Object.entries(KINDS).map(([k, [label, unidad]]) => [k, { label, unidad }])) });
  });

  r.get(`${B}/summary`, `tenant:${MOD}`, async (c) => {
    const period = MONTH.test(c.url.searchParams.get('period') || '') ? c.url.searchParams.get('period') : today().slice(0, 7);
    const p = await paramsNegocio(c.env, c.businessId, +period.slice(0, 4));
    const emps = (await all(c.env, "SELECT * FROM nom_employees WHERE business_id = ? AND status = 'activo'", c.businessId));
    let devengado = 0, neto = 0, aportes = 0, provisiones = 0;
    for (const e of emps) {
      const nov = await all(c.env, "SELECT kind, quantity, amount, note FROM nom_novedades WHERE business_id = ? AND employee_id = ? AND period = ?", c.businessId, e.id, period);
      const mult = e.pay_freq === 'quincenal' ? 1 : 1;   // el estimado es del mes completo para todos
      const d = liquidarEmpleado({ ...e, pay_freq: 'mensual' }, nov, p, { period, half: 'M' });
      devengado += d.devengado * mult; neto += d.neto; aportes += d.aportes.total; provisiones += d.provisiones.total;
    }
    const y = +period.slice(0, 4);
    const runs = await all(c.env, "SELECT id, tipo, period, half, status, neto FROM nom_runs WHERE business_id = ? AND period = ? ORDER BY id DESC", c.businessId, period);
    const obligaciones = [[`${y}-01-31`, 'Consignar intereses sobre cesantías'], [`${y}-02-14`, 'Consignar cesantías al fondo'], [`${y}-06-30`, 'Pagar prima de servicios (1.er semestre)'], [`${y}-12-20`, 'Pagar prima de servicios (2.º semestre)'],
      [`${y + 1}-01-31`, 'Consignar intereses sobre cesantías'], [`${y + 1}-02-14`, 'Consignar cesantías al fondo']].filter(([f]) => f >= today()).slice(0, 3).map(([fecha, que]) => ({ fecha, que }));
    return json({ period, empleados: emps.length, devengado, neto, aportes, provisiones, costo: devengado + aportes + provisiones, smmlv: p.smmlv, parametros_estimados: p.estimado, corridas: runs, obligaciones,
      finanzas: await orgUsa(c.env, c.businessId, 'finanzas') });
  });

  // Calendario de pagos: fechas de cada empleado y del negocio, a quién se paga y cuánto cuesta. GET /api/nomina/calendario?period=AAAA-MM&employee_id=
  r.get(`${B}/calendario`, `tenant:${MOD}`, async (c) => {
    const q = c.url.searchParams, period = MONTH.test(q.get('period') || '') ? q.get('period') : today().slice(0, 7), emp = Number(q.get('employee_id')) || null;
    return json(await calendarioMes(c.env, c.businessId, period, emp));
  });
  // Prestaciones sociales del año: lo causado hasta hoy por persona, lo que vence y el estado de cada pago. GET /api/nomina/prestaciones?year=
  r.get(`${B}/prestaciones`, `tenant:${MOD}`, async (c) => json(await prestacionesAnio(c.env, c.businessId, Number(c.url.searchParams.get('year')) || +today().slice(0, 4))));
  // Contratistas del mes con sus cargos separados y su cuenta de cobro en Finanzas. POST genera o actualiza todo el mes de una vez.
  r.get(`${B}/servicios`, `manager:${MOD}`, async (c) => {
    const period = MONTH.test(c.url.searchParams.get('period') || '') ? c.url.searchParams.get('period') : today().slice(0, 7);
    return json({ period, contratistas: await cuentasServicios(c.env, c.businessId, period), finanzas: await orgUsa(c.env, c.businessId, 'finanzas') });
  });
  r.post(`${B}/servicios/generar`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req).catch(() => ({})), period = MONTH.test(b.period || '') ? b.period : today().slice(0, 7);
    const res = await automatizarMes(c.env, c.businessId, period);
    await audit(c, `Dejó al día la nómina de ${period} y las cuentas de cobro de los contratistas (${res.cuentas_de_cobro || 0})`, { modulo: MOD });
    return json({ period, ...res });
  });

  /* ---- corridas ---- */
  r.get(`${B}/runs`, `tenant:${MOD}`, async (c) => json({ rows: await all(c.env, `SELECT r.*, (SELECT COUNT(*) FROM nom_run_lines l WHERE l.run_id = r.id) AS empleados FROM nom_runs r WHERE r.business_id = ? ORDER BY r.period DESC, r.id DESC LIMIT 200`, c.businessId) }));
  r.get(`${B}/runs/:id`, `tenant:${MOD}`, async (c) => {
    const run = await corrida(c);
    const lineas = await all(c.env, 'SELECT l.*, e.name, e.doc_number, e.position FROM nom_run_lines l JOIN nom_employees e ON e.id = l.employee_id WHERE l.business_id = ? AND l.run_id = ? ORDER BY e.name', c.businessId, run.id);
    return json({ run, lineas: lineas.map((l) => ({ ...l, detalle: JSON.parse(l.detalle || '{}') })) });
  });
  r.post(`${B}/runs`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const tipo = ['nomina', 'prima', 'cesantias'].includes(b.tipo) ? b.tipo : 'nomina', period = cast('periodo', 'month!', b.period), half = tipo === 'nomina' ? (HALF.includes(b.half) ? b.half : 'M') : 'M';
    if (tipo === 'prima' && !['06', '12'].includes(period.slice(5))) throw new HttpError(400, 'La prima se paga en junio y en diciembre');
    if (tipo === 'cesantias' && period.slice(5) !== '12') throw new HttpError(400, 'Las cesantías se liquidan en diciembre');
    let run = await one(c.env, 'SELECT * FROM nom_runs WHERE business_id = ? AND tipo = ? AND period = ? AND half = ?', c.businessId, tipo, period, half);
    if (run && run.status !== 'borrador') throw new HttpError(409, 'Esa nómina ya está aprobada: reábrela para recalcular');
    if (!run) {
      if (tipo === 'nomina' && half === '2' && !(await one(c.env, "SELECT 1 FROM nom_runs WHERE business_id = ? AND tipo = 'nomina' AND period = ? AND half = '1'", c.businessId, period)) && (await one(c.env, "SELECT 1 FROM nom_employees WHERE business_id = ? AND pay_freq = 'quincenal' AND status = 'activo'", c.businessId)))
        throw new HttpError(409, 'Liquida primero la primera quincena: la retención se calcula sobre el mes completo');
      const t = now();
      const res = await c.env.DB.prepare('INSERT INTO nom_runs (business_id, tipo, period, half, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(c.businessId, tipo, period, half, c.session.user_id, t, t).run();
      run = { id: res.meta.last_row_id, tipo, period, half };
    }
    const tot = await liquidarCorrida(c, run);
    await audit(c, `Liquidó ${tipo === 'nomina' ? 'la nómina' : tipo === 'prima' ? 'la prima' : 'las cesantías'} de ${period}${tipo === 'nomina' && half !== 'M' ? ` (${nombreHalf(half)})` : ''}: ${tot.empleados} personas, neto $${tot.neto.toLocaleString('es-CO')}`, { modulo: MOD });
    return json({ id: run.id, ...tot }, 201);
  });
  const cambiar = (accion, desde, hacia) => r.post(`${B}/runs/:id/${accion}`, `manager:${MOD}`, async (c) => {
    const run = await corrida(c);
    if (run.status !== desde) throw new HttpError(409, `Solo se puede ${accion} una nómina en estado «${desde}»`);
    if (accion === 'aprobar' && !(await one(c.env, 'SELECT 1 FROM nom_run_lines WHERE run_id = ? AND business_id = ?', run.id, c.businessId))) throw new HttpError(409, 'La nómina no tiene personas: revisa empleados y fechas');
    await c.env.DB.prepare('UPDATE nom_runs SET status = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(hacia, now(), run.id, c.businessId).run();
    await audit(c, `${accion === 'aprobar' ? 'Aprobó' : 'Reabrió'} la nómina ${run.period}`, { modulo: MOD });
    return json({ ok: true });
  });
  cambiar('aprobar', 'borrador', 'aprobada'); cambiar('reabrir', 'aprobada', 'borrador');
  r.post(`${B}/runs/:id/pagar`, `manager:${MOD}`, async (c) => {
    const run = await corrida(c), b = await readJson(c.req).catch(() => ({}));
    if (run.status !== 'aprobada') throw new HttpError(409, 'Aprueba la nómina antes de pagarla');
    const date = b.date ? cast('fecha', 'date', b.date) : today();
    const enFinanzas = await pagarCorrida(c, run, date, b.account_id);
    await c.env.DB.prepare("UPDATE nom_runs SET status = 'pagada', paid_at = ?, account_id = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(date, b.account_id ? Number(b.account_id) : null, now(), run.id, c.businessId).run();
    await audit(c, `Pagó la nómina ${run.period} por $${run.neto.toLocaleString('es-CO')}${enFinanzas ? ` (${enFinanzas} egresos en Finanzas)` : ''}`, { modulo: MOD });
    return json({ ok: true, egresos_en_finanzas: enFinanzas, finanzas: await orgUsa(c.env, c.businessId, 'finanzas') });
  });
  r.delete(`${B}/runs/:id`, `manager:${MOD}`, async (c) => {
    const run = await corrida(c);
    if (run.status === 'pagada') throw new HttpError(409, 'Una nómina pagada ya está en Finanzas: no se borra');
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM nom_run_lines WHERE run_id = ? AND business_id = ?').bind(run.id, c.businessId), c.env.DB.prepare('DELETE FROM nom_runs WHERE id = ? AND business_id = ?').bind(run.id, c.businessId)]);
    await audit(c, `Borró la nómina ${run.period}`, { modulo: MOD });
    return json({ ok: true });
  });

  r.get(`${B}/runs/:id/export`, `manager:${MOD}`, async (c) => {
    const run = await corrida(c), kind = c.url.searchParams.get('kind') === 'aportes' ? 'aportes' : 'pago';
    const lineas = await all(c.env, 'SELECT l.*, e.name, e.doc_type, e.doc_number, e.bank, e.account_type, e.account_number, e.eps, e.afp, e.arl, e.caja FROM nom_run_lines l JOIN nom_employees e ON e.id = l.employee_id WHERE l.business_id = ? AND l.run_id = ? ORDER BY e.name', c.businessId, run.id);
    const filas = kind === 'pago' ? [['Tipo doc', 'Documento', 'Nombre', 'Banco', 'Tipo de cuenta', 'Número de cuenta', 'Valor a pagar'], ...lineas.map((l) => [l.doc_type, l.doc_number, l.name, l.bank, l.account_type, l.account_number, l.neto])]
      : [['Documento', 'Nombre', 'EPS', 'AFP', 'ARL', 'Caja', 'IBC', 'Salud empleado', 'Pensión empleado', 'FSP', 'Salud empleador', 'Pensión empleador', 'ARL', 'Caja', 'SENA', 'ICBF', 'Total aportes'],
        ...lineas.map((l) => { const d = JSON.parse(l.detalle || '{}'), a = d.aportes || {}; return [l.doc_number, l.name, l.eps, l.afp, l.arl, l.caja, d.ibc, d.salud, d.pension, d.fsp, a.salud, a.pension, a.arl, a.caja, a.sena, a.icbf, (a.total || 0) + (d.descuentos_ley || 0)]; })];
    return new Response('﻿' + dineroCsv(filas), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="nomina-${run.period}-${kind}.csv"` } });
  });

  r.get(`${B}/runs/:id/desprendible/:empId`, `manager:${MOD}`, async (c) => {
    const run = await corrida(c);
    const l = await one(c.env, 'SELECT l.*, e.name, e.doc_type, e.doc_number, e.position, e.salary, e.start_date FROM nom_run_lines l JOIN nom_employees e ON e.id = l.employee_id WHERE l.business_id = ? AND l.run_id = ? AND l.employee_id = ?', c.businessId, run.id, Number(c.params.empId));
    if (!l) throw new HttpError(404, 'Esa persona no está en esta nómina');
    const d = JSON.parse(l.detalle || '{}'), esc = (s) => String(s ?? '').replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x])), m = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`;
    const fila = (x) => `<tr><td>${esc(x.c)}${x.nota ? `<small> · ${esc(x.nota)}</small>` : ''}</td><td class="n">${m(x.valor)}</td></tr>`;
    const dev = (d.conceptos || []).filter((x) => x.tipo === 'dev'), ded = (d.conceptos || []).filter((x) => x.tipo === 'ded');
    const titulo = run.tipo === 'nomina' ? `Desprendible de pago · ${run.period}${run.half === 'M' ? '' : ` · ${nombreHalf(run.half)}`}` : run.tipo === 'prima' ? `Prima de servicios · ${run.period}` : `Cesantías · ${run.period.slice(0, 4)}`;
    const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>${esc(titulo)} · ${esc(l.name)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:1.2rem;margin:0}table{width:100%;border-collapse:collapse;margin:8px 0 16px}td{padding:5px 4px;border-bottom:1px solid #ddd}td.n{text-align:right;white-space:nowrap}small{color:#666}.t td{font-weight:700;border-top:2px solid #111}.g{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:.9rem;margin:10px 0}@media print{.no{display:none}}</style>
<p class="no"><button onclick="print()">Imprimir</button></p><h1>${esc(c.ctx?.business?.name || '')}</h1><div>${esc(titulo)}</div>
<div class="g"><div><b>${esc(l.name)}</b></div><div>${esc(l.doc_type)} ${esc(l.doc_number)}</div><div>Cargo: ${esc(l.position || '—')}</div><div>Ingreso: ${esc(l.start_date)}</div><div>Salario base: ${m(l.salary)}</div><div>Días: ${esc(d.trabajados ?? d.dias ?? '')}</div></div>
<table><tr><td><b>Devengados</b></td><td></td></tr>${dev.map(fila).join('')}<tr class="t"><td>Total devengado</td><td class="n">${m(l.devengado)}</td></tr></table>
<table><tr><td><b>Deducciones</b></td><td></td></tr>${ded.map(fila).join('') || '<tr><td>—</td><td></td></tr>'}<tr class="t"><td>Total deducciones</td><td class="n">${m(l.deducciones)}</td></tr></table>
<table><tr class="t"><td>NETO A PAGAR</td><td class="n">${m(l.neto)}</td></tr></table>${d.ibc ? `<small>IBC para seguridad social: ${m(d.ibc)}</small>` : ''}</html>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });

  /* ---- liquidación de contrato ---- */
  const simular = async (c) => {
    const e = await api.get(c, 'employees', Number(c.params.id));
    const fin = DATE.test(c.url?.searchParams?.get('fin') || '') ? c.url.searchParams.get('fin') : today();
    return { e, fin };
  };
  const calcularLiq = async (c, e, fin, motivo, promedio) => {
    const p = await paramsNegocio(c.env, c.businessId, +fin.slice(0, 4));
    const vac = (await one(c.env, "SELECT COALESCE(SUM(quantity), 0) s FROM nom_novedades WHERE business_id = ? AND employee_id = ? AND kind = 'vacaciones'", c.businessId, e.id)).s;
    return liquidacionFinal(e, p, { fin, motivo, promedioVariable: promedio, vacacionesTomadas: vac });
  };
  const MOTIVOS = ['renuncia', 'sin_justa_causa', 'con_justa_causa', 'mutuo_acuerdo', 'terminacion_contrato'];
  r.get(`${B}/employees/:id/liquidacion`, `manager:${MOD}`, async (c) => {
    const { e, fin } = await simular(c), motivo = MOTIVOS.includes(c.url.searchParams.get('motivo')) ? c.url.searchParams.get('motivo') : 'renuncia';
    return json({ ...(await calcularLiq(c, e, fin, motivo, Number(c.url.searchParams.get('promedio_variable')) || 0)), nota: 'Sin el sueldo del último periodo: se paga en la nómina del mes del retiro. No incluye retención en la fuente sobre la liquidación.' });
  });
  r.post(`${B}/employees/:id/liquidacion`, `manager:${MOD}`, async (c) => {
    const e = await api.get(c, 'employees', Number(c.params.id)), b = await readJson(c.req);
    if (e.status === 'retirado' && await one(c.env, 'SELECT 1 FROM nom_settlements WHERE business_id = ? AND employee_id = ?', c.businessId, e.id)) throw new HttpError(409, 'Esa persona ya está liquidada');
    const fin = cast('fecha de retiro', 'date', b.fin) || today(), motivo = MOTIVOS.includes(b.motivo) ? b.motivo : 'renuncia';
    if (fin < e.start_date) throw new HttpError(400, 'El retiro no puede ser antes del ingreso');
    const liq = await calcularLiq(c, e, fin, motivo, Number(b.promedio_variable) || 0);
    const t = now(), res = await c.env.DB.prepare('INSERT INTO nom_settlements (business_id, employee_id, end_date, reason, total, detalle, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(c.businessId, e.id, fin, motivo, liq.total, JSON.stringify(liq), t, t).run();
    await c.env.DB.prepare("UPDATE nom_employees SET status = 'retirado', end_date = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(fin, t, e.id, c.businessId).run();
    let enFinanzas = false;
    if (b.pagar) {
      const date = b.date ? cast('fecha', 'date', b.date) : today();
      enFinanzas = await gastoFinanzas(c, { ref: `nomina:liq:${res.meta.last_row_id}`, date, amount: liq.total, description: `Liquidación de contrato · ${e.name}`, counterparty: e.name, category: 'Nómina - Liquidaciones', centro: e.cost_center, accountId: b.account_id });
      await c.env.DB.prepare("UPDATE nom_settlements SET status = 'pagada', paid_at = ?, account_id = ?, updated_at = ? WHERE id = ?").bind(date, b.account_id ? Number(b.account_id) : null, now(), res.meta.last_row_id).run();
    }
    await audit(c, `Liquidó el contrato de ${e.name} (${motivo}) por $${liq.total.toLocaleString('es-CO')}`, { modulo: MOD });
    return json({ id: res.meta.last_row_id, ...liq, en_finanzas: enFinanzas }, 201);
  });
  r.get(`${B}/liquidaciones`, `tenant:${MOD}`, async (c) => json({ rows: (await all(c.env, 'SELECT s.*, e.name FROM nom_settlements s JOIN nom_employees e ON e.id = s.employee_id WHERE s.business_id = ? ORDER BY s.end_date DESC', c.businessId)).map((s) => ({ ...s, detalle: JSON.parse(s.detalle || '{}') })) }));
}

// Trae el equipo de una app (Equipo de Academia, por ejemplo): empleados por `ref` (no se duplican) y honorarios del mes de quienes cobran por clase u hora.
//   { empleados: [{ ref, name, doc_type, doc_number, email, phone, position, contract_type, salary, start_date, cost_center, notes }], novedades: [{ ref, period, amount, note }] }
export async function importarEquipo(env, app, negocio, data = {}) {
  const biz = `${app}:${negocio}`, t = now(), out = { creados: 0, actualizados: 0, honorarios: 0, omitidos: 0 };
  const TIPOS = ['indefinido', 'fijo', 'obra_labor', 'aprendizaje', 'prestacion'], DOCS = ['CC', 'NIT', 'CE', 'PPT', 'PEP', 'PA', 'TI'];
  for (const e of (Array.isArray(data.empleados) ? data.empleados : []).slice(0, 500)) {
    const ref = String(e.ref || '').slice(0, 80), name = String(e.name || '').trim().slice(0, 300);
    if (!ref || !name) { out.omitidos++; continue; }
    const doc = DOCS.includes(e.doc_type) ? e.doc_type : 'CC', num = e.doc_number ? String(e.doc_number).slice(0, 40) : null;
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e.email || '')) ? String(e.email).toLowerCase().slice(0, 254) : null, phone = e.phone ? String(e.phone).slice(0, 40) : null;
    const prev = await one(env, 'SELECT id FROM nom_employees WHERE business_id = ? AND ext_ref = ?', biz, ref);
    if (prev) {
      await env.DB.prepare('UPDATE nom_employees SET name = ?, doc_type = ?, doc_number = COALESCE(?, doc_number), email = COALESCE(?, email), phone = COALESCE(?, phone), updated_at = ? WHERE id = ? AND business_id = ?').bind(name, doc, num, email, phone, t, prev.id, biz).run();
      out.actualizados++; continue;
    }
    const tipo = TIPOS.includes(e.contract_type) ? e.contract_type : 'indefinido', start = DATE.test(String(e.start_date || '')) ? e.start_date : today();
    await env.DB.prepare('INSERT INTO nom_employees (business_id, name, doc_type, doc_number, email, phone, position, contract_type, salary, start_date, cost_center, notes, ext_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(biz, name, doc, num, email, phone, e.position ? String(e.position).slice(0, 300) : null, tipo, Math.max(0, Math.round(+e.salary || 0)), start, e.cost_center ? String(e.cost_center).slice(0, 300) : null, e.notes ? String(e.notes).slice(0, 1000) : null, ref, t, t).run();
    out.creados++;
  }
  // Honorarios por clase u hora: una novedad por clase dictada (con su detalle). Se refrescan por origen (`src`) sin duplicar.
  const grupos = new Map();
  for (const n of (Array.isArray(data.novedades) ? data.novedades : []).slice(0, 2000)) {
    const emp = await one(env, 'SELECT id FROM nom_employees WHERE business_id = ? AND ext_ref = ?', biz, String(n.ref || ''));
    if (!emp || !MONTH.test(String(n.period || ''))) { out.omitidos++; continue; }
    const k = `${emp.id}|${n.period}`;
    if (!grupos.has(k)) grupos.set(k, { emp: emp.id, ref: String(n.ref).slice(0, 60), period: n.period, filas: [] });
    grupos.get(k).filas.push(n);
  }
  for (const g of grupos.values()) {
    if (await one(env, "SELECT 1 FROM nom_runs WHERE business_id = ? AND tipo = 'nomina' AND period = ? AND status <> 'borrador'", biz, g.period)) { out.omitidos += g.filas.length; continue; }   // mes ya cerrado
    const src = `academia:honorarios:${g.ref}:${g.period}`;
    await env.DB.prepare('DELETE FROM nom_novedades WHERE business_id = ? AND employee_id = ? AND src = ?').bind(biz, g.emp, src).run();
    for (const n of g.filas) {
      const amount = Math.round(+n.amount || 0);
      if (amount <= 0) continue;
      await env.DB.prepare("INSERT INTO nom_novedades (business_id, employee_id, period, half, kind, quantity, amount, note, src, created_at, updated_at) VALUES (?, ?, ?, 'M', 'honorarios', 0, ?, ?, ?, ?, ?)").bind(biz, g.emp, g.period, amount, n.note ? String(n.note).slice(0, 300) : null, src, t, t).run();
      out.honorarios++;
    }
  }
  out.automatico = await automatizarMes(env, biz, today().slice(0, 7)).catch((e) => ({ error: e.message }));
  return out;
}

/* ---------------- automático: la nómina del mes y las cuentas de cobro de los contratistas ---------------- */
const ultimoDia = (period) => `${period}-${String(new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`;

// Contratistas del mes con todos sus cargos separados. Con `crear`, deja (o refresca, mientras no esté pagada) la cuenta de cobro de cada uno en Finanzas.
export async function cuentasServicios(env, biz, period, { crear = false } = {}) {
  const p = await paramsNegocio(env, biz, +period.slice(0, 4));
  const emps = (await all(env, "SELECT * FROM nom_employees WHERE business_id = ? AND contract_type = 'prestacion' ORDER BY name", biz)).filter((e) => vinculada(e, period));
  const usaFinanzas = crear && await orgUsa(env, biz, 'finanzas'), out = [];
  for (const e of emps) {
    const nov = await all(env, "SELECT kind, quantity, amount, note FROM nom_novedades WHERE business_id = ? AND employee_id = ? AND period = ? AND half IN ('M')", biz, e.id, period);
    const d = liquidarEmpleado(e, nov, p, { period, half: 'M' });
    const lineas = [];   // cada cargo por separado: honorarios fijos, cada clase o servicio, descuentos y la retención
    const fijo = d.conceptos.find((x) => x.c === 'Honorarios mensuales');
    if (fijo) lineas.push({ concepto: 'Honorarios mensuales', detalle: fijo.nota || '', valor: fijo.valor });
    for (const n of nov.filter((x) => x.kind === 'honorarios' && x.amount > 0)) lineas.push({ concepto: n.note || 'Honorarios por servicios', detalle: '', valor: r0(n.amount) });
    for (const x of d.conceptos.filter((c) => c.tipo === 'ded')) lineas.push({ concepto: x.c, detalle: '', valor: -x.valor });
    const bruto = d.devengado, neto = d.neto;
    let factura = null;
    if (usaFinanzas && bruto > 0) factura = await upsertCuenta(env, biz, e, period, lineas, neto);
    else if (bruto > 0) { const f = await one(env, 'SELECT id, number, total, paid, status FROM fin_invoices WHERE business_id = ? AND ref = ?', biz, `nomina:serv:${e.id}:${period}`).catch(() => null); if (f) factura = f; }
    out.push({ empleado: { id: e.id, name: e.name, doc_type: e.doc_type, doc_number: e.doc_number, position: e.position, cost_center: e.cost_center }, lineas, bruto, retencion: d.retencion, otros: d.otros_descuentos, neto, factura });
  }
  return out;
}
async function upsertCuenta(env, biz, e, period, lineas, neto) {
  const ref = `nomina:serv:${e.id}:${period}`, t = now();
  const items = JSON.stringify(lineas.map((l) => ({ concepto: String(l.concepto).slice(0, 300), detalle: l.detalle ? String(l.detalle).slice(0, 300) : undefined, cantidad: 1, moneda: 'COP', valor: l.valor, total: l.valor })));
  let cc = null;
  if (e.cost_center) {
    cc = (await one(env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(name) = lower(?)', biz, e.cost_center))?.id;
    if (!cc) cc = (await env.DB.prepare("INSERT INTO fin_cost_centers (business_id, name, kind, active, created_at, updated_at) VALUES (?, ?, 'departamento', 1, ?, ?)").bind(biz, e.cost_center, t, t).run()).meta.last_row_id;
  }
  const concept = `Cuenta de cobro por servicios · ${period}`, tax = e.doc_number ? `${e.doc_type} ${e.doc_number}` : null;
  const prev = await one(env, 'SELECT id, number, total, paid, status FROM fin_invoices WHERE business_id = ? AND ref = ?', biz, ref);
  if (prev) {
    if (prev.status === 'pendiente' && prev.paid === 0) {   // mientras no se haya pagado, sigue las clases que se van dictando
      await env.DB.prepare('UPDATE fin_invoices SET counterparty = ?, tax_id = ?, concept = ?, items = ?, subtotal = ?, total = ?, cost_center_id = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(e.name, tax, concept, items, neto, neto, cc, t, prev.id, biz).run();
      return { id: prev.id, number: prev.number, total: neto, paid: 0, status: 'pendiente' };
    }
    return prev;
  }
  const number = `CS-${period.replace('-', '')}-${e.id}`, hoy = today();
  const res = await env.DB.prepare(`INSERT INTO fin_invoices (business_id, kind, number, counterparty, tax_id, issue_date, due_date, concept, items, subtotal, tax, total, paid, status, cost_center_id, category, ref, created_at, updated_at)
    VALUES (?, 'recibida', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 'pendiente', ?, 'Nómina - Servicios', ?, ?, ?)`).bind(biz, number, e.name, tax, hoy, addDays(hoy > ultimoDia(period) ? hoy : ultimoDia(period), 10), concept, items, neto, neto, cc, ref, t, t).run();
  return { id: res.meta.last_row_id, number, total: neto, paid: 0, status: 'pendiente' };
}
// Deja lista la nómina del mes (borrador al día) y las cuentas de cobro de los contratistas. No toca nada que ya esté aprobado o pagado.
export async function automatizarMes(env, biz, period) {
  const hay = await one(env, "SELECT COUNT(*) n FROM nom_employees WHERE business_id = ? AND status = 'activo'", biz);
  if (!hay.n) return { empleados: 0 };
  const c = { env, businessId: biz };
  let run = await one(env, "SELECT * FROM nom_runs WHERE business_id = ? AND tipo = 'nomina' AND period = ? AND half = 'M'", biz, period);
  let nomina = null;
  if (!run) {
    const t = now(), res = await env.DB.prepare("INSERT INTO nom_runs (business_id, tipo, period, half, created_by, created_at, updated_at) VALUES (?, 'nomina', ?, 'M', 'automático', ?, ?)").bind(biz, period, t, t).run();
    run = { id: res.meta.last_row_id, tipo: 'nomina', period, half: 'M', status: 'borrador' };
  }
  if (run.status === 'borrador') nomina = await liquidarCorrida(c, run);
  const servicios = await cuentasServicios(env, biz, period, { crear: true });
  return { run: run.id, estado: run.status, nomina, cuentas_de_cobro: servicios.filter((x) => x.factura).length };
}
// Tarea diaria: cada negocio con Nómina deja el mes al día.
export async function daily(env) {
  const orgs = await all(env, "SELECT DISTINCT business_id FROM nom_employees WHERE status = 'activo'");
  let n = 0;
  for (const { business_id } of orgs) { if (await orgUsa(env, business_id, 'nomina')) { await automatizarMes(env, business_id, today().slice(0, 7)).catch((e) => console.error('nómina automática', e.message)); n++; } }
  return n;
}

/* ---------------- calendario: cuándo se paga, a quién y cuánto cuesta cada persona ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');
// Fechas de pago por defecto de un mes: mensual el último día del mes, quincenal el 15 y el último, semanal cada viernes.
export function fechasDePago(period, freq) {
  const ult = ultimoDia(period), [y, m] = period.split('-').map(Number);
  if (freq === 'quincenal') return [{ fecha: `${period}-15`, etiqueta: 'Primera quincena', parte: 0.5 }, { fecha: ult, etiqueta: 'Segunda quincena', parte: 0.5 }];
  if (freq === 'semanal') {
    const dias = [];
    for (let d = 1; d <= +ult.slice(8); d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5) dias.push(`${period}-${pad2(d)}`);
    return dias.map((fecha, i) => ({ fecha, etiqueta: `Semana ${i + 1}`, parte: 1 / dias.length }));
  }
  return [{ fecha: ult, etiqueta: 'Pago del mes', parte: 1 }];
}
export async function calendarioMes(env, biz, period, empId = null) {
  const p = await paramsNegocio(env, biz, +period.slice(0, 4));
  let emps = (await all(env, "SELECT * FROM nom_employees WHERE business_id = ? ORDER BY name", biz)).filter((e) => vinculada(e, period));
  if (empId) emps = emps.filter((e) => e.id === empId);
  const eventos = [], tot = { empleados: 0, eps: 0, afp: 0, arl: 0, caja: 0, sena: 0, icbf: 0, dian: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0, devengado: 0, aportes: 0, provisiones: 0, costo: 0 };
  const empleados = [];
  for (const e of emps) {
    const nov = await all(env, 'SELECT kind, quantity, amount, note FROM nom_novedades WHERE business_id = ? AND employee_id = ? AND period = ?', biz, e.id, period);
    const d = liquidarEmpleado({ ...e, pay_freq: 'mensual' }, nov, p, { period, half: 'M' });
    const a = d.aportes, pr = d.provisiones;
    const partes = { empleado: d.neto, eps: d.salud + a.salud, afp: d.pension + d.fsp + a.pension, arl: a.arl, caja: a.caja, sena: a.sena, icbf: a.icbf, dian: d.retencion, cesantias: pr.cesantias, intereses: pr.intereses, prima: pr.prima, vacaciones: pr.vacaciones };
    const fechas = fechasDePago(period, e.pay_freq);
    let resto = d.neto;
    const pagos = fechas.map((f, i) => { const valor = i === fechas.length - 1 ? resto : Math.round(d.neto * f.parte); resto -= valor; return { fecha: f.fecha, etiqueta: f.etiqueta, valor }; });
    for (const g of pagos) eventos.push({ fecha: g.fecha, tipo: 'pago', titulo: e.name, detalle: g.etiqueta, valor: g.valor, empleado_id: e.id });
    for (const k of ['eps', 'afp', 'arl', 'caja', 'sena', 'icbf', 'dian', 'cesantias', 'intereses', 'prima', 'vacaciones']) tot[k] += partes[k];
    tot.empleados += d.neto; tot.devengado += d.devengado; tot.aportes += a.total; tot.provisiones += pr.total; tot.costo += d.costo;
    empleados.push({ id: e.id, name: e.name, position: e.position, contract_type: e.contract_type, pay_freq: e.pay_freq, status: e.status, pagos, devengado: d.devengado, neto: d.neto, deducciones: d.deducciones, aportes: a.total, provisiones: pr.total, costo: d.costo, ibc: d.ibc, partes,
      desglose: { salud_empleado: d.salud, pension_empleado: d.pension, fsp: d.fsp, retencion: d.retencion, otros_descuentos: d.otros_descuentos, aportes: a, provisiones: pr }, conceptos: d.conceptos });
  }
  // Obligaciones del mes: aportes y retención del mes anterior (según el último dígito del NIT) y las prestaciones sociales
  const y = +period.slice(0, 4), mm = period.slice(5, 7);
  const prest = async (tipo, mes) => emps.reduce((v, e) => { const x = prestacion(e, p, tipo, { period: `${y}-${mes}` }); return v + x.valor + x.intereses; }, 0);
  if (!empId || emps.length) {
    eventos.push({ fecha: `${period}-02`, hasta: `${period}-15`, tipo: 'obligacion', titulo: 'Planilla de aportes (PILA) del mes anterior', detalle: 'Entre el 2.º y el 15.º día hábil, según el último dígito del NIT o documento', valor: null });
    eventos.push({ fecha: `${period}-10`, hasta: `${period}-24`, tipo: 'obligacion', titulo: 'Retención en la fuente del mes anterior', detalle: 'Según el último dígito del NIT (calendario tributario de la DIAN)', valor: null });
    if (mm === '01') eventos.push({ fecha: `${period}-31`, tipo: 'prestacion', titulo: 'Consignar los intereses sobre cesantías', detalle: 'Hasta el 31 de enero (o pagarlos directo al empleado)', valor: null });
    if (mm === '02') eventos.push({ fecha: `${period}-14`, tipo: 'prestacion', titulo: 'Consignar las cesantías al fondo', detalle: 'Hasta el 14 de febrero', valor: null });
    if (mm === '06') eventos.push({ fecha: `${period}-30`, tipo: 'prestacion', titulo: 'Prima de servicios (1.er semestre)', detalle: 'Hasta el 30 de junio', valor: await prest('prima', '06') });
    if (mm === '12') eventos.push({ fecha: `${period}-20`, tipo: 'prestacion', titulo: 'Prima de servicios (2.º semestre)', detalle: 'Hasta el 20 de diciembre', valor: await prest('prima', '12') });
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === 'pago' ? -1 : 1));
  return { period, ultimo_dia: ultimoDia(period), totales: tot, empleados, eventos };
}

/* ---------------- prestaciones sociales: lo causado, lo que se debe y cuándo vence ---------------- */
export async function prestacionesAnio(env, biz, year) {
  const hoy = today(), p = await paramsNegocio(env, biz, year), semestre = hoy.slice(0, 4) !== String(year) ? '12' : hoy.slice(5, 7) <= '06' ? '06' : '12';
  const emps = (await all(env, "SELECT * FROM nom_employees WHERE business_id = ? AND status = 'activo' ORDER BY name", biz)).filter((e) => e.start_date.slice(0, 4) <= String(year));
  const corte = `${year}-12-30` < hoy ? `${year}-12-30` : hoy;
  const runs = await all(env, "SELECT tipo, period, status, neto, id FROM nom_runs WHERE business_id = ? AND tipo IN ('prima', 'cesantias') AND substr(period, 1, 4) = ?", biz, String(year));
  const personas = [], tot = { cesantias: 0, intereses: 0, prima: 0, vacaciones: 0, vacaciones_dias: 0 };
  for (const e of emps) {
    if (e.contract_type === 'prestacion') continue;   // los contratistas no causan prestaciones
    const ces = prestacion(e, p, 'cesantias', { period: `${year}-12`, corte }), pri = prestacion(e, p, 'prima', { period: `${year}-${semestre}`, corte });
    const tomadas = (await one(env, "SELECT COALESCE(SUM(quantity), 0) s FROM nom_novedades WHERE business_id = ? AND employee_id = ? AND kind = 'vacaciones'", biz, e.id)).s;
    const causadas = Math.round(((15 * dias360(e.start_date, hoy > (e.end_date || '9999') ? e.end_date : hoy)) / 360) * 100) / 100, pend = Math.max(0, Math.round((causadas - tomadas) * 100) / 100);
    const valorVac = e.contract_type === 'aprendizaje' ? 0 : r0(((+e.salary || 0) / 30) * pend);
    const aplica = ces.valor > 0 || pri.valor > 0;
    personas.push({ id: e.id, name: e.name, position: e.position, start_date: e.start_date, aplica, motivo: e.salary_type === 'integral' ? 'Salario integral: no causa cesantías ni prima' : e.contract_type === 'aprendizaje' ? 'Aprendizaje: sin prestaciones' : null,
      cesantias: ces.valor, intereses: ces.intereses, prima: pri.valor, base: ces.base, dias_anio: ces.dias, dias_semestre: pri.dias, vacaciones: { causadas, tomadas, pendientes: pend, valor: valorVac }, total: ces.valor + ces.intereses + pri.valor + valorVac });
    tot.cesantias += ces.valor; tot.intereses += ces.intereses; tot.prima += pri.valor; tot.vacaciones += valorVac; tot.vacaciones_dias += pend;
  }
  const estado = (tipo, period) => { const r = runs.find((x) => x.tipo === tipo && x.period === period); return r ? { status: r.status, run_id: r.id, neto: r.neto } : null; };
  const f = (fecha, que, tipo, period, valor) => ({ fecha, que, tipo, period, valor, estado: tipo ? estado(tipo, period) : null, vencida: fecha < hoy });
  const hitos = [
    f(`${year}-01-31`, `Intereses de cesantías ${year - 1}`, null, null, null),
    f(`${year}-02-14`, `Cesantías ${year - 1} al fondo`, null, null, null),
    f(`${year}-06-30`, 'Prima de servicios (1.er semestre)', 'prima', `${year}-06`, semestre === '06' ? tot.prima : null),
    f(`${year}-12-20`, 'Prima de servicios (2.º semestre)', 'prima', `${year}-12`, semestre === '12' ? tot.prima : null),
  ];
  return { year, hoy, semestre, parametros_estimados: p.estimado, personas, totales: { ...tot, total: tot.cesantias + tot.intereses + tot.prima + tot.vacaciones },
    hitos, cesantias_anio: { fecha: `${year + 1}-02-14`, valor: tot.cesantias, intereses: tot.intereses, estado: estado('cesantias', `${year}-12`) } };
}

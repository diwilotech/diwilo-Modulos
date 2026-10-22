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
import { crud, cast, today, now, all, one, DATE, MONTH } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { orgUsa } from '../../lib/contexto.js';
import { KINDS, paramsDe, liquidarEmpleado, prestacion, liquidacionFinal, r0 } from './calculo.js';

const MOD = 'nomina', B = '/api/nomina';
const HALF = ['M', '1', '2'];

export const ENTITIES = {
  employees: { table: 'nom_employees', label: 'el empleado', title: 'name', search: ['name', 'doc_number', 'position'], order: "status, name", leer: 'manager', crear: 'manager',
    fields: { name: 'text!', doc_type: ['CC', 'CE', 'PPT', 'PEP', 'PA', 'TI'], doc_number: 'text', email: 'email', phone: 'text', position: 'text',
      contract_type: ['indefinido', 'fijo', 'obra_labor', 'aprendizaje'], salary_type: ['ordinario', 'integral'], salary: 'money', aux_transporte: 'bool+', arl_risk: 'int', pay_freq: ['mensual', 'quincenal'],
      start_date: 'date!', contract_end: 'date', end_date: 'date', status: ['activo', 'retirado'], eps: 'text', afp: 'text', arl: 'text', caja: 'text', cesantias_fund: 'text',
      bank: 'text', account_type: 'text', account_number: 'text', cost_center: 'text', dependientes: 'bool', deduc_vivienda: 'money', deduc_prepagada: 'money', notes: 'long' },
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
      if ((run.half === 'M') !== (e.pay_freq === 'mensual')) continue;
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
async function gastoFinanzas(c, { ref, date, amount, description, counterparty, category, centro, accountId }) {
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
  const res = await c.env.DB.prepare('INSERT OR IGNORE INTO fin_movements (business_id, kind, date, amount, category, description, counterparty, cost_center_id, account_id, ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(c.businessId, 'gasto', date, r0(amount), category, String(description).slice(0, 300), counterparty ? String(counterparty).slice(0, 200) : null, cc, acc, ref, t, t).run();
  return !!res.meta.changes;
}
async function pagarCorrida(c, run, date, accountId) {
  const lineas = await all(c.env, 'SELECT l.*, e.cost_center, e.name FROM nom_run_lines l JOIN nom_employees e ON e.id = l.employee_id WHERE l.business_id = ? AND l.run_id = ?', c.businessId, run.id);
  const etiqueta = run.tipo === 'nomina' ? `Nómina ${run.period}${run.half === 'M' ? '' : ` (${nombreHalf(run.half)})`}` : run.tipo === 'prima' ? `Prima de servicios ${run.period}` : `Cesantías e intereses ${run.period.slice(0, 4)}`;
  const porCentro = new Map();
  for (const l of lineas) porCentro.set(l.cost_center || '', (porCentro.get(l.cost_center || '') || 0) + l.neto);
  let enviados = 0;
  for (const [cc, neto] of porCentro) if (await gastoFinanzas(c, { ref: `nomina:run:${run.id}:neto:${cc.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, date, amount: neto, description: `${etiqueta} · pago a empleados`, counterparty: 'Empleados', category: 'Nómina', centro: cc || null, accountId })) enviados++;
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

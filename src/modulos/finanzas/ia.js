// Herramientas de IA del módulo Finanzas (MCP del negocio): las mismas de IA Diwilo para Finanzas.
// Siempre trabajan sobre c.businessId y con las reglas de la API (validación, TRM, referencias del mismo negocio y bitácora).
import { financeSummary, ENTITIES, chargeRecurring, reportData } from './api.js';
import { crud, today, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { Router } from '../../router.js';

const api = crud(new Router(), { base: '/ia/finanzas', modulo: 'finanzas', entities: ENTITIES });
const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });
const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
const num = (description) => ({ type: 'number', ...(description ? { description } : {}) });
const ref = str('Nombre o id');

// Centro de costo o cuenta por nombre o id (del mismo negocio). undefined = no se mencionó.
async function finRef(c, kind, v) {
  if (v === undefined || v === null || v === '') return undefined;
  const table = kind === 'cc' ? 'fin_cost_centers' : 'fin_accounts';
  const row = /^\d+$/.test(String(v)) ? await one(c.env, `SELECT id FROM ${table} WHERE id = ? AND business_id = ?`, Number(v), c.businessId)
    : await one(c.env, `SELECT id FROM ${table} WHERE business_id = ? AND lower(name) LIKE ? ORDER BY length(name) LIMIT 1`, c.businessId, `%${String(v).toLowerCase()}%`);
  if (!row) throw new Error(`No encontré ${kind === 'cc' ? 'el centro de costo' : 'la cuenta'} «${v}» (mira finanzas_ver_centros_y_cuentas)`);
  return row.id;
}
async function cobrosHechos(c, recId, dates) {
  const rec = await api.get(c, 'recurring', recId), out = [];
  for (const d of [...new Set(dates)].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x <= today()).sort()) out.push({ fecha: d, nuevo: !!(await chargeRecurring(c.env, rec, d)).meta.changes });
  return out;
}

export default [
  /* ---------- lectura ---------- */
  {
    name: 'finanzas.resumen_mes', modulo: 'finanzas', rol: 'admin', tipo: 'lectura',
    description: 'Ingresos, gastos, resultado, presupuesto, cartera por cobrar y por pagar, flujo de caja y saldos de cuentas de un mes (pesos colombianos).',
    inputSchema: S({ mes: str('AAAA-MM (por defecto el actual)') }),
    run: async (c, a) => {
      const s = await financeSummary(c, a.mes);
      return { mes: s.month, totales: s.totals, cartera_por_cobrar: { total: s.receivable.total, vencido: s.receivable.overdue }, por_pagar: { total: s.payable.total, vencido: s.payable.overdue },
        gastos_por_categoria: s.expense_by_category, flujo_de_caja: s.cash_flow, cuentas: s.accounts, recurrentes_al_mes: s.recurring_total };
    },
  },
  {
    name: 'finanzas.cartera', modulo: 'finanzas', rol: 'admin', tipo: 'lectura',
    description: 'Facturas y cuentas de cobro pendientes o vencidas (por cobrar y por pagar), con días de atraso y saldo.',
    inputSchema: S({}),
    run: async (c) => { const s = await financeSummary(c); return { por_cobrar: s.receivable, por_pagar: s.payable }; },
  },
  {
    name: 'finanzas.ver_centros_y_cuentas', modulo: 'finanzas', rol: 'admin', tipo: 'lectura',
    description: 'Centros de costo (proyectos, clientes, áreas) y cuentas (bancos, tarjetas, Nequi) con su id y nombre. Úsalo antes de asignar un gasto a un centro de costo o una cuenta.',
    inputSchema: S({}),
    run: async (c) => ({
      centros_de_costo: await all(c.env, 'SELECT id, name nombre, kind tipo, code codigo, active activo FROM fin_cost_centers WHERE business_id = ? ORDER BY active DESC, name', c.businessId),
      cuentas: await all(c.env, 'SELECT id, name nombre, kind tipo, bank banco FROM fin_accounts WHERE business_id = ? ORDER BY name', c.businessId),
    }),
  },
  {
    name: 'finanzas.ver_gastos_recurrentes', modulo: 'finanzas', rol: 'admin', tipo: 'lectura',
    description: 'Gastos recurrentes con id, valor (pesos o dólares), ciclo, próximo cobro, centro de costo y cuenta. Úsalo antes de crear uno (para no duplicar) o para editarlo.',
    inputSchema: S({}),
    run: async (c) => ({ recurrentes: await all(c.env, `SELECT r.id, r.name nombre, r.vendor proveedor, r.category tipo, r.currency moneda, r.amount_usd dolares, r.amount pesos, r.cycle ciclo, r.next_date proximo_cobro, r.active activo,
      cc.name centro_costo, ac.name cuenta FROM fin_recurring r LEFT JOIN fin_cost_centers cc ON cc.id = r.cost_center_id AND cc.business_id = r.business_id
      LEFT JOIN fin_accounts ac ON ac.id = r.account_id AND ac.business_id = r.business_id WHERE r.business_id = ? ORDER BY r.active DESC, r.next_date`, c.businessId) }),
  },
  {
    name: 'finanzas.buscar_movimientos', modulo: 'finanzas', rol: 'admin', tipo: 'lectura',
    description: 'Busca ingresos y gastos ya registrados (por texto, mes, tipo o los que no tienen centro de costo) con su id, fecha, monto, centro de costo y cuenta. Úsalo antes de registrar uno (para no duplicar) o para editarlos.',
    inputSchema: S({ texto: str(), mes: str('AAAA-MM'), tipo: { type: 'string', enum: ['ingreso', 'gasto'] }, sin_centro: { type: 'boolean' } }),
    run: async (c, a) => ({ movimientos: await all(c.env, `SELECT m.id, m.kind tipo, m.date fecha, m.amount pesos, m.currency moneda, m.amount_usd dolares, m.description descripcion, m.counterparty tercero, m.category categoria, cc.name centro_costo, ac.name cuenta
      FROM fin_movements m LEFT JOIN fin_cost_centers cc ON cc.id = m.cost_center_id AND cc.business_id = m.business_id LEFT JOIN fin_accounts ac ON ac.id = m.account_id AND ac.business_id = m.business_id
      WHERE m.business_id = ? AND (? = '' OR lower(COALESCE(m.description, '') || ' ' || COALESCE(m.counterparty, '') || ' ' || COALESCE(m.category, '')) LIKE ?) AND (? = '' OR m.date LIKE ?)
        AND (? = 0 OR m.cost_center_id IS NULL) AND (? = '' OR m.kind = ?) ORDER BY m.date DESC, m.id DESC LIMIT 50`,
      c.businessId, a.texto || '', `%${String(a.texto || '').toLowerCase()}%`, a.mes || '', `${a.mes || ''}%`, a.sin_centro ? 1 : 0, a.tipo || '', a.tipo || '') }),
  },
  {
    name: 'finanzas.datos_informe', modulo: 'finanzas', rol: 'admin', tipo: 'lectura',
    description: 'Datos del mes y la instrucción del analista para escribir el informe de finanzas. Escríbelo con esto y guárdalo con finanzas_guardar_informe.',
    inputSchema: S({ mes: str('AAAA-MM') }),
    run: (c, a) => reportData(c, a.mes),
  },
  {
    name: 'finanzas.ver_informes', modulo: 'finanzas', rol: 'admin', tipo: 'lectura',
    description: 'Informes de finanzas guardados (los más recientes primero).',
    inputSchema: S({}),
    run: async (c) => ({ informes: await all(c.env, 'SELECT id, title titulo, content contenido, origen, created_at FROM fin_reports WHERE business_id = ? ORDER BY created_at DESC LIMIT 10', c.businessId) }),
  },
  /* ---------- acciones ---------- */
  {
    name: 'finanzas.crear_centro_costo', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Crea un centro de costo (a dónde se cargan gastos e ingresos): un proyecto, un cliente, una sede o un área. No crea uno que ya exista con ese nombre.',
    inputSchema: S({ nombre: str(), tipo: { type: 'string', enum: ['proyecto', 'app', 'cliente', 'departamento'] }, codigo: str(), notas: str() }, ['nombre']),
    run: async (c, a) => {
      const dup = await one(c.env, 'SELECT id FROM fin_cost_centers WHERE business_id = ? AND lower(trim(name)) = lower(trim(?))', c.businessId, String(a.nombre));
      if (dup) return { ya_existia: dup.id, nota: `El centro de costo «${a.nombre}» ya existe (#${dup.id}).` };
      return api.create(c, 'cost_centers', { name: a.nombre, kind: a.tipo || 'departamento', code: a.codigo, notes: a.notas });
    },
  },
  {
    name: 'finanzas.crear_cuenta', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Crea una cuenta (de dónde sale o a dónde entra la plata): banco, tarjeta, efectivo o billetera (Nequi, Daviplata). No crea una que ya exista con ese nombre.',
    inputSchema: S({ nombre: str(), tipo: { type: 'string', enum: ['banco', 'tarjeta', 'efectivo', 'billetera'] }, banco: str(), ultimos4: str(), saldo_inicial: num('Pesos') }, ['nombre']),
    run: async (c, a) => {
      const dup = await one(c.env, 'SELECT id FROM fin_accounts WHERE business_id = ? AND lower(trim(name)) = lower(trim(?))', c.businessId, String(a.nombre));
      if (dup) return { ya_existia: dup.id, nota: `La cuenta «${a.nombre}» ya existe (#${dup.id}).` };
      return api.create(c, 'accounts', { name: a.nombre, kind: a.tipo || 'banco', bank: a.banco, last4: a.ultimos4 ? String(a.ultimos4).slice(-4) : undefined, opening_balance: a.saldo_inicial });
    },
  },
  {
    name: 'finanzas.registrar_movimiento', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Registra un ingreso o un gasto (no repite uno igual ya registrado). En dólares, envía "dolares" y se pasa a pesos con la TRM oficial de esa fecha. Centro de costo y cuenta por nombre o id.',
    inputSchema: S({ tipo: { type: 'string', enum: ['ingreso', 'gasto'] }, monto: num('Pesos colombianos'), dolares: num(), fecha: str('AAAA-MM-DD (por defecto hoy)'),
      categoria: str(), descripcion: str(), tercero: str(), centro_costo: ref, cuenta: ref }, ['tipo']),
    run: async (c, a) => {
      if (!(a.monto > 0 || a.dolares > 0)) throw new Error('Falta el valor (en pesos o en dólares). Para crear un centro de costo usa finanzas_crear_centro_costo.');
      const date = a.fecha || today();
      const dup = await one(c.env, `SELECT id FROM fin_movements WHERE business_id = ? AND kind = ? AND date = ? AND lower(COALESCE(description, '')) = lower(?) AND (${a.dolares ? 'amount_usd = ?' : 'amount = ?'})`,
        c.businessId, a.tipo === 'ingreso' ? 'ingreso' : 'gasto', date, String(a.descripcion || ''), Number(a.dolares || a.monto));
      if (dup) return { ya_existia: dup.id, nota: `Ya estaba registrado (movimiento #${dup.id}). Para cambiarle algo usa finanzas_editar_movimiento.` };
      return { creado: await api.create(c, 'movements', { kind: a.tipo, date, ...(a.dolares ? { currency: 'USD', amount_usd: a.dolares } : { amount: a.monto }), category: a.categoria, description: a.descripcion,
        counterparty: a.tercero, cost_center_id: await finRef(c, 'cc', a.centro_costo), account_id: await finRef(c, 'acc', a.cuenta) }) };
    },
  },
  {
    name: 'finanzas.editar_movimiento', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Cambia uno o varios ingresos/gastos ya registrados (por id, ver finanzas_buscar_movimientos): centro de costo, cuenta, categoría, descripción, tercero o fecha.',
    inputSchema: S({ ids: { type: 'array', items: { type: 'number' } }, centro_costo: ref, cuenta: ref, categoria: str(), descripcion: str(), tercero: str(), fecha: str('AAAA-MM-DD') }, ['ids']),
    run: async (c, a) => {
      const ids = [].concat(a.ids || []).map(Number).filter(Boolean);
      if (!ids.length) throw new Error('Dime qué movimientos (sus id)');
      const body = {};
      if (a.centro_costo !== undefined) body.cost_center_id = (await finRef(c, 'cc', a.centro_costo)) ?? null;
      if (a.cuenta !== undefined) body.account_id = (await finRef(c, 'acc', a.cuenta)) ?? null;
      for (const [k, f] of [['categoria', 'category'], ['descripcion', 'description'], ['tercero', 'counterparty'], ['fecha', 'date']]) if (a[k] !== undefined) body[f] = a[k];
      if (!Object.keys(body).length) throw new Error('No me dijiste qué cambiar');
      for (const id of ids) await api.update(c, 'movements', id, body);
      return { editados: ids };
    },
  },
  {
    name: 'finanzas.crear_gasto_recurrente', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Agrega un gasto recurrente (arriendo, software, servicios…). No crea uno que ya exista con el mismo nombre. En dólares, da "dolares" y cada cobro se pasa a pesos con la TRM de su día. Los cobros que YA se hicieron van en "cobros_hechos" (se registran como gastos, sin repetir) y en "proximo_cobro" el siguiente que aún no pasa.',
    inputSchema: S({ nombre: str(), monto: num('Pesos'), dolares: num(), ciclo: { type: 'string', enum: ['mensual', 'anual'] }, proximo_cobro: str('AAAA-MM-DD'),
      cobros_hechos: { type: 'array', items: { type: 'string' } }, tipo: { type: 'string', enum: ['infraestructura', 'software', 'api', 'ia', 'marketing', 'otro'] }, proveedor: str(), centro_costo: ref, cuenta: ref }, ['nombre', 'proximo_cobro']),
    run: async (c, a) => {
      const hechos = Array.isArray(a.cobros_hechos) ? a.cobros_hechos : [];
      const dup = await one(c.env, 'SELECT id FROM fin_recurring WHERE business_id = ? AND lower(trim(name)) = lower(trim(?))', c.businessId, String(a.nombre));
      if (dup) { const cobros = hechos.length ? await cobrosHechos(c, dup.id, hechos) : []; return { ya_existia: dup.id, cobros_registrados: cobros, nota: 'Ya existía; no lo dupliqué. Para cambiarlo usa finanzas_editar_gasto_recurrente.' }; }
      if (!(a.monto > 0 || a.dolares > 0)) throw new Error('Falta el valor (en pesos o en dólares)');
      const r = await api.create(c, 'recurring', { name: a.nombre, ...(a.dolares ? { currency: 'USD', amount_usd: a.dolares, amount: 0 } : { amount: a.monto }), cycle: a.ciclo, next_date: a.proximo_cobro,
        category: a.tipo, vendor: a.proveedor, cost_center_id: await finRef(c, 'cc', a.centro_costo), account_id: await finRef(c, 'acc', a.cuenta) });
      return { ...r, cobros_registrados: hechos.length ? await cobrosHechos(c, r.id, hechos) : [] };
    },
  },
  {
    name: 'finanzas.editar_gasto_recurrente', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Cambia un gasto recurrente (por id o nombre): centro de costo, cuenta, valor (pesos o dólares), ciclo, próximo cobro, proveedor o si está activo. El centro de costo y la cuenta se ponen también en los gastos que ya generó (salvo "aplicar_a_cobros": false).',
    inputSchema: S({ id: num(), nombre: str(), centro_costo: ref, cuenta: ref, monto: num('Pesos'), dolares: num(), ciclo: { type: 'string', enum: ['mensual', 'anual'] },
      proximo_cobro: str('AAAA-MM-DD'), proveedor: str(), activo: { type: 'boolean' }, aplicar_a_cobros: { type: 'boolean' } }),
    run: async (c, a) => {
      const r = a.id ? await one(c.env, 'SELECT id, name FROM fin_recurring WHERE id = ? AND business_id = ?', Number(a.id), c.businessId)
        : await one(c.env, 'SELECT id, name FROM fin_recurring WHERE business_id = ? AND lower(name) LIKE ? ORDER BY active DESC, length(name) LIMIT 1', c.businessId, `%${String(a.nombre || '').toLowerCase()}%`);
      if (!r) throw new Error('No encontré ese gasto recurrente (mira finanzas_ver_gastos_recurrentes)');
      const body = {};
      if (a.centro_costo !== undefined) body.cost_center_id = (await finRef(c, 'cc', a.centro_costo)) ?? null;
      if (a.cuenta !== undefined) body.account_id = (await finRef(c, 'acc', a.cuenta)) ?? null;
      if (a.dolares) Object.assign(body, { currency: 'USD', amount_usd: a.dolares }); else if (a.monto) Object.assign(body, { currency: 'COP', amount: a.monto });
      for (const [k, f] of [['ciclo', 'cycle'], ['proximo_cobro', 'next_date'], ['proveedor', 'vendor']]) if (a[k] !== undefined) body[f] = a[k];
      if (a.activo !== undefined) body.active = !!a.activo;
      if (!Object.keys(body).length) throw new Error('No me dijiste qué cambiar');
      await api.update(c, 'recurring', r.id, body);
      let cobros = 0;
      if (a.aplicar_a_cobros !== false && ('cost_center_id' in body || 'account_id' in body)) {
        const sets = ['cost_center_id', 'account_id'].filter((k) => k in body);
        cobros = (await c.env.DB.prepare(`UPDATE fin_movements SET ${sets.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE business_id = ? AND kind = 'gasto' AND (recurring_id = ? OR lower(trim(description)) = lower(trim(?)))`)
          .bind(...sets.map((k) => body[k]), now(), c.businessId, r.id, r.name).run()).meta.changes;
      }
      return { id: r.id, editado: true, cobros_actualizados: cobros };
    },
  },
  {
    name: 'finanzas.crear_cuenta_cobro', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Crea una cuenta de cobro (por cobrar) con sus líneas; recibe consecutivo y queda lista en PDF en Finanzas → Facturas. Las líneas en dólares se pasan a pesos con la TRM oficial de la fecha.',
    inputSchema: S({ cliente: str(), nit: str(), ciudad: str(), correo: str(), fecha: str('AAAA-MM-DD'), vence: str('AAAA-MM-DD'), concepto: str('Párrafo que explica el cobro'), centro_costo: ref,
      lineas: { type: 'array', items: { type: 'object', properties: { concepto: str(), detalle: str(), cantidad: num(), valor: num('Pesos'), dolares: num() }, required: ['concepto'] } } }, ['cliente', 'lineas']),
    run: async (c, a) => {
      const items = (a.lineas || []).map((l) => ({ concepto: l.concepto, detalle: l.detalle, cantidad: l.cantidad || 1, moneda: l.dolares ? 'USD' : 'COP', valor: l.dolares || l.valor }));
      if (!items.length || items.some((i) => !(i.valor > 0))) throw new Error('Cada línea necesita concepto y valor');
      const date = a.fecha || today();
      const r = await api.create(c, 'invoices', { kind: 'emitida', counterparty: a.cliente, tax_id: a.nit, client_city: a.ciudad, client_email: a.correo, issue_date: date,
        due_date: a.vence || new Date(Date.parse(date + 'T12:00:00Z') + 15 * 864e5).toISOString().slice(0, 10), concept: a.concepto, items, cost_center_id: await finRef(c, 'cc', a.centro_costo) });
      const inv = await api.get(c, 'invoices', r.id);
      return { id: r.id, numero: inv.number, total: inv.total, pdf: `${c.url?.origin || ''}/api/finanzas/invoices/${r.id}/pdf` };
    },
  },
  {
    name: 'finanzas.guardar_informe', modulo: 'finanzas', rol: 'admin', tipo: 'escritura',
    description: 'Guarda en Finanzas → Informes el informe que escribiste con finanzas_datos_informe.',
    inputSchema: S({ titulo: str(), contenido: str('Texto del informe') }, ['contenido']),
    run: async (c, a) => {
      const t = now();
      const res = await c.env.DB.prepare("INSERT INTO fin_reports (business_id, title, content, origen, created_by, created_at, updated_at) VALUES (?, ?, ?, 'ia', ?, ?, ?)")
        .bind(c.businessId, String(a.titulo || `Finanzas · ${today()}`).slice(0, 200), String(a.contenido).slice(0, 20000), c.session?.user_id || null, t, t).run();
      await audit(c, 'Guardó un informe de finanzas', { modulo: 'finanzas' });
      return { id: res.meta.last_row_id };
    },
  },
];

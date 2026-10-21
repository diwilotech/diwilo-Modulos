// Control total de Finanzas por IA: lo que no cubren las herramientas de ia.js (facturas, pagos y recibos, presupuestos, conciliación,
// exportes, datos de cobro, borrar/editar). Llaman a las MISMAS rutas de la API (src/lib/interno.js): mismas reglas, roles y bitácora.
import { herramienta as H, crudHerramientas as CRUD } from '../../lib/interno.js';

const id = (d) => ({ type: 'integer', ...(d ? { description: d } : {}) });
const txt = (d) => ({ type: 'string', ...(d ? { description: d } : {}) });
const num = (d) => ({ type: 'number', ...(d ? { description: d } : {}) });
const bool = (d) => ({ type: 'boolean', ...(d ? { description: d } : {}) });
const fecha = (d = 'AAAA-MM-DD') => txt(d);
const A = 'admin';

export default [
  // Facturas y cuentas de cobro
  ...CRUD({ modulo: 'finanzas', entidad: 'invoices', singular: 'factura', plural: 'facturas', escribe: A, required: ['counterparty', 'issue_date'], filtros: { kind: 'emitida o recibida', status: 'pendiente, pagada o anulada' },
    props: { kind: { type: 'string', enum: ['emitida', 'recibida'] }, number: txt(), counterparty: txt('Cliente o proveedor'), tax_id: txt(), client_email: txt(), client_city: txt(), issue_date: fecha(), due_date: fecha(), concept: txt(),
      items: { type: 'array', description: 'Líneas: concepto, cantidad, valor', items: { type: 'object' } }, subtotal: num(), tax: num(), total: num(), status: { type: 'string', enum: ['pendiente', 'pagada', 'anulada'] }, cost_center_id: id(), category: txt(), notes: txt() } }),
  H({ name: 'finanzas.pagar_factura', modulo: 'finanzas', rol: A, tipo: 'escritura', description: 'Registra un cobro (cuenta de cobro emitida: genera un recibo de caja) o un pago (factura recibida) sobre una factura. Sin monto paga el saldo.',
    props: { factura_id: id(), amount: num('Pesos; por defecto el saldo'), date: fecha('Por defecto hoy'), account_id: id('Cuenta donde entra o sale'), method: txt('Efectivo, Transferencia…') }, required: ['factura_id'], ruta: ['POST', '/api/finanzas/invoices/:factura_id/pay'] }),
  H({ name: 'finanzas.ver_detalle_factura', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Una factura o cuenta de cobro con sus líneas, abonos y recibos.', props: { factura_id: id() }, required: ['factura_id'], ruta: ['GET', '/api/finanzas/invoices/:factura_id/detalle'] }),
  H({ name: 'finanzas.listar_recibos', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Recibos de caja (cobros), con buscador por tercero, número o concepto.', props: { q: txt(), limit: id() }, ruta: ['GET', '/api/finanzas/receipts'] }),
  H({ name: 'finanzas.anular_recibo', modulo: 'finanzas', rol: A, tipo: 'escritura', description: 'Anula un recibo de caja (revierte el cobro de su factura y deja la anulación registrada).', props: { recibo_id: id() }, required: ['recibo_id'], ruta: ['POST', '/api/finanzas/receipts/:recibo_id/void'] }),

  // Movimientos, gastos recurrentes, cuentas y centros
  ...CRUD({ modulo: 'finanzas', entidad: 'movements', singular: 'movimiento', plural: 'movimientos', escribe: A, sin: ['listar', 'crear', 'editar'], props: {} }),
  ...CRUD({ modulo: 'finanzas', entidad: 'recurring', singular: 'gasto_recurrente', plural: 'gastos_recurrentes', escribe: A, sin: ['listar', 'crear', 'editar'], props: {} }),
  H({ name: 'finanzas.pagar_gasto_recurrente', modulo: 'finanzas', rol: A, tipo: 'escritura', description: 'Registra el pago de un gasto recurrente (por ejemplo la nómina o un servicio) como gasto real, con la cuenta de donde salió.',
    props: { gasto_id: id(), date: fecha('Por defecto hoy'), amount: num('Si es distinto al del plan'), account_id: id() }, required: ['gasto_id'], ruta: ['POST', '/api/finanzas/recurring/:gasto_id/pagar'] }),
  H({ name: 'finanzas.ver_estado_recurrentes', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Estado de los gastos recurrentes: cuáles están al día, cuáles vencen y cuáles están por pagar.', ruta: ['GET', '/api/finanzas/recurring/estado'] }),
  ...CRUD({ modulo: 'finanzas', entidad: 'accounts', singular: 'cuenta', plural: 'cuentas', escribe: A, sin: ['crear'], props: { name: txt(), kind: { type: 'string', enum: ['banco', 'efectivo', 'tarjeta', 'billetera'] }, bank: txt(), last4: txt(), opening_balance: num('Saldo inicial') } }),
  ...CRUD({ modulo: 'finanzas', entidad: 'cost_centers', singular: 'centro_costo', plural: 'centros_costo', escribe: A, sin: ['crear'], props: { name: txt(), kind: { type: 'string', enum: ['proyecto', 'app', 'cliente', 'departamento'] }, code: txt(), active: bool(), notes: txt() } }),
  H({ name: 'finanzas.totales_por_centro_costo', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Ingresos y gastos acumulados de cada centro de costo.', ruta: ['GET', '/api/finanzas/cost_centers/totales'] }),

  // Presupuestos
  ...CRUD({ modulo: 'finanzas', entidad: 'budgets', singular: 'presupuesto', plural: 'presupuestos', escribe: A, required: ['month', 'amount'], filtros: { month: 'AAAA-MM' },
    props: { month: txt('AAAA-MM'), cost_center_id: id('Opcional: presupuesto de un centro'), category: txt('Opcional: de una categoría'), amount: num('Pesos') } }),

  // Conciliación bancaria
  H({ name: 'finanzas.ver_extracto', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Líneas del extracto bancario importado, con candidatos de movimiento para conciliar las que faltan.', props: { account_id: id() }, ruta: ['GET', '/api/finanzas/bank-lines'] }),
  H({ name: 'finanzas.importar_extracto', modulo: 'finanzas', rol: A, tipo: 'escritura', description: 'Importa líneas de un extracto bancario a una cuenta y concilia solas las que coinciden con un movimiento.',
    props: { account_id: id(), lines: { type: 'array', items: { type: 'object', properties: { date: fecha(), description: txt(), amount: num('Positivo entra, negativo sale'), ref: txt() }, required: ['date', 'amount'] } } }, required: ['account_id', 'lines'], ruta: ['POST', '/api/finanzas/bank-import'] }),
  H({ name: 'finanzas.conciliar_linea', modulo: 'finanzas', rol: A, tipo: 'escritura', description: 'Concilia una línea del extracto con un movimiento existente (movement_id), crea el movimiento desde la línea (create) o la desvincula (unlink).',
    props: { linea_id: id(), movement_id: id(), create: { type: 'object', description: 'Crear el movimiento: category, cost_center_id', properties: { category: txt(), cost_center_id: id() } }, unlink: bool() }, required: ['linea_id'], ruta: ['POST', '/api/finanzas/bank-lines/:linea_id/match'] }),
  H({ name: 'finanzas.ver_conciliacion_cuenta', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Movimientos de una cuenta pendientes de conciliar (o todos).', props: { cuenta_id: id(), estado: { type: 'string', enum: ['pendientes', 'todos'] } }, required: ['cuenta_id'], ruta: ['GET', '/api/finanzas/accounts/:cuenta_id/conciliacion'] }),

  // Documentos y datos
  H({ name: 'finanzas.exportar_csv', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Exporta movimientos o facturas de un rango en CSV para el contador (se recorta si es muy largo: acota las fechas).', props: { kind: { type: 'string', enum: ['movements', 'invoices'] }, from: fecha(), to: fecha() }, ruta: ['GET', '/api/finanzas/export'] }),
  H({ name: 'finanzas.ver_datos_de_cobro', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Datos de quien cobra que salen en las cuentas de cobro: nombre, documento, banco, cuenta, Bre-B, WhatsApp, consecutivo, días de plazo.', ruta: ['GET', '/api/finanzas/billing/profile'] }),
  H({ name: 'finanzas.editar_datos_de_cobro', modulo: 'finanzas', rol: A, tipo: 'escritura', description: 'Cambia los datos de cobro (solo los campos que envíes).',
    props: { title: txt(), prefix: txt(), next_number: id(), due_days: id(), issuer_name: txt(), issuer_doc_label: txt(), issuer_doc: txt(), issuer_doc_city: txt(), brand: txt(), tagline: txt(), web: txt(), email: txt(), phone: txt(), city: txt(),
      bank: txt(), account_type: txt(), account_number: txt(), breb_key: txt(), whatsapp: txt(), legal: txt() }, ruta: ['PUT', '/api/finanzas/billing/profile'] }),
  H({ name: 'finanzas.ver_trm', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'TRM oficial (pesos por dólar) de una fecha.', props: { date: fecha('Por defecto hoy') }, ruta: ['GET', '/api/finanzas/billing/fx'] }),
  H({ name: 'finanzas.ver_pagos_del_mes', modulo: 'finanzas', rol: A, tipo: 'lectura', description: 'Planes de pago del mes (nómina y servicios) con lo ya pagado.', props: { month: txt('AAAA-MM') }, ruta: ['GET', '/api/finanzas/pagos-mes'] }),
];

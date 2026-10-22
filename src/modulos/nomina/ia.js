// Herramientas de IA de Nómina. Llaman a las MISMAS rutas de la API (src/lib/interno.js): mismos roles, validaciones, Finanzas y bitácora.
import { herramienta as H, crudHerramientas as CRUD } from '../../lib/interno.js';
import { KINDS } from './calculo.js';

const id = (d) => ({ type: 'integer', ...(d ? { description: d } : {}) });
const txt = (d) => ({ type: 'string', ...(d ? { description: d } : {}) });
const num = (d) => ({ type: 'number', ...(d ? { description: d } : {}) });
const bool = (d) => ({ type: 'boolean', ...(d ? { description: d } : {}) });
const fecha = (d = 'AAAA-MM-DD') => txt(d);
const A = 'admin';

export default [
  H({ name: 'nomina.resumen', modulo: 'nomina', rol: A, tipo: 'lectura', description: 'Resumen de la nómina del mes: personas, costo estimado (devengado, aportes y provisiones), corridas y próximas obligaciones (prima, cesantías).', props: { period: txt('AAAA-MM; por defecto este mes') }, ruta: ['GET', '/api/nomina/summary'] }),
  H({ name: 'nomina.ver_parametros', modulo: 'nomina', rol: A, tipo: 'lectura', description: 'SMMLV, auxilio de transporte, UVT y exoneración vigentes para un año, y los tipos de novedad que se pueden registrar.', props: { year: id() }, ruta: ['GET', '/api/nomina/parametros'] }),
  ...CRUD({ modulo: 'nomina', entidad: 'employees', singular: 'empleado', plural: 'empleados', escribe: A, required: ['name', 'start_date', 'salary'], filtros: { status: 'activo o retirado' },
    props: { name: txt(), doc_type: { type: 'string', enum: ['CC', 'CE', 'PPT', 'PEP', 'PA', 'TI'] }, doc_number: txt(), email: txt(), phone: txt(), position: txt('Cargo'),
      contract_type: { type: 'string', enum: ['indefinido', 'fijo', 'obra_labor', 'aprendizaje', 'prestacion'], description: 'prestacion = contratista por prestación de servicios (honorarios con retención, sin seguridad social ni prestaciones)' }, salary_type: { type: 'string', enum: ['ordinario', 'integral'] }, salary: num('Salario mensual en pesos'),
      aux_transporte: bool('Recibe auxilio de transporte (si gana hasta 2 SMMLV)'), arl_risk: id('Clase de riesgo ARL 1 a 5'), pay_freq: { type: 'string', enum: ['mensual', 'quincenal'] },
      start_date: fecha('Fecha de ingreso'), contract_end: fecha('Fin del contrato a término fijo'), end_date: fecha(), status: { type: 'string', enum: ['activo', 'retirado'] },
      eps: txt(), afp: txt(), arl: txt(), caja: txt(), cesantias_fund: txt(), bank: txt(), account_type: txt(), account_number: txt(), cost_center: txt('Centro de costo de Finanzas (por nombre)'),
      dependientes: bool('Deducción por dependientes en la retención'), deduc_vivienda: num(), deduc_prepagada: num(), notes: txt() } }),
  H({ name: 'nomina.listar_novedades', modulo: 'nomina', rol: A, tipo: 'lectura', description: 'Novedades registradas (horas extras, comisiones, incapacidades, vacaciones, descuentos…). Filtra por empleado (f_employee_id) y periodo (f_period).', props: { f_employee_id: id(), f_period: txt('AAAA-MM'), limit: id() }, ruta: ['GET', '/api/nomina/novedades'], salida: (o) => ({ novedades: o.rows }) }),
  H({ name: 'nomina.registrar_novedad', modulo: 'nomina', rol: A, tipo: 'escritura', description: `Registra una novedad del periodo de un empleado. Tipos: ${Object.entries(KINDS).map(([k, [l, u]]) => `${k} (${l}, en ${u})`).join('; ')}. Horas y días van en quantity; los pesos en amount.`,
    props: { employee_id: id(), period: txt('AAAA-MM'), half: { type: 'string', enum: ['M', '1', '2'], description: 'M mes completo, 1 o 2 quincena' }, kind: { type: 'string', enum: Object.keys(KINDS) }, quantity: num('Horas o días'), amount: num('Pesos'), note: txt() },
    required: ['employee_id', 'period', 'kind'], ruta: ['POST', '/api/nomina/novedades'] }),
  H({ name: 'nomina.borrar_novedad', modulo: 'nomina', rol: A, tipo: 'escritura', description: 'Borra una novedad.', props: { id: id() }, required: ['id'], ruta: ['DELETE', '/api/nomina/novedades/:id'] }),
  H({ name: 'nomina.liquidar_periodo', modulo: 'nomina', rol: A, tipo: 'escritura', description: 'Liquida (o recalcula, si sigue en borrador) la nómina de un periodo: devengados, salud, pensión, FSP, retención, aportes del empleador y provisiones. También la prima (junio/diciembre) y las cesantías (diciembre).',
    props: { tipo: { type: 'string', enum: ['nomina', 'prima', 'cesantias'] }, period: txt('AAAA-MM'), half: { type: 'string', enum: ['M', '1', '2'] } }, required: ['period'], ruta: ['POST', '/api/nomina/runs'] }),
  H({ name: 'nomina.listar_corridas', modulo: 'nomina', rol: A, tipo: 'lectura', description: 'Corridas de nómina con su estado y totales.', ruta: ['GET', '/api/nomina/runs'], salida: (o) => ({ corridas: o.rows }) }),
  H({ name: 'nomina.ver_corrida', modulo: 'nomina', rol: A, tipo: 'lectura', description: 'Una corrida con la línea de cada persona (devengado, deducciones, neto, aportes).', props: { corrida_id: id() }, required: ['corrida_id'], ruta: ['GET', '/api/nomina/runs/:corrida_id'] }),
  H({ name: 'nomina.aprobar_corrida', modulo: 'nomina', rol: A, tipo: 'escritura', description: 'Aprueba una nómina en borrador (queda lista para pagar).', props: { corrida_id: id() }, required: ['corrida_id'], ruta: ['POST', '/api/nomina/runs/:corrida_id/aprobar'] }),
  H({ name: 'nomina.reabrir_corrida', modulo: 'nomina', rol: A, tipo: 'escritura', description: 'Devuelve a borrador una nómina aprobada que aún no se pagó.', props: { corrida_id: id() }, required: ['corrida_id'], ruta: ['POST', '/api/nomina/runs/:corrida_id/reabrir'] }),
  H({ name: 'nomina.pagar_corrida', modulo: 'nomina', rol: A, tipo: 'escritura', description: 'Marca la nómina como pagada y registra en Finanzas los gastos: pago a empleados, seguridad social y parafiscales, y retención en la fuente. No se duplica.',
    props: { corrida_id: id(), date: fecha('Por defecto hoy'), account_id: id('Cuenta de Finanzas de donde sale el dinero') }, required: ['corrida_id'], ruta: ['POST', '/api/nomina/runs/:corrida_id/pagar'] }),
  H({ name: 'nomina.simular_liquidacion', modulo: 'nomina', rol: A, tipo: 'lectura', description: 'Calcula, sin guardar, la liquidación de contrato de un empleado: cesantías, intereses, prima, vacaciones pendientes e indemnización si es sin justa causa.',
    props: { empleado_id: id(), fin: fecha('Fecha de retiro'), motivo: { type: 'string', enum: ['renuncia', 'sin_justa_causa', 'con_justa_causa', 'mutuo_acuerdo', 'terminacion_contrato'] }, promedio_variable: num('Promedio mensual de lo salarial variable') }, required: ['empleado_id'], ruta: ['GET', '/api/nomina/employees/:empleado_id/liquidacion'] }),
  H({ name: 'nomina.liquidar_contrato', modulo: 'nomina', rol: A, tipo: 'escritura', description: 'Guarda la liquidación del contrato, retira al empleado y, si pagar es verdadero, registra el pago en Finanzas.',
    props: { empleado_id: id(), fin: fecha(), motivo: { type: 'string', enum: ['renuncia', 'sin_justa_causa', 'con_justa_causa', 'mutuo_acuerdo', 'terminacion_contrato'] }, promedio_variable: num(), pagar: bool(), date: fecha(), account_id: id() }, required: ['empleado_id', 'fin'], ruta: ['POST', '/api/nomina/employees/:empleado_id/liquidacion'] }),
];

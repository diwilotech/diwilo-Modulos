// Pruebas del módulo Nómina (Colombia): empleados, novedades, liquidación, pago a Finanzas, liquidación de contrato.
// Incluye aislamiento entre negocios, permisos y módulo inactivo = 403.
export default async function ({ check, diwilo, newBusiness, newMember }) {
  const A = await newBusiness('Nómina A', { login: true });
  const B = await newBusiness('Nómina B', { login: true });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10), mes = hoy.slice(0, 7);
  const N = '/api/nomina';

  // Empleados y reglas de validación
  const e1 = await A.app(`${N}/employees`, { method: 'POST', body: { name: 'Laura Gómez', doc_number: '1020304050', salary: 2000000, start_date: '2025-01-10', cost_center: 'Administración' } });
  const e2 = await A.app(`${N}/employees`, { method: 'POST', body: { name: 'Pedro Ruiz', doc_number: '79123456', salary: 8000000, start_date: '2024-02-01', arl_risk: 2 } });
  check('Nómina: crea empleados', e1.status === 201 && e2.status === 201);
  check('Nómina: el riesgo ARL va de 1 a 5', (await A.app(`${N}/employees`, { method: 'POST', body: { name: 'X', salary: 2000000, start_date: hoy, arl_risk: 9 } })).status === 400);
  check('Nómina: el salario no puede ir vacío de fecha', (await A.app(`${N}/employees`, { method: 'POST', body: { name: 'Sin fecha', salary: 2000000 } })).status === 400);

  // Novedades
  const nv = await A.app(`${N}/novedades`, { method: 'POST', body: { employee_id: e1.data.id, period: mes, kind: 'he_diurna', quantity: 10 } });
  check('Nómina: registra horas extras', nv.status === 201);
  check('Nómina: una comisión pide el valor', (await A.app(`${N}/novedades`, { method: 'POST', body: { employee_id: e1.data.id, period: mes, kind: 'comision' } })).status === 400);
  await A.app(`${N}/novedades`, { method: 'POST', body: { employee_id: e1.data.id, period: mes, kind: 'prestamo', amount: 100000, note: 'Libranza' } });

  // Prestación de servicios: honorarios con retención, sin seguridad social ni prestaciones
  const ct = await A.app(`${N}/employees`, { method: 'POST', body: { name: 'Docente Contratista', contract_type: 'prestacion', salary: 0, start_date: '2025-01-01' } });
  await A.app(`${N}/novedades`, { method: 'POST', body: { employee_id: ct.data.id, period: mes, kind: 'honorarios', amount: 1000000, note: 'Clases del mes' } });

  // Liquidación del mes
  const run = await A.app(`${N}/runs`, { method: 'POST', body: { period: mes, half: 'M' } });
  check('Nómina: liquida el mes', run.status === 201 && run.data.empleados === 3, JSON.stringify(run.data));
  const det = (await A.app(`${N}/runs/${run.data.id}`)).data;
  const l1 = det.lineas.find((l) => l.name === 'Laura Gómez'), l2 = det.lineas.find((l) => l.name === 'Pedro Ruiz');
  check('Nómina: auxilio de transporte solo a quien gana hasta 2 SMMLV', l1.detalle.aux > 0 && l2.detalle.aux === 0);
  check('Nómina: salud y pensión del empleado al 4 % del IBC', l1.detalle.salud > 0 && Math.abs(l1.detalle.salud - l1.detalle.ibc * 0.04) <= 100 && l1.detalle.salud === l1.detalle.pension);
  check('Nómina: el descuento por préstamo reduce el neto', l1.detalle.otros_descuentos === 100000 && l1.neto === l1.devengado - l1.deducciones);
  check('Nómina: exoneración de salud, SENA e ICBF bajo 10 SMMLV', l1.detalle.aportes.salud === 0 && l1.detalle.aportes.sena === 0 && l1.detalle.aportes.pension > 0);
  check('Nómina: provisiones de cesantías, prima, intereses y vacaciones', l1.detalle.provisiones.cesantias > 0 && l1.detalle.provisiones.vacaciones > 0 && l1.detalle.provisiones.total === l1.provisiones);
  check('Nómina: el fondo de solidaridad empieza desde 4 SMMLV', l2.detalle.fsp > 0 && l1.detalle.fsp === 0);
  const lc = det.lineas.find((l) => l.name === 'Docente Contratista');
  check('Nómina: el contratista cobra honorarios con retención del 10 % y sin aportes', lc && lc.devengado === 1000000 && lc.retencion === 100000 && lc.neto === 900000 && lc.aportes === 0 && lc.provisiones === 0, JSON.stringify(lc?.detalle).slice(0, 200));
  const pd = await A.app(`${N}/runs/${run.data.id}/desprendible/${e1.data.id}`);
  check('Nómina: desprendible de pago', pd.status === 200 && pd.data.text?.includes('NETO A PAGAR') && pd.data.text.includes('Laura Gómez'));
  check('Nómina: archivo de pago en CSV', (await A.app(`${N}/runs/${run.data.id}/export?kind=pago`)).data.text?.includes('Pedro Ruiz'));

  // Automático: cuenta de cobro del contratista con cada cargo separado
  const gen = await A.app(`${N}/servicios/generar`, { method: 'POST', body: { period: mes } });
  const sv = (await A.app(`${N}/servicios?period=${mes}`)).data.contratistas.find((x) => x.empleado.name === 'Docente Contratista');
  check('Nómina: genera la cuenta de cobro del contratista con la retención separada', gen.status === 200 && sv.factura?.total === 900000 && sv.lineas.some((l) => l.concepto === 'Clases del mes' && l.valor === 1000000) && sv.lineas.some((l) => l.concepto.startsWith('Retención') && l.valor === -100000), JSON.stringify(sv));
  const fin = (await A.app('/api/finanzas/invoices?limit=100')).data.rows.find((f) => f.ref === `nomina:serv:${ct.data.id}:${mes}`);
  check('Nómina: la cuenta de cobro es una factura recibida en Finanzas', fin?.kind === 'recibida' && fin.total === 900000 && fin.status === 'pendiente');

  // Flujo de estados y pago a Finanzas
  check('Nómina: no se paga sin aprobar', (await A.app(`${N}/runs/${run.data.id}/pagar`, { method: 'POST', body: {} })).status === 409);
  check('Nómina: aprueba', (await A.app(`${N}/runs/${run.data.id}/aprobar`, { method: 'POST' })).status === 200);
  check('Nómina: aprobada no se recalcula sin reabrir', (await A.app(`${N}/runs`, { method: 'POST', body: { period: mes } })).status === 409);
  const cta = await A.app('/api/finanzas/accounts', { method: 'POST', body: { name: 'Bancolombia', kind: 'banco' } });
  const pg = await A.app(`${N}/runs/${run.data.id}/pagar`, { method: 'POST', body: { date: hoy, account_id: cta.data.id } });
  check('Nómina: paga y registra egresos en Finanzas', pg.status === 200 && pg.data.egresos_en_finanzas >= 2, JSON.stringify(pg.data));
  const gastos = ((await A.app('/api/finanzas/movements?limit=100')).data.rows || []).filter((m) => (m.ref || '').startsWith(`nomina:run:${run.data.id}:`));
  check('Nómina: el neto, la seguridad social y la retención quedan en Finanzas', gastos.filter((m) => m.ref.includes(':neto:')).reduce((t, m) => t + m.amount, 0) === run.data.neto - 900000 && gastos.filter((m) => m.ref.includes(':neto:')).length === 2 && gastos.every((m) => m.account_id === cta.data.id) && gastos.some((m) => m.ref.endsWith(':aportes')));
  const cs = (await A.app(`${N}/servicios?period=${mes}`)).data.contratistas.find((x) => x.empleado.name === 'Docente Contratista');
  check('Nómina: la cuenta de cobro del contratista queda pagada con la nómina', cs?.factura?.status === 'pagada' && gastos.some((m) => m.ref.includes(':serv:') && m.amount === 900000 && m.invoice_id === cs.factura.id), JSON.stringify(cs?.factura));
  check('Nómina: una nómina pagada no se borra', (await A.app(`${N}/runs/${run.data.id}`, { method: 'DELETE' })).status === 409);

  // Prima y liquidación de contrato
  const pr = await A.app(`${N}/runs`, { method: 'POST', body: { tipo: 'prima', period: `${hoy.slice(0, 4)}-06` } });
  check('Nómina: liquida la prima del semestre', pr.status === 201 && pr.data.neto > 0);
  check('Nómina: la prima solo en junio o diciembre', (await A.app(`${N}/runs`, { method: 'POST', body: { tipo: 'prima', period: `${hoy.slice(0, 4)}-03` } })).status === 400);
  const sim = await A.app(`${N}/employees/${e1.data.id}/liquidacion?fin=${hoy}&motivo=sin_justa_causa`);
  check('Nómina: simula la liquidación con indemnización', sim.status === 200 && sim.data.items.some((x) => x.c.startsWith('Cesant')) && sim.data.items.some((x) => x.c.startsWith('Indemnización')) && sim.data.total > 0, JSON.stringify(sim.data).slice(0, 200));
  const liq = await A.app(`${N}/employees/${e1.data.id}/liquidacion`, { method: 'POST', body: { fin: hoy, motivo: 'renuncia', pagar: true, account_id: cta.data.id } });
  check('Nómina: liquida el contrato, retira y paga', liq.status === 201 && liq.data.en_finanzas === true && (await A.app(`${N}/employees`)).data.rows.find((x) => x.id === e1.data.id).status === 'retirado');
  check('Nómina: no se liquida dos veces', (await A.app(`${N}/employees/${e1.data.id}/liquidacion`, { method: 'POST', body: { fin: hoy } })).status === 409);

  // Calendario de pagos: mensual, quincenal y semanal; por negocio y por empleado
  const eq = await A.app(`${N}/employees`, { method: 'POST', body: { name: 'Quincenal Q', salary: 2400000, start_date: '2024-01-01', pay_freq: 'quincenal' } });
  const es = await A.app(`${N}/employees`, { method: 'POST', body: { name: 'Semanal S', salary: 1800000, start_date: '2024-01-01', pay_freq: 'semanal' } });
  const cal = (await A.app(`${N}/calendario?period=2026-02`)).data;
  const eQ = cal.empleados.find((x) => x.name === 'Quincenal Q'), eS = cal.empleados.find((x) => x.name === 'Semanal S'), eM = cal.empleados.find((x) => x.name === 'Pedro Ruiz');
  check('Nómina: calendario mensual paga el último día del mes (febrero también)', eM.pagos.length === 1 && eM.pagos[0].fecha === '2026-02-28');
  check('Nómina: calendario quincenal paga el 15 y el último día, y suma el neto', eQ.pagos.map((x) => x.fecha).join() === '2026-02-15,2026-02-28' && eQ.pagos.reduce((t, x) => t + x.valor, 0) === eQ.neto);
  check('Nómina: calendario semanal paga cada viernes y suma el neto', eS.pagos.length === 4 && eS.pagos.every((x) => new Date(`${x.fecha}T12:00:00Z`).getUTCDay() === 5) && eS.pagos.reduce((t, x) => t + x.valor, 0) === eS.neto);
  check('Nómina: el calendario reparte el costo entre empleado, EPS, pensión, ARL, caja y DIAN', cal.totales.empleados === cal.empleados.reduce((t, x) => t + x.neto, 0) && cal.totales.eps > 0 && cal.totales.afp > 0 && cal.totales.arl > 0 && cal.totales.costo === cal.empleados.reduce((t, x) => t + x.costo, 0));
  check('Nómina: el calendario trae las obligaciones del mes', cal.eventos.some((x) => x.tipo === 'obligacion' && /PILA/.test(x.titulo)) && (await A.app(`${N}/calendario?period=2026-06`)).data.eventos.some((x) => x.tipo === 'prestacion' && /Prima/.test(x.titulo)));
  check('Nómina: el calendario de una persona solo trae lo suyo', (await A.app(`${N}/calendario?period=2026-02&employee_id=${eQ.id}`)).data.empleados.length === 1);
  check('Nómina: B no ve el calendario de A', (await B.app(`${N}/calendario?period=2026-02&employee_id=${eQ.id}`)).data.empleados.length === 0);
  void eq; void es;

  // Prestaciones sociales
  const pe = (await A.app(`${N}/prestaciones`)).data;
  const pl = pe.personas.find((x) => x.name === 'Pedro Ruiz');
  check('Nómina: prestaciones por persona (cesantías, intereses, prima y vacaciones)', pl && pl.cesantias > 0 && pl.intereses > 0 && pl.prima > 0 && pl.vacaciones.causadas > 0 && pe.totales.total >= pl.total, JSON.stringify(pl).slice(0, 250));
  check('Nómina: los contratistas no causan prestaciones', !pe.personas.some((x) => x.name === 'Docente Contratista'));
  check('Nómina: trae las fechas de intereses, cesantías y prima', pe.hitos.length === 4 && pe.hitos.some((h) => h.fecha.endsWith('06-30')) && pe.hitos.some((h) => h.fecha.endsWith('12-20')));
  check('Nómina: B no ve las prestaciones de A', (await B.app(`${N}/prestaciones`)).data.personas.length === 0);

  // Parámetros
  const pa = await A.app(`${N}/parametros?year=2026`);
  check('Nómina: parámetros oficiales', pa.data.smmlv === 1750905 && pa.data.aux_transporte === 249095);
  await A.app(`${N}/params`, { method: 'POST', body: { year: 2026, smmlv: 2000000 } });
  check('Nómina: el negocio ajusta el año', (await A.app(`${N}/parametros?year=2026`)).data.smmlv === 2000000);

  // Aislamiento entre negocios
  check('Nómina: B no ve los empleados de A', (await B.app(`${N}/employees`)).data.rows?.length === 0);
  check('Nómina: B no ve las nóminas de A', (await B.app(`${N}/runs`)).data.rows?.length === 0 && (await B.app(`${N}/runs/${run.data.id}`)).status === 404);
  check('Nómina: B no ve el desprendible de A', (await B.app(`${N}/runs/${run.data.id}/desprendible/${e2.data.id}`)).status === 404);
  check('Nómina: B no apunta a empleados de A', (await B.app(`${N}/novedades`, { method: 'POST', body: { employee_id: e2.data.id, period: mes, kind: 'comision', amount: 1 } })).status === 400);

  // Permisos y módulo inactivo
  const staff = await newMember(A.id, 'staff');
  check('Nómina: el personal no tiene acceso (403)', (await staff.app(`${N}/employees`)).status === 403);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'nomina', activo: false }] });
  check('Nómina: módulo inactivo responde 403', (await A.app(`${N}/summary`)).status === 403);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('Nómina: al reactivarlo los datos siguen ahí', (await A.app(`${N}/employees`)).data.rows?.length === 5);
}

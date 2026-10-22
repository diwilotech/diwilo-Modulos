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

  // Liquidación del mes
  const run = await A.app(`${N}/runs`, { method: 'POST', body: { period: mes, half: 'M' } });
  check('Nómina: liquida el mes', run.status === 201 && run.data.empleados === 2, JSON.stringify(run.data));
  const det = (await A.app(`${N}/runs/${run.data.id}`)).data;
  const l1 = det.lineas.find((l) => l.name === 'Laura Gómez'), l2 = det.lineas.find((l) => l.name === 'Pedro Ruiz');
  check('Nómina: auxilio de transporte solo a quien gana hasta 2 SMMLV', l1.detalle.aux > 0 && l2.detalle.aux === 0);
  check('Nómina: salud y pensión del empleado al 4 % del IBC', l1.detalle.salud > 0 && Math.abs(l1.detalle.salud - l1.detalle.ibc * 0.04) <= 100 && l1.detalle.salud === l1.detalle.pension);
  check('Nómina: el descuento por préstamo reduce el neto', l1.detalle.otros_descuentos === 100000 && l1.neto === l1.devengado - l1.deducciones);
  check('Nómina: exoneración de salud, SENA e ICBF bajo 10 SMMLV', l1.detalle.aportes.salud === 0 && l1.detalle.aportes.sena === 0 && l1.detalle.aportes.pension > 0);
  check('Nómina: provisiones de cesantías, prima, intereses y vacaciones', l1.detalle.provisiones.cesantias > 0 && l1.detalle.provisiones.vacaciones > 0 && l1.detalle.provisiones.total === l1.provisiones);
  check('Nómina: el fondo de solidaridad empieza desde 4 SMMLV', l2.detalle.fsp > 0 && l1.detalle.fsp === 0);
  const pd = await A.app(`${N}/runs/${run.data.id}/desprendible/${e1.data.id}`);
  check('Nómina: desprendible de pago', pd.status === 200 && pd.data.text?.includes('NETO A PAGAR') && pd.data.text.includes('Laura Gómez'));
  check('Nómina: archivo de pago en CSV', (await A.app(`${N}/runs/${run.data.id}/export?kind=pago`)).data.text?.includes('Pedro Ruiz'));

  // Flujo de estados y pago a Finanzas
  check('Nómina: no se paga sin aprobar', (await A.app(`${N}/runs/${run.data.id}/pagar`, { method: 'POST', body: {} })).status === 409);
  check('Nómina: aprueba', (await A.app(`${N}/runs/${run.data.id}/aprobar`, { method: 'POST' })).status === 200);
  check('Nómina: aprobada no se recalcula sin reabrir', (await A.app(`${N}/runs`, { method: 'POST', body: { period: mes } })).status === 409);
  const cta = await A.app('/api/finanzas/accounts', { method: 'POST', body: { name: 'Bancolombia', kind: 'banco' } });
  const pg = await A.app(`${N}/runs/${run.data.id}/pagar`, { method: 'POST', body: { date: hoy, account_id: cta.data.id } });
  check('Nómina: paga y registra egresos en Finanzas', pg.status === 200 && pg.data.egresos_en_finanzas >= 2, JSON.stringify(pg.data));
  const gastos = ((await A.app('/api/finanzas/movements?limit=100')).data.rows || []).filter((m) => (m.ref || '').startsWith(`nomina:run:${run.data.id}:`));
  check('Nómina: el neto, la seguridad social y la retención quedan en Finanzas', gastos.filter((m) => m.ref.includes(':neto:')).reduce((t, m) => t + m.amount, 0) === run.data.neto && gastos.filter((m) => m.ref.includes(':neto:')).length === 2 && gastos.every((m) => m.account_id === cta.data.id) && gastos.some((m) => m.ref.endsWith(':aportes')));
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
  check('Nómina: al reactivarlo los datos siguen ahí', (await A.app(`${N}/employees`)).data.rows?.length === 2);
}

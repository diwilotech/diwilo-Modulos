// Pruebas del módulo Finanzas. Las corre `npm run test` de la app donde esté instalado (tests/modulos/).
// Incluye las obligatorias del catálogo: aislamiento entre negocios y módulo inactivo = 403.
export default async function ({ check, diwilo, newBusiness, newMember, mcp, APP }) {
  const A = await newBusiness('Finanzas A', { login: true });
  const B = await newBusiness('Finanzas B', { login: true });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const F = '/api/finanzas';

  const cc = await A.app(`${F}/cost_centers`, { method: 'POST', body: { name: 'Sede centro' } });
  const acc = await A.app(`${F}/accounts`, { method: 'POST', body: { name: 'Bancolombia', kind: 'banco', opening_balance: 1000000 } });
  check('Finanzas: crea centro de costo y cuenta', cc.status === 201 && acc.status === 201);
  const ing = await A.app(`${F}/movements`, { method: 'POST', body: { kind: 'ingreso', date: hoy, amount: 500000, description: 'Venta', cost_center_id: cc.data.id, account_id: acc.data.id } });
  check('Finanzas: registra un ingreso', ing.status === 201);
  check('Finanzas: registra un gasto', (await A.app(`${F}/movements`, { method: 'POST', body: { kind: 'gasto', date: hoy, amount: 120000, description: 'Arriendo', category: 'Arriendo' } })).status === 201);
  check('Finanzas: monto negativo se rechaza', (await A.app(`${F}/movements`, { method: 'POST', body: { kind: 'gasto', date: hoy, amount: -5 } })).status === 400);
  const s = (await A.app(`${F}/summary`)).data;
  check('Finanzas: resumen del mes (resultado 380.000)', s.totals?.income === 500000 && s.totals.expense === 120000 && s.totals.net === 380000, JSON.stringify(s.totals));
  const lista = (await A.app(`${F}/accounts`)).data.rows.find((a) => a.id === acc.data.id);
  check('Finanzas: la lista de cuentas trae el saldo según los registros y lo que falta conciliar', lista?.balance === 1500000 && lista.movimientos === 1 && lista.sin_conciliar === 1 && lista.valor_sin_conciliar === 500000 && lista.saldo_mes_anterior === 1000000 && lista.movimiento_mes === 500000, JSON.stringify(lista));
  const conc = await A.app(`${F}/accounts/${acc.data.id}/conciliacion`);
  check('Finanzas: la conciliación de una cuenta lista sus movimientos por conciliar', conc.status === 200 && conc.data.rows.length === 1 && conc.data.balance === 1500000 && conc.data.sin_conciliar === 1, JSON.stringify(conc.data).slice(0, 200));
  await A.app(`${F}/movements/${ing.data.id}`, { method: 'PATCH', body: { reconciled: 1 } });
  const conc2 = await A.app(`${F}/accounts/${acc.data.id}/conciliacion`);
  check('Finanzas: al marcar el movimiento como conciliado cambia el saldo conciliado', conc2.data.sin_conciliar === 0 && conc2.data.saldo_conciliado === 1500000 && conc2.data.rows.length === 0, JSON.stringify(conc2.data).slice(0, 200));
  await A.app(`${F}/movements/${ing.data.id}`, { method: 'PATCH', body: { reconciled: 0 } });
  check('Finanzas: otro negocio no ve la conciliación de la cuenta', (await B.app(`${F}/accounts/${acc.data.id}/conciliacion`)).status === 404);
  check('Finanzas: saldo de la cuenta suma el ingreso', s.accounts?.find((a) => a.id === acc.data.id)?.balance === 1500000);
  check('Finanzas: flujo de caja de 9 meses', s.cash_flow?.length === 9);

  // Cuenta de cobro con líneas, consecutivo, cobro y PDF
  const inv = await A.app(`${F}/invoices`, { method: 'POST', body: { kind: 'emitida', counterparty: 'Cliente Uno', issue_date: hoy, due_date: hoy, items: [{ concepto: 'Servicio', cantidad: 2, moneda: 'COP', valor: 150000 }] } });
  check('Finanzas: crea una cuenta de cobro con líneas', inv.status === 201);
  const invRow = (await A.app(`${F}/invoices`)).data.rows.find((r) => r.id === inv.data.id);
  check('Finanzas: total desde las líneas y consecutivo', invRow?.total === 300000 && /0001$/.test(invRow.number), JSON.stringify(invRow));
  check('Finanzas: el PDF responde', (await A.app(`${F}/invoices/${inv.data.id}/pdf`)).status === 200);
  check('Finanzas: registra el cobro de la cuenta (con su recibo de caja)', (await A.app(`${F}/invoices/${inv.data.id}/pay`, { method: 'POST', body: { amount: 300000, date: hoy } })).status === 201);
  check('Finanzas: la cuenta queda pagada', (await A.app(`${F}/invoices`)).data.rows.find((r) => r.id === inv.data.id)?.state === 'pagada');

  // Cuentas por cobrar y recibos de caja: varios recibos por cuenta, con consecutivo, que se pueden anular
  const cx = await A.app(`${F}/invoices`, { method: 'POST', body: { kind: 'emitida', counterparty: 'Cliente Dos', issue_date: hoy, items: [{ concepto: 'Curso', cantidad: 1, moneda: 'COP', valor: 1000000 }] } });
  const rc1 = await A.app(`${F}/invoices/${cx.data.id}/receipts`, { method: 'POST', body: { amount: 400000, date: hoy, method: 'Nequi' } });
  const rc2 = await A.app(`${F}/invoices/${cx.data.id}/receipts`, { method: 'POST', body: { amount: 300000, date: hoy, method: 'Efectivo' } });
  check('Recibos de caja: varios por cuenta, con consecutivo', rc1.status === 201 && rc2.status === 201 && rc1.data.receipt.number === 'RC-0002' && rc2.data.receipt.number === 'RC-0003', JSON.stringify([rc1.data, rc2.data]));
  const lst = await A.app(`${F}/invoices/${cx.data.id}/receipts`);
  check('Recibos de caja: se ven desde la cuenta y la cuenta lleva lo pagado', lst.data.rows.length === 2 && (await A.app(`${F}/invoices`)).data.rows.find((r) => r.id === cx.data.id)?.paid === 700000);
  check('Recibos de caja: un recibo no puede pasar el saldo (400)', (await A.app(`${F}/invoices/${cx.data.id}/receipts`, { method: 'POST', body: { amount: 400000 } })).status === 400);
  check('Recibos de caja: el recibo se imprime', (await A.app(`${F}/receipts/${rc1.data.receipt.id}/pdf`)).status === 200);
  check('Recibos de caja: anular uno devuelve su valor a la cuenta', (await A.app(`${F}/receipts/${rc2.data.receipt.id}/void`, { method: 'POST' })).status === 200 && (await A.app(`${F}/invoices`)).data.rows.find((r) => r.id === cx.data.id)?.paid === 400000);
  const suelto = await A.app(`${F}/receipts`, { method: 'POST', body: { counterparty: 'Cliente Cuatro', concept: 'Venta de contado', amount: 80000, date: hoy, method: 'Efectivo' } });
  check('Recibos de caja: se puede hacer uno sin cuenta de cobro, y es un ingreso', suelto.status === 201 && ((await A.app(`${F}/movements?limit=200`)).data.rows || []).some((x) => x.kind === 'ingreso' && x.amount === 80000 && !x.invoice_id));
  const tot = await A.app(`${F}/cost_centers/totales`);
  const ccs = (await A.app(`${F}/cost_centers`)).data.rows;
  check('Centros de costo: traen su total (ingresos, gastos y resultado)', tot.status === 200 && tot.data.ingresos >= 0 && tot.data.resultado === tot.data.ingresos - tot.data.gastos && ccs.every((x) => typeof x.ingresos === 'number' && x.resultado === x.ingresos - x.gastos), JSON.stringify([tot.data, ccs[0]]));
  check('Recibos de caja: B no ve los de A', ((await B.app(`${F}/receipts`)).data.rows || []).length === 0);
  const ex = await A.app(`${F}/invoices/externo`, { method: 'POST', body: { ref: 'app:cuenta:1', counterparty: 'Cliente Tres', total: 500000, concept: 'Matrícula' } });
  const er = await A.app(`${F}/receipts/externo`, { method: 'POST', body: { ref: 'app:pago:1', invoice_ref: 'app:cuenta:1', amount: 200000, method: 'Bre-B' } });
  const er2 = await A.app(`${F}/receipts/externo`, { method: 'POST', body: { ref: 'app:pago:1', invoice_ref: 'app:cuenta:1', amount: 200000 } });
  check('Recibos de caja: una app los crea por ref, sin duplicar, ligados a su cuenta', ex.status === 201 && er.status === 201 && er2.data.nuevo === false && (await A.app(`${F}/invoices/${ex.data.id}/receipts`)).data.rows.length === 1);
  check('Recibos de caja: una app los anula por ref', (await A.app(`${F}/receipts/externo/void`, { method: 'POST', body: { ref: 'app:pago:1' } })).status === 200 && (await A.app(`${F}/invoices`)).data.rows.find((r) => r.id === ex.data.id)?.paid === 0);
  const pdf = (await A.app(`${F}/invoices/${inv.data.id}/pdf`)).data.text || '';
  const code = (/\/validar\/([A-Z0-9]+)/.exec(pdf) || [])[1];
  check('Finanzas: el QR de validación abre la página pública', !!code && (await (await fetch(`${APP}/validar/${code}`)).text()).includes('Documento válido'));

  // Recurrentes: cobros ya hechos sin duplicar
  const rec = await A.app(`${F}/recurring`, { method: 'POST', body: { name: 'Internet', amount: 90000, next_date: hoy, category: 'infraestructura' } });
  const ch1 = await A.app(`${F}/recurring/${rec.data.id}/charges`, { method: 'POST', body: { dates: ['2026-08-02', '2026-09-02'] } });
  const ch2 = await A.app(`${F}/recurring/${rec.data.id}/charges`, { method: 'POST', body: { dates: ['2026-09-02'] } });
  check('Finanzas: registra cobros pasados de un recurrente sin duplicar', ch1.data.cobros?.every((x) => x.nuevo) && ch2.data.cobros?.[0]?.nuevo === false);

  // Banco: importar extracto y conciliar solo
  const imp = await A.app(`${F}/bank-import`, { method: 'POST', body: { account_id: acc.data.id, lines: [{ date: hoy, description: 'Abono', amount: 500000 }] } });
  check('Finanzas: importa extracto y concilia solo lo inequívoco', imp.data.imported === 1 && imp.data.matched === 1, JSON.stringify(imp.data));
  check('Finanzas: exporta CSV', /Fecha;Tipo;Monto/.test((await A.app(`${F}/export?kind=movements`)).data.text || ''));

  // Aislamiento entre negocios
  check('Finanzas: B no ve los movimientos de A', (await B.app(`${F}/movements`)).data.rows?.length === 0);
  check('Finanzas: B no edita un movimiento de A', (await B.app(`${F}/movements/${ing.data.id}`, { method: 'PATCH', body: { amount: 1 } })).status === 404);
  check('Finanzas: B no borra una factura de A', (await B.app(`${F}/invoices/${inv.data.id}`, { method: 'DELETE' })).status === 404);
  check('Finanzas: B no ve el PDF de A', (await B.app(`${F}/invoices/${inv.data.id}/pdf`)).status === 404);
  check('Finanzas: B no puede apuntar a la cuenta de A', (await B.app(`${F}/movements`, { method: 'POST', body: { kind: 'gasto', date: hoy, amount: 1, account_id: acc.data.id } })).status === 400);

  // Permisos: el personal no ve Finanzas (ver: admin)
  const staff = await newMember(A.id, 'staff');
  check('Finanzas: el personal no tiene acceso (403)', (await staff.app(`${F}/movements`)).status === 403);

  // Módulo inactivo = 403 (y los datos se conservan)
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'finanzas', activo: false }] });
  check('Finanzas: módulo inactivo responde 403', (await A.app(`${F}/summary`)).status === 403);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('Finanzas: al reactivarlo los datos siguen ahí', (await A.app(`${F}/movements`)).data.rows?.length >= 2);

  // IA (MCP)
  const tk = (await A.app('/api/ia/tokens', { method: 'POST', body: { name: 'Prueba finanzas' } })).data.token;
  const call = await mcp(tk, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'finanzas_resumen_mes', arguments: {} } });
  check('Finanzas: la IA consulta el resumen del mes', call.data.result?.structuredContent?.totales?.income >= 500000, JSON.stringify(call.data).slice(0, 200));
  const w = await mcp(tk, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'finanzas_registrar_movimiento', arguments: { tipo: 'gasto', monto: 10000, descripcion: 'Desde la IA' } } });
  check('Finanzas: la IA registra un gasto en su negocio', !w.data.result?.isError && (await B.app(`${F}/movements`)).data.rows.length === 0);
  const T = async (name, args) => (await mcp(tk, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })).data.result;
  check('Finanzas: la IA no repite un gasto igual', !!(await T('finanzas_registrar_movimiento', { tipo: 'gasto', monto: 10000, descripcion: 'Desde la IA' })).structuredContent?.ya_existia);
  const ccIa = (await T('finanzas_crear_centro_costo', { nombre: 'Sede norte' })).structuredContent;
  check('Finanzas: la IA crea un centro de costo sin duplicar', ccIa?.id > 0 && !!(await T('finanzas_crear_centro_costo', { nombre: 'sede norte' })).structuredContent?.ya_existia);
  check('Finanzas: la IA crea una cuenta', (await T('finanzas_crear_cuenta', { nombre: 'Nequi', tipo: 'billetera' })).structuredContent?.id > 0);
  const sinCentro = (await T('finanzas_buscar_movimientos', { sin_centro: true, texto: 'desde la ia' })).structuredContent?.movimientos || [];
  check('Finanzas: la IA busca movimientos sin centro de costo', sinCentro.length === 1, JSON.stringify(sinCentro));
  check('Finanzas: la IA asigna el centro de costo por nombre', !(await T('finanzas_editar_movimiento', { ids: [sinCentro[0]?.id], centro_costo: 'Sede norte' })).isError
    && (await T('finanzas_buscar_movimientos', { texto: 'desde la ia' })).structuredContent.movimientos[0].centro_costo === 'Sede norte');
  const pasado = new Date(Date.now() - 5 * 3600000 - 40 * 864e5).toISOString().slice(0, 10), futuro = new Date(Date.now() - 5 * 3600000 + 20 * 864e5).toISOString().slice(0, 10);
  const recIa = (await T('finanzas_crear_gasto_recurrente', { nombre: 'Arriendo bodega', monto: 800000, proximo_cobro: futuro, cobros_hechos: [pasado] })).structuredContent;
  check('Finanzas: la IA crea un recurrente y registra su cobro ya hecho', recIa?.id > 0 && recIa.cobros_registrados?.[0]?.nuevo === true, JSON.stringify(recIa));
  const ed = (await T('finanzas_editar_gasto_recurrente', { nombre: 'arriendo', centro_costo: 'Sede norte' })).structuredContent;
  check('Finanzas: editar el recurrente lleva el centro de costo a sus cobros', ed?.cobros_actualizados === 1, JSON.stringify(ed));
  check('Finanzas: la IA no usa un centro de costo de otro negocio', (await T('finanzas_registrar_movimiento', { tipo: 'gasto', monto: 5000, descripcion: 'x', centro_costo: '999999' })).isError === true);
  check('Finanzas: datos para el informe', !!(await T('finanzas_datos_informe', {})).structuredContent?.instruccion);
  check('Finanzas: la IA guarda un informe', !(await T('finanzas_guardar_informe', { contenido: 'Mes estable' })).isError && (await A.app(`${F}/reports`)).data.rows?.length === 1);
  check('Finanzas: B no ve los informes de A', (await B.app(`${F}/reports`)).data.rows?.length === 0);

  // Suscripción vencida = solo lectura
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: '2020-01-01' });
  check('Finanzas: vencida no deja registrar (402)', (await A.app(`${F}/movements`, { method: 'POST', body: { kind: 'gasto', date: hoy, amount: 1 } })).status === 402);
  check('Finanzas: vencida deja consultar', (await A.app(`${F}/summary`)).status === 200);
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: null });
}

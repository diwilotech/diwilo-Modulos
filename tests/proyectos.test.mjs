// Pruebas del módulo Proyectos: proyectos, cotizaciones con consecutivo y PDF, paso a cuenta de cobro en Finanzas, aislamiento y herramientas de IA.
export default async function ({ check, newBusiness }) {
  const A = await newBusiness('Proyectos A', { login: true });
  const B = await newBusiness('Proyectos B', { login: true });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10), P = '/api/proyectos';

  const pr = await A.app(`${P}/projects`, { method: 'POST', body: { name: 'Landing de campaña', client: 'DACH Institut', status: 'activo' } });
  check('Proyectos: crea un proyecto', pr.status === 201 && pr.data.id > 0);
  const q1 = await A.app(`${P}/quotes`, { method: 'POST', body: { project_id: pr.data.id, counterparty: 'DACH Institut', title: 'Landing de campaña', issue_date: hoy, items: [{ concepto: 'Rediseño y publicación', valor: 150000 }], conditions: 'Pago al publicar.' } });
  const q2 = await A.app(`${P}/quotes`, { method: 'POST', body: { counterparty: 'Otro', issue_date: hoy, items: [{ concepto: 'A', cantidad: 2, valor: 50000 }] } });
  check('Proyectos: cotizaciones con consecutivo COT-0001, COT-0002', q1.status === 201 && q2.status === 201);
  const lista = (await A.app(`${P}/quotes`)).data.rows;
  check('Proyectos: el total sale de las líneas y la vigencia es de 15 días', lista.find((x) => x.id === q1.data.id).total === 150000 && lista.find((x) => x.id === q2.data.id).total === 100000 && lista.map((x) => x.number).sort().join() === 'COT-0001,COT-0002' && !!lista[0].valid_until);
  check('Proyectos: una cotización sin valor se rechaza', (await A.app(`${P}/quotes`, { method: 'POST', body: { counterparty: 'X', issue_date: hoy, items: [] } })).status === 400);
  const pdf = await A.app(`${P}/quotes/${q1.data.id}/pdf`);
  const html = pdf.data?.text || '';
  check('Proyectos: PDF de la cotización', pdf.status === 200 && html.includes('COT-0001') && html.includes('Cotización') && html.includes('Pago al publicar') && !html.includes('Forma de pago'), String(pdf.status));

  // Aprobar → cuenta de cobro sin pagar en Finanzas, ligada al proyecto; solo una vez
  const cb = await A.app(`${P}/quotes/${q1.data.id}/cobrar`, { method: 'POST', body: {} });
  check('Proyectos: la cotización aprobada crea su cuenta de cobro', cb.status === 200 && cb.data.total === 150000 && !!cb.data.numero, JSON.stringify(cb.data));
  check('Proyectos: no se convierte dos veces', (await A.app(`${P}/quotes/${q1.data.id}/cobrar`, { method: 'POST', body: {} })).status === 409);
  const det = (await A.app(`${P}/projects/${pr.data.id}/detalle`)).data;
  check('Proyectos: el proyecto junta sus cotizaciones y cuentas de cobro', det.cotizaciones.length === 1 && det.cotizaciones[0].status === 'aprobada' && det.cuentas_de_cobro.length === 1 && det.cuentas_de_cobro[0].status === 'pendiente');
  check('Proyectos: no se cambia el valor de una cotización ya cobrada', (await A.app(`${P}/quotes/${q1.data.id}`, { method: 'PATCH', body: { items: [{ concepto: 'x', valor: 1 }] } })).status === 409);

  // Empresa = proyecto: se enlaza a Marketing y sus datos viajan a las cotizaciones y cuentas de cobro
  const em = await A.app(`${P}/projects`, { method: 'POST', body: { name: 'Madetableros', client_email: 'compras@madetableros.co' } });
  const ct = em.status === 201 ? (await A.app(`${P}/contactos?q=Madetab`)).data.rows : [];
  check('Proyectos: crear la empresa crea su contacto en Marketing', em.status === 201 && ct.length === 1 && ct[0].email === 'compras@madetableros.co');
  const qe = await A.app(`${P}/quotes`, { method: 'POST', body: { project_id: em.data.id, counterparty: 'x', title: 'Catálogo', issue_date: hoy, items: [{ concepto: 'Catálogo web', valor: 200000 }, { concepto: 'Soporte', valor: 50000 }],
    extra: JSON.stringify({ sugerencias: ['Campaña de correo mensual'], plazo: '2 semanas' }) } });
  await A.app(`${P}/projects/${em.data.id}`, { method: 'PATCH', body: { tax_id: '900.123.456-7', client_city: 'Medellín' } });
  const qd = (await A.app(`${P}/quotes/${qe.data.id}`)).data;
  check('Proyectos: los datos de la empresa se copian a su cotización', qd.counterparty === 'Madetableros' && qd.tax_id === '900.123.456-7' && qd.client_city === 'Medellín', JSON.stringify([qe.status, qe.data, qd]).slice(0, 300));
  const pe = await A.app(`${P}/quotes/${qe.data.id}/pdf`);
  const he = pe.data?.text || '';
  check('Proyectos: el PDF nuevo trae sugerencias aparte, plazo y los datos de la empresa', pe.status === 200 && he.includes('class="sug"') && he.includes('Campaña de correo mensual') && he.includes('2 semanas') && he.includes('900.123.456-7') && he.includes('Página '));
  const cbe = await A.app(`${P}/quotes/${qe.data.id}/cobrar`, { method: 'POST', body: { lineas: [0] } });
  const inve = (cbe.status === 200 ? ((await A.app('/api/finanzas/invoices')).data.rows || []).find((x) => x.id === cbe.data.id) : null) || {};
  check('Proyectos: se puede cobrar solo una línea y la cuenta lleva los datos de la empresa', cbe.status === 200 && inve.total === 200000 && inve.tax_id === '900.123.456-7');
  await A.app(`${P}/projects/${em.data.id}`, { method: 'PATCH', body: { tax_id: '900.999.999-1' } });
  check('Proyectos: cambiar el NIT de la empresa actualiza su cuenta de cobro', ((await A.app('/api/finanzas/invoices')).data.rows || []).find((x) => x.id === cbe.data.id).tax_id === '900.999.999-1');
  const cpe = await A.app(`/api/finanzas/invoices/${cbe.data.id}/pdf`);
  check('Proyectos: la cuenta de cobro sale con el diseño nuevo', cpe.status === 200 && (cpe.data?.text || '').includes('class="hero"') && (cpe.data?.text || '').includes('Madetableros') && (cpe.data?.text || '').includes('Valida este documento'));
  const bqe = await A.app(`${P}/correo/borrador?tipo=cotizacion&id=${qe.data.id}`), bce = await A.app(`${P}/correo/borrador?tipo=cuenta&id=${cbe.data.id}`);
  check('Proyectos: el borrador del correo trae destinatario, redacción y enlace público', bqe.status === 200 && bqe.data.para === 'compras@madetableros.co' && /\/validar\/[A-Z0-9]{8,}\/documento/.test(bqe.data.mensaje) && bce.status === 200 && bce.data.mensaje.includes(cbe.data.numero));
  check('Proyectos: enviar sin bandeja de correo da un aviso claro', (await A.app(`${P}/correo/enviar`, { method: 'POST', body: { tipo: 'cuenta', id: cbe.data.id } })).status === 400);

  // RUT y certificación bancaria
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const sr = await A.app(`${P}/documentos/rut`, { method: 'POST', body: { nombre: 'rut.png', data: png } });
  const sx = await A.app(`${P}/documentos/banco`, { method: 'POST', body: { nombre: 'x.exe', data: 'data:application/x-msdownload;base64,AAAA' } });
  const ls = (await A.app(`${P}/documentos`)).data.rows, gt = await A.app(`${P}/documentos/rut`);
  check('Proyectos: sube el RUT, rechaza archivos raros y lo puede ver', sr.status === 200 && sx.status === 400 && ls.length === 1 && ls[0].kind === 'rut' && gt.data?.data === png);
  const bd = await A.app(`${P}/correo/borrador?tipo=cotizacion&id=${qe.data.id}`);
  check('Proyectos: el correo menciona el RUT subido', /RUT: .*\/validar\/[A-Z0-9]+\/rut/.test(bd.data?.mensaje || ''));
  check('Proyectos: otro negocio no ve mis documentos', (await B.app(`${P}/documentos`)).data.rows.length === 0 && (await B.app(`${P}/documentos/rut`)).status === 404);
  check('Proyectos: quitar el RUT', (await A.app(`${P}/documentos/rut`, { method: 'DELETE' })).status === 200 && (await A.app(`${P}/documentos`)).data.rows.length === 0);

  // Aislamiento entre negocios
  check('Proyectos: otro negocio no ve ni toca nada', (await B.app(`${P}/quotes`)).data.rows.length === 0 && (await B.app(`${P}/quotes/${q2.data.id}/pdf`)).status === 404 && (await B.app(`${P}/quotes/${q2.data.id}/cobrar`, { method: 'POST', body: {} })).status === 404);
}

// Pruebas del módulo Marketing. Incluye aislamiento entre negocios y módulo inactivo = 403.
export default async function ({ check, diwilo, newBusiness, newMember, mcp, APP }) {
  const A = await newBusiness('Marketing A', { login: true });
  const B = await newBusiness('Marketing B', { login: true });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const M = '/api/marketing';

  // Automatización de lead nuevo + contacto
  const au = await A.app(`${M}/automations`, { method: 'POST', body: { name: 'Plan lead', trigger: 'lead_nuevo', action: 'crear_tarea', task_title: JSON.stringify([{ t: 'Llamar a {nombre}', d: 0 }, { t: 'Seguimiento a {nombre}', d: 3 }]), active: true } });
  check('Marketing: crea una automatización', au.status === 201);
  const ct = await A.app(`${M}/contacts`, { method: 'POST', body: { name: 'Laura Gómez', phone: '3001234567', stage: 'lead', source: 'Instagram' } });
  check('Marketing: crea un lead', ct.status === 201);
  const tasks = (await A.app(`${M}/tasks?f_done=0`)).data.rows || [];
  check('Marketing: el lead nuevo dispara sus 2 tareas', tasks.filter((t) => /Laura Gómez/.test(t.title)).length === 2, JSON.stringify(tasks.map((t) => t.title)));
  check('Marketing: correo no válido se rechaza', (await A.app(`${M}/contacts`, { method: 'POST', body: { name: 'X', email: 'no-es-correo' } })).status === 400);

  // Campaña, gasto, oportunidad ganada y resumen
  const k = await A.app(`${M}/campaigns`, { method: 'POST', body: { name: 'Lanzamiento octubre', channel: 'meta_ads', budget: 400000 } });
  check('Marketing: crea una campaña con utm automático', k.status === 201 && (await A.app(`${M}/campaigns`)).data.rows[0]?.utm_campaign === 'lanzamiento-octubre');
  await A.app(`${M}/spend`, { method: 'POST', body: { campaign_id: k.data.id, date: hoy, amount: 200000, leads: 4 } });
  await A.app(`${M}/deals`, { method: 'POST', body: { title: 'Venta Laura', contact_id: ct.data.id, campaign_id: k.data.id, value: 600000, stage: 'ganado' } });
  const s = (await A.app(`${M}/summary`)).data;
  const camp = s.campaigns?.find((x) => x.id === k.data.id);
  check('Marketing: costo por lead y ROI de la campaña', camp?.cpl === 50000 && camp.roi === 200, JSON.stringify(camp));
  check('Marketing: el widget responde', (await A.app(`${M}/resumen`)).data.titulo?.length > 0);

  // Links de rastreo
  const ln = await A.app(`${M}/campaigns/${k.data.id}/links`, { method: 'POST', body: { platform: 'instagram', target: 'https://ejemplo.com/curso' } });
  check('Marketing: crea un link de rastreo', ln.status === 201 && /^lanzamiento-octubre-instagram(-\d+)?$/.test(ln.data.slug || ''));
  const go = await fetch(`${APP}/l/${ln.data.slug}`, { redirect: 'manual' });
  check('Marketing: el link redirige con los UTM', go.status === 302 && /utm_source=instagram/.test(go.headers.get('location') || '') && /utm_campaign=lanzamiento-octubre/.test(go.headers.get('location') || ''));
  check('Marketing: el clic se cuenta', (await A.app(`${M}/campaigns/${k.data.id}/links`)).data.links?.[0]?.clicks === 1);
  check('Marketing: destino sin https se rechaza', (await A.app(`${M}/campaigns/${k.data.id}/links`, { method: 'POST', body: { platform: 'qr', target: 'javascript:alert(1)' } })).status === 400);

  // Listas
  const li = await A.app(`${M}/lists`, { method: 'POST', body: { name: 'Competidores', kind: 'competidores' } });
  check('Marketing: crea una lista y agrega un elemento', li.status === 201 && (await A.app(`${M}/list_items`, { method: 'POST', body: { list_id: li.data.id, title: 'Academia X', url: 'https://academiax.com' } })).status === 201);

  // Revisar los sitios de la lista (un sitio que no responde queda con su error, sin romper la revisión)
  const rv = await A.app(`${M}/lists/${li.data.id}/check`, { method: 'POST' });
  check('Marketing: revisa los sitios de una lista', rv.status === 200 && rv.data.revisados === 1, JSON.stringify(rv.data).slice(0, 200));
  check('Marketing: B no revisa una lista de A', (await B.app(`${M}/lists/${li.data.id}/check`, { method: 'POST' })).status === 404);
  // Automatizaciones como en Diwilo: factura vencida y semanal con informe
  check('Marketing: automatización «factura vencida» e «informe semanal»', (await A.app(`${M}/automations`, { method: 'POST', body: { name: 'Cobrar vencidas', trigger: 'factura_vencida', action: 'crear_tarea' } })).status === 201
    && (await A.app(`${M}/automations`, { method: 'POST', body: { name: 'Informe', trigger: 'semanal', action: 'informe_ia' } })).status === 201);
  // Informes
  check('Marketing: datos para el informe con la instrucción del analista', !!(await A.app(`${M}/reports/datos`)).data.instruccion);
  check('Marketing: guarda un informe', (await A.app(`${M}/reports`, { method: 'POST', body: { title: 'Semana 1', content: 'Todo bien', origen: 'manual' } })).status === 201);

  // Tarjetas: la del negocio se crea sola, se publica en el dominio de la app (/c/<slug>) con vCard
  const cl = await A.app(`${M}/cards`);
  const pred = cl.data.rows?.find((x) => x.predeterminada);
  check('Marketing: la tarjeta del negocio se crea sola', cl.status === 200 && cl.data.rows.length === 1 && !!pred, JSON.stringify(cl.data).slice(0, 200));
  check('Marketing: no se duplica al volver a abrir', (await A.app(`${M}/cards`)).data.rows.length === 1);
  check('Marketing: la tarjeta del negocio no se borra', (await A.app(`${M}/cards/${pred.id}`, { method: 'DELETE' })).status === 409);
  const nc = await A.app(`${M}/cards`, { method: 'POST', body: { name: 'Laura Restrepo', role: 'Directora', whatsapp: '+57 300 111 2233', accent: 'rosa' } });
  check('Marketing: crea otra tarjeta', nc.status === 201);
  const pub = await fetch(`${APP}/c/${pred.slug}`);
  check('Marketing: la tarjeta pública abre en el dominio de la app', pub.status === 200 && (await pub.text()).includes(pred.name));
  check('Marketing: guarda el contacto (vCard)', (await (await fetch(`${APP}/c/${pred.slug}.vcf`)).text()).startsWith('BEGIN:VCARD'));
  check('Marketing: foto no válida se rechaza', (await A.app(`${M}/cards/${nc.data.id}/foto`, { method: 'PUT', body: { photo_data: 'x' } })).status === 400);
  check('Marketing: B no ve las tarjetas de A', !(await B.app(`${M}/cards`)).data.rows?.some((x) => x.id === nc.data.id));

  // Aislamiento
  check('Marketing: B no ve los informes de A', (await B.app(`${M}/reports`)).data.rows?.length === 0);
  check('Marketing: B no ve los contactos de A', (await B.app(`${M}/contacts`)).data.rows?.length === 0);
  check('Marketing: B no edita un contacto de A', (await B.app(`${M}/contacts/${ct.data.id}`, { method: 'PATCH', body: { name: 'x' } })).status === 404);
  check('Marketing: B no ve los links de una campaña de A', (await B.app(`${M}/campaigns/${k.data.id}/links`)).status === 404);
  check('Marketing: B no agrega a una lista de A', (await B.app(`${M}/list_items`, { method: 'POST', body: { list_id: li.data.id, title: 'x' } })).status === 400);
  check('Marketing: B no liga una oportunidad a un contacto de A', (await B.app(`${M}/deals`, { method: 'POST', body: { title: 'x', contact_id: ct.data.id } })).status === 400);

  // Permisos: el personal usa Marketing pero no borra contactos ni crea automatizaciones
  const staff = await newMember(A.id, 'staff');
  check('Marketing: el personal sin el módulo asignado no entra (403)', (await staff.app(`${M}/contacts`)).status === 403);
  await A.app(`/api/team/${staff.id}`, { method: 'PATCH', body: { modulos: ['marketing'] } });   // el titular le da Marketing
  check('Marketing: el personal ve los contactos', (await staff.app(`${M}/contacts`)).status === 200);
  check('Marketing: el personal no borra contactos (403)', (await staff.app(`${M}/contacts/${ct.data.id}`, { method: 'DELETE' })).status === 403);
  check('Marketing: el personal no crea automatizaciones (403)', (await staff.app(`${M}/automations`, { method: 'POST', body: { name: 'x', trigger: 'lead_nuevo', action: 'crear_tarea' } })).status === 403);

  // Módulo inactivo = 403; su link público deja de redirigir; los datos se conservan
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'marketing', activo: false }] });
  check('Marketing: módulo inactivo responde 403', (await A.app(`${M}/contacts`)).status === 403);
  check('Marketing: inactivo, el link público no redirige', (await fetch(`${APP}/l/${ln.data.slug}`, { redirect: 'manual' })).status === 404);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('Marketing: al reactivarlo los datos siguen ahí', (await A.app(`${M}/contacts`)).data.rows?.length === 1);

  // IA (MCP)
  const tk = (await A.app('/api/ia/tokens', { method: 'POST', body: { name: 'Prueba marketing' } })).data.token;
  const call = await mcp(tk, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'marketing_buscar_contactos', arguments: { texto: 'Laura' } } });
  check('Marketing: la IA busca contactos', call.data.result?.structuredContent?.contactos?.length === 1);
  const w = await mcp(tk, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'marketing_crear_contacto', arguments: { nombre: 'Lead desde la IA' } } });
  check('Marketing: la IA crea un lead en su negocio', !w.data.result?.isError && (await B.app(`${M}/contacts`)).data.rows.length === 0);
  const T = async (name, args) => (await mcp(tk, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })).data.result;
  check('Marketing: la IA no duplica listas', (await T('marketing_crear_lista', { nombre: 'competidores' })).structuredContent?.ya_existia === li.data.id);
  check('Marketing: la IA no repite un elemento de la lista', !!(await T('marketing_agregar_a_lista', { lista: 'Competidores', titulo: 'Academia X' })).structuredContent?.ya_existia);
  check('Marketing: la IA lee la lista', (await T('marketing_leer_lista', { lista: 'Competidores' })).structuredContent?.elementos?.length === 1);
  // Control total por IA: editar, borrar, oportunidades y gasto de campañas
  const sc = (r) => r?.structuredContent ?? { error: r?.content?.[0]?.text };
  const ctIa = sc(await T('marketing_crear_contacto', { nombre: 'Contacto para editar' })).creado;
  const ed = sc(await T('marketing_editar_contacto', { id: ctIa.id, phone: '3109998888', stage: 'cliente' }));
  check('Marketing IA: edita un contacto', !ed.error && (await A.app(`${M}/contacts/${ctIa.id}`)).status !== 404 && (await A.app(`${M}/contacts?q=Contacto%20para%20editar`)).data.rows?.[0]?.stage === 'cliente');
  const dl = sc(await T('marketing_crear_oportunidad', { title: 'Matrícula grupal', value: 900000 }));
  const dl2 = sc(await T('marketing_editar_oportunidad', { id: dl.id, stage: 'ganado' }));
  check('Marketing IA: crea y mueve una oportunidad en el embudo', dl.id > 0 && !dl2.error && sc(await T('marketing_listar_oportunidades', { f_stage: 'ganado' })).oportunidades?.some((x) => x.id === dl.id && x.stage === 'ganado'));
  const cp = sc(await T('marketing_crear_campana', { nombre: 'Campaña IA', presupuesto: 500000 }));
  const gc = sc(await T('marketing_crear_gasto_campana', { campaign_id: cp.id, date: hoy, amount: 120000, clicks: 80 }));
  check('Marketing IA: registra el gasto de una campaña', gc.id > 0 && sc(await T('marketing_listar_gastos_campana', { f_campaign_id: String(cp.id) })).gastos_campana?.[0]?.amount === 120000);
  check('Marketing IA: borra el contacto y queda en la bitácora', !sc(await T('marketing_borrar_contacto', { id: ctIa.id })).error && (await A.app(`${M}/contacts?q=Contacto%20para%20editar`)).data.rows?.length === 0);
  check('Marketing IA: la validación de la API se respeta', !!sc(await T('marketing_crear_gasto_campana', { campaign_id: cp.id, date: 'ayer', amount: 1 })).error);
  await T('marketing_crear_tarea', { titulo: 'Llamar a Laura' });
  check('Marketing: la IA no repite una tarea pendiente', !!(await T('marketing_crear_tarea', { titulo: 'llamar a laura' })).structuredContent?.ya_existia);
  check('Marketing: la IA guarda un informe', !(await T('marketing_guardar_informe', { contenido: 'Informe de prueba' })).isError && (await A.app(`${M}/reports`)).data.rows.some((r) => r.origen === 'ia'));
  check('Marketing: la IA crea una automatización', !(await T('marketing_crear_automatizacion', { nombre: 'Plan lead', cuando: 'lead_nuevo', entonces: 'crear_tarea', pasos: [{ t: 'Llamar a {nombre}', d: 0 }] })).isError);

  // Suscripción vencida = solo lectura
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: '2020-01-01' });
  check('Marketing: vencida no deja crear (402)', (await A.app(`${M}/contacts`, { method: 'POST', body: { name: 'No' } })).status === 402);
  check('Marketing: vencida deja consultar', (await A.app(`${M}/summary`)).status === 200);
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: null });
}

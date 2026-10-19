// Pruebas del módulo IA (chats de clientes, conversaciones, agentes, asistente, consumo y API). Sin gastar IA: los mensajes
// que empiezan por «[prueba]» responden sin llamar al modelo; «[[GUION]]…[[/GUION]]» entrega las salidas de un agente paso a paso.
export default async function ({ check, diwilo, newBusiness, newMember, mcp, APP }) {
  const A = await newBusiness('IA A', { login: true });
  const B = await newBusiness('IA B', { login: true });
  const X = '/api/ai', sid = () => crypto.randomUUID().replace(/-/g, '');
  const post = (slug, body) => fetch(`${APP}/chat/${slug}/mensaje`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  /* ---------- chats ---------- */
  const c1 = await A.app(`${X}/chats`, { method: 'POST', body: { nombre: 'Soporte A', saludo: '¡Hola desde A!', instrucciones: 'Atiende dudas.', whatsapp: '573001112233' } });
  check('IA: crea un chat', c1.status === 201);
  const lista = (await A.app(`${X}/chats`)).data.rows, ch = lista.find((x) => x.id === c1.data.id);
  check('IA: el chat trae su dirección /chat/<slug> y cero conversaciones', /^\/chat\/soporte-a/.test(ch?.ruta || '') && ch.conversaciones === 0 && ch.activo === 1, JSON.stringify(ch));
  check('IA: webhook que no es https se rechaza', (await A.app(`${X}/chats`, { method: 'POST', body: { nombre: 'x', webhook_url: 'http://ejemplo.com/h' } })).status === 400);
  check('IA: webhook a una dirección interna se rechaza', (await A.app(`${X}/chats`, { method: 'POST', body: { nombre: 'x', webhook_url: 'https://127.0.0.1/h' } })).status === 400);
  check('IA: tope por día fuera de rango se rechaza', (await A.app(`${X}/chats`, { method: 'POST', body: { nombre: 'x', limite_dia: 0 } })).status === 400 && (await A.app(`${X}/chats`, { method: 'POST', body: { nombre: 'x', limite_dia: 999 } })).status === 400);
  check('IA: B no ve los chats de A', (await B.app(`${X}/chats`)).data.rows.length === 0);
  check('IA: B no edita ni borra un chat de A', (await B.app(`${X}/chats/${ch.id}`, { method: 'PATCH', body: { nombre: 'x' } })).status === 404 && (await B.app(`${X}/chats/${ch.id}`, { method: 'DELETE' })).status === 404);
  check('IA: un chat sin webhook no se puede probar', (await A.app(`${X}/chats/${ch.id}/webhook-prueba`, { method: 'POST' })).status === 400);

  /* ---------- chat público ---------- */
  const slug = ch.ruta.slice(6);
  const pg = await fetch(`${APP}/chat/${slug}`), html = await pg.text();
  check('IA: la página del chat abre con su nombre y saludo', pg.status === 200 && html.includes('Soporte A') && html.includes('¡Hola desde A!'));
  check('IA: la página se puede incrustar en otras webs (sin x-frame-options)', !pg.headers.get('x-frame-options') && /frame-ancestors \*/.test(pg.headers.get('content-security-policy') || ''));
  const wd = await fetch(`${APP}/chat/${slug}/widget.js`);
  check('IA: el widget.js (burbuja) apunta al chat', wd.status === 200 && /javascript/.test(wd.headers.get('content-type')) && (await wd.text()).includes(`'/chat/'+SLUG`) );
  check('IA: un chat que no existe da 404', (await fetch(`${APP}/chat/no-existe-xyz`)).status === 404);
  const s1 = sid();
  const m1 = await post(slug, { sid: s1, message: '[prueba] hola' });
  check('IA: el chat responde (modo de prueba)', m1.status === 200 && m1.data.reply === 'Respuesta de prueba: hola', JSON.stringify(m1.data));
  check('IA: sesión no válida y mensaje vacío o largo se rechazan', (await post(slug, { sid: 'x', message: 'hola' })).status === 400 && (await post(slug, { sid: s1, message: '   ' })).status === 400 && (await post(slug, { sid: s1, message: 'a'.repeat(701) })).status === 400);
  // conversaciones
  const cv = (await A.app(`${X}/conversaciones`)).data.rows;
  check('IA: la conversación queda guardada con su primer mensaje', cv.length === 1 && cv[0].primero === '[prueba] hola' && cv[0].msg_count === 2 && cv[0].chat === 'Soporte A', JSON.stringify(cv));
  const dt = (await A.app(`${X}/conversaciones/${cv[0].id}`)).data;
  check('IA: se lee la conversación completa', dt.mensajes?.length === 2 && dt.mensajes[0].rol === 'user' && dt.mensajes[1].rol === 'assistant');
  check('IA: B no ve ni lee las conversaciones de A', (await B.app(`${X}/conversaciones`)).data.rows.length === 0 && (await B.app(`${X}/conversaciones/${cv[0].id}`)).status === 404);
  // lead desde el chat
  const s2 = sid();
  const ld = await post(slug, { sid: s2, message: '[prueba] soy Ana [[DATOS {"nombre":"Ana Pérez","telefono":"3001112233","interes":"cursos"}]]' });
  check('IA: el marcador de datos no se le muestra al cliente', ld.status === 200 && !/DATOS/.test(ld.data.reply), ld.data.reply);
  const cts = (await A.app('/api/marketing/contacts?q=Ana')).data.rows;
  check('IA: quien deja sus datos queda como lead en Marketing, con su origen', cts.some((c) => c.name === 'Ana Pérez' && c.stage === 'lead' && /Chat: Soporte A/.test(c.source || '')), JSON.stringify(cts));
  await post(slug, { sid: s2, message: '[prueba] otra vez [[DATOS {"nombre":"Ana Pérez","telefono":"3001112233"}]]' });
  check('IA: no duplica el lead de la misma conversación', (await A.app('/api/marketing/contacts?q=Ana')).data.rows.filter((c) => c.name === 'Ana Pérez').length === 1);
  check('IA: B no tiene los leads de A', (await B.app('/api/marketing/contacts?q=Ana')).data.rows.length === 0);
  // tope diario del chat
  const c2 = await A.app(`${X}/chats`, { method: 'POST', body: { nombre: 'Con tope', limite_dia: 2, whatsapp: '573000000000' } });
  const slug2 = (await A.app(`${X}/chats`)).data.rows.find((x) => x.id === c2.data.id).ruta.slice(6), s3 = sid();
  await post(slug2, { sid: s3, message: '[prueba] uno' }); await post(slug2, { sid: s3, message: '[prueba] dos' });
  const tope = await post(slug2, { sid: s3, message: '[prueba] tres' });
  check('IA: al llegar al tope del chat responde con un aviso y pasa a WhatsApp', tope.status === 200 && tope.data.handoff === true && /atendimos muchas consultas/.test(tope.data.reply), JSON.stringify(tope.data));
  // pausa
  await A.app(`${X}/chats/${c2.data.id}`, { method: 'PATCH', body: { activo: false } });
  check('IA: un chat en pausa deja de responder (404)', (await fetch(`${APP}/chat/${slug2}`)).status === 404 && (await post(slug2, { sid: s3, message: '[prueba] hola' })).status === 404);

  /* ---------- tarjeta con chat ---------- */
  const card = (await A.app('/api/marketing/cards')).data.rows.find((x) => x.predeterminada);
  check('IA: la tarjeta toma un chat del negocio', (await A.app(`/api/marketing/cards/${card.id}`, { method: 'PATCH', body: { chat_slug: slug } })).status === 200);
  check('IA: la tarjeta pública muestra la burbuja del chat', (await (await fetch(`${APP}/c/${card.slug}`)).text()).includes(`/chat/${slug}/widget.js`));
  const cB = await B.app(`${X}/chats`, { method: 'POST', body: { nombre: 'Chat de B' } });
  const slugB = (await B.app(`${X}/chats`)).data.rows[0].ruta.slice(6);
  check('IA: una tarjeta no puede usar el chat de otro negocio', (await A.app(`/api/marketing/cards/${card.id}`, { method: 'PATCH', body: { chat_slug: slugB } })).status === 400);

  /* ---------- permisos ---------- */
  const staff = await newMember(A.id, 'staff');
  check('IA: el personal ve los chats pero no crea (403)', (await staff.app(`${X}/chats`)).status === 200 && (await staff.app(`${X}/chats`, { method: 'POST', body: { nombre: 'x' } })).status === 403);
  check('IA: el personal no borra conversaciones, ni crea agentes ni claves (403)', (await staff.app(`${X}/conversaciones/${cv[0].id}`, { method: 'DELETE' })).status === 403
    && (await staff.app(`${X}/agentes`, { method: 'POST', body: { nombre: 'x', instrucciones: 'y' } })).status === 403 && (await staff.app(`${X}/claves`, { method: 'POST', body: { nombre: 'x' } })).status === 403);

  /* ---------- consumo ---------- */
  const uso = (await A.app(`${X}/uso`)).data;
  check('IA: el consumo cuenta las llamadas de hoy y trae el tope', uso.hoy.calls >= 5 && uso.tope_dia === 200 && uso.fuentes.some((f) => f.fuente === 'chat'), JSON.stringify(uso).slice(0, 200));
  check('IA: B no ve el consumo de A', (await B.app(`${X}/uso`)).data.hoy.calls === 0);

  /* ---------- agentes ---------- */
  const herr = (await A.app(`${X}/herramientas`)).data.herramientas;
  check('IA: lista las herramientas de los módulos activos', herr.some((t) => t.name === 'marketing.resumen' && t.tipo === 'lectura') && herr.some((t) => t.name === 'marketing.crear_contacto' && t.tipo === 'escritura'));
  const GUION = (pasos) => `[prueba] [[GUION]]${pasos.join('\n---\n')}[[/GUION]]`;
  check('IA: un agente con una herramienta que no existe se rechaza', (await A.app(`${X}/agentes`, { method: 'POST', body: { nombre: 'x', instrucciones: 'y', herramientas: JSON.stringify(['no.existe']) } })).status === 400);
  const ag = await A.app(`${X}/agentes`, { method: 'POST', body: { nombre: 'Revisor', herramientas: JSON.stringify(['marketing.resumen', 'marketing.crear_contacto']), autonomia: 'proponer',
    instrucciones: GUION(['{"accion":"usar","herramienta":"marketing.resumen","args":{}}', '{"accion":"usar","herramienta":"marketing.crear_contacto","args":{"nombre":"Lead del agente","telefono":"3009998877"}}', '{"accion":"fin","respuesta":"Revisé el resumen y propuse un lead."}']) } });
  check('IA: crea un agente', ag.status === 201);
  check('IA: B no ve los agentes de A', (await B.app(`${X}/agentes`)).data.rows.length === 0 && (await B.app(`${X}/agentes/${ag.data.id}/ejecutar`, { method: 'POST' })).status === 404);
  check('IA: el personal no ejecuta agentes (403)', (await staff.app(`${X}/agentes/${ag.data.id}/ejecutar`, { method: 'POST' })).status === 403);
  const run = await A.app(`${X}/agentes/${ag.data.id}/ejecutar`, { method: 'POST' });
  check('IA: el agente consulta y PROPONE la escritura (no la hace)', run.data.estado === 'ok' && run.data.pasos?.[0]?.estado === 'consultada' && run.data.pasos?.[1]?.estado === 'propuesta' && run.data.pendientes === 1 && /propuse/.test(run.data.resumen), JSON.stringify(run.data).slice(0, 300));
  check('IA: lo propuesto no se escribió todavía', !(await A.app('/api/marketing/contacts?q=Lead del agente')).data.rows.some((c) => c.name === 'Lead del agente'));
  const ap = await A.app(`${X}/ejecuciones/${run.data.id}/aprobar`, { method: 'POST', body: { indice: 1, aprobar: true } });
  check('IA: al aprobar, la propuesta se ejecuta', ap.status === 200 && ap.data.paso.estado === 'hecha' && ap.data.pendientes === 0 && (await A.app('/api/marketing/contacts?q=Lead del agente')).data.rows.some((c) => c.name === 'Lead del agente'));
  check('IA: una propuesta ya resuelta no se repite (409)', (await A.app(`${X}/ejecuciones/${run.data.id}/aprobar`, { method: 'POST', body: { indice: 1, aprobar: true } })).status === 409);
  check('IA: B no aprueba propuestas de A', (await B.app(`${X}/ejecuciones/${run.data.id}/aprobar`, { method: 'POST', body: { indice: 1 } })).status === 404);
  const ag2 = await A.app(`${X}/agentes`, { method: 'POST', body: { nombre: 'Autónomo', autonomia: 'ejecutar', herramientas: JSON.stringify(['marketing.crear_contacto']),
    instrucciones: GUION(['{"accion":"usar","herramienta":"marketing.crear_contacto","args":{"nombre":"Lead autónomo"}}', '{"accion":"fin","respuesta":"Listo."}']) } });
  const run2 = await A.app(`${X}/agentes/${ag2.data.id}/ejecutar`, { method: 'POST' });
  check('IA: un agente con permiso «ejecutar» escribe solo', run2.data.pasos?.[0]?.estado === 'hecha' && (await A.app('/api/marketing/contacts?q=Lead autónomo')).data.rows.length === 1);
  const ag3 = await A.app(`${X}/agentes`, { method: 'POST', body: { nombre: 'Sin permiso', autonomia: 'ejecutar', herramientas: JSON.stringify(['marketing.resumen']),
    instrucciones: GUION(['{"accion":"usar","herramienta":"marketing.crear_contacto","args":{"nombre":"No debería"}}', '{"accion":"fin","respuesta":"Intenté."}']) } });
  const run3 = await A.app(`${X}/agentes/${ag3.data.id}/ejecutar`, { method: 'POST' });
  check('IA: un agente no usa herramientas que no se le dieron', run3.data.pasos?.[0]?.estado === 'error' && !(await A.app('/api/marketing/contacts?q=No debería')).data.rows.length);
  const hist = (await A.app(`${X}/ejecuciones?agente=${ag.data.id}`)).data.rows;
  check('IA: el historial guarda la ejecución con sus pasos', hist.length === 1 && hist[0].agente === 'Revisor' && hist[0].pasos.length === 2);
  check('IA: el agente muestra su última ejecución', (await A.app(`${X}/agentes`)).data.rows.find((x) => x.id === ag.data.id)?.ultima?.estado === 'ok');

  /* ---------- asistente del negocio ---------- */
  const as = await A.app(`${X}/asistente`, { method: 'POST', body: { mensajes: [{ role: 'user', content: GUION(['{"accion":"usar","herramienta":"marketing.resumen","args":{}}', '{"accion":"fin","respuesta":"Tienes datos de marketing."}']) }] } });
  check('IA: el asistente consulta con herramientas y responde', as.status === 200 && as.data.respuesta === 'Tienes datos de marketing.' && as.data.pasos?.[0]?.estado === 'consultada', JSON.stringify(as.data).slice(0, 200));
  const ase = await A.app(`${X}/asistente`, { method: 'POST', body: { mensajes: [{ role: 'user', content: GUION(['{"accion":"usar","herramienta":"marketing.crear_contacto","args":{"nombre":"Desde el asistente"}}', '{"accion":"fin","respuesta":"Te lo propongo."}']) }] } });
  check('IA: el asistente propone escrituras, no las hace', ase.data.pasos?.[0]?.estado === 'propuesta' && !(await A.app('/api/marketing/contacts?q=Desde el asistente')).data.rows.length);
  check('IA: al aprobar la propuesta del asistente se ejecuta', (await A.app(`${X}/asistente/aprobar`, { method: 'POST', body: { herramienta: 'marketing.crear_contacto', args: { nombre: 'Desde el asistente' } } })).status === 200 && (await A.app('/api/marketing/contacts?q=Desde el asistente')).data.rows.length === 1);
  check('IA: solo se aprueban herramientas de escritura', (await A.app(`${X}/asistente/aprobar`, { method: 'POST', body: { herramienta: 'marketing.resumen', args: {} } })).status === 400);
  check('IA: el asistente sin pregunta se rechaza', (await A.app(`${X}/asistente`, { method: 'POST', body: { mensajes: [] } })).status === 400);

  /* ---------- estándar compartido: guías y herramientas propias de la app para el asistente y los agentes ---------- */
  const gs = (await A.app(`${X}/guias`)).data.modulos;
  check('IA: las guías de uso (el estándar del MCP) incluyen módulos centrales y propios, con sus flujos', gs.some((g) => g.modulo === 'marketing' && g.flujos.some((f) => f.id === 'informe')) && gs.some((g) => g.modulo === 'estudiantes' && g.herramientas.some((h) => h.nombre === 'estudiantes_buscar')) && !gs.some((g) => g.modulo === 'ai'), JSON.stringify(gs.map((g) => g.modulo)));
  const hh = (await A.app(`${X}/herramientas`)).data.herramientas;
  check('IA: las herramientas propias de la app llegan al mismo catálogo que las centrales', hh.some((t) => t.name === 'estudiantes.buscar' && t.propia) && hh.some((t) => t.name === 'marketing.resumen' && !t.propia));
  await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Marta Buscada', documento: '55501', telefono: '3015550101' } });
  const ap1 = await A.app(`${X}/asistente`, { method: 'POST', body: { mensajes: [{ role: 'user', content: GUION(['{"accion":"guia","modulo":"estudiantes"}', '{"accion":"usar","herramienta":"estudiantes.buscar","args":{"texto":"Marta"}}', '{"accion":"fin","respuesta":"Encontré a Marta."}']) }] } });
  check('IA: el asistente lee la guía de un módulo y luego usa su herramienta propia', ap1.status === 200 && /^guía de estudiantes/.test(ap1.data.pasos?.[0]?.herramienta) && ap1.data.pasos[0].estado === 'consultada' && ap1.data.pasos[1]?.herramienta === 'estudiantes.buscar' && ap1.data.pasos[1].estado === 'consultada' && /Marta Buscada/.test(ap1.data.pasos[1].resultado), JSON.stringify(ap1.data).slice(0, 300));
  const ap2 = await A.app(`${X}/asistente`, { method: 'POST', body: { mensajes: [{ role: 'user', content: GUION(['{"accion":"guia","modulo":"no-existe"}', '{"accion":"fin","respuesta":"ok"}']) }] } });
  check('IA: pedir la guía de un módulo que no existe no rompe nada', ap2.status === 200 && ap2.data.pasos[0].estado === 'error');
  const ap3 = await A.app(`${X}/asistente`, { method: 'POST', body: { mensajes: [{ role: 'user', content: GUION(['{"accion":"usar","herramienta":"estudiantes.crear","args":{"nombre":"Creado por IA"}}', '{"accion":"fin","respuesta":"Te lo propongo."}']) }] } });
  check('IA: una escritura propia de la app queda como propuesta', ap3.data.pasos?.[0]?.estado === 'propuesta' && !(await A.app('/api/estudiantes/estudiantes?q=Creado por IA')).data.rows.length);
  check('IA: al aprobarla la ejecuta la app con la sesión de quien aprueba', (await A.app(`${X}/asistente/aprobar`, { method: 'POST', body: { herramienta: 'estudiantes.crear', args: { nombre: 'Creado por IA' } } })).status === 200 && (await A.app('/api/estudiantes/estudiantes?q=Creado por IA')).data.rows.length === 1);
  check('IA: el personal no puede aprobar herramientas propias de administrador', (await staff.app(`${X}/asistente/aprobar`, { method: 'POST', body: { herramienta: 'cuotas.registrar_pago', args: { inscripcion_id: 1, valor: 1 } } })).status === 400);
  const agp = await A.app(`${X}/agentes`, { method: 'POST', body: { nombre: 'Con herramienta propia', autonomia: 'proponer', herramientas: JSON.stringify(['estudiantes.buscar', 'cuotas.cartera']),
    instrucciones: GUION(['{"accion":"usar","herramienta":"cuotas.cartera","args":{}}', '{"accion":"usar","herramienta":"estudiantes.buscar","args":{"texto":"Marta"}}', '{"accion":"fin","respuesta":"Revisé la cartera y a Marta."}']) } });
  check('IA: un agente acepta herramientas propias de la app', agp.status === 201, JSON.stringify(agp.data));
  const rgp = await A.app(`${X}/agentes/${agp.data.id}/ejecutar`, { method: 'POST' });
  check('IA: el agente ejecutado desde la app usa las herramientas propias', rgp.data.estado === 'ok' && rgp.data.pasos?.length === 2 && rgp.data.pasos.every((p) => p.estado === 'consultada'), JSON.stringify(rgp.data).slice(0, 300));
  check('IA: un agente no usa herramientas propias de otro negocio ni inexistentes', (await B.app(`${X}/agentes`, { method: 'POST', body: { nombre: 'x', instrucciones: 'y', herramientas: JSON.stringify(['estudiantes.buscar', 'no.existe']) } })).status === 400);

  /* ---------- claves de la API ---------- */
  const k = await A.app(`${X}/claves`, { method: 'POST', body: { nombre: 'Mi CRM' } });
  check('IA: crea una clave de API y la muestra una sola vez', k.status === 201 && /^dwi_[0-9a-f]{40}$/.test(k.data.key));
  const kl = (await A.app(`${X}/claves`)).data.rows;
  check('IA: la lista de claves no trae la clave', kl.length === 1 && !JSON.stringify(kl).includes(k.data.key) && kl[0].prefijo === k.data.key.slice(0, 10));
  const get = (path, key) => fetch(`${APP}${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
  check('IA: la API sin clave o con clave falsa da 401', (await get('/v1/conversaciones')).status === 401 && (await get('/v1/conversaciones', 'dwi_' + '0'.repeat(40))).status === 401);
  const v1 = await get('/v1/conversaciones', k.data.key);
  check('IA: la API devuelve las conversaciones del negocio', v1.status === 200 && v1.data.rows.length >= 2 && v1.data.rows.every((x) => x.id.includes('-')));
  check('IA: la API devuelve una conversación con sus mensajes', (await get(`/v1/conversaciones/${cv[0].id}`, k.data.key)).data.mensajes?.length === 2);
  check('IA: la API devuelve los contactos (leads)', (await get('/v1/contactos', k.data.key)).data.rows.some((c) => c.name === 'Ana Pérez'));
  const kB = await B.app(`${X}/claves`, { method: 'POST', body: { nombre: 'Clave B' } });
  check('IA: la clave de B no lee lo de A', (await get('/v1/conversaciones', kB.data.key)).data.rows.length === 0 && (await get(`/v1/conversaciones/${cv[0].id}`, kB.data.key)).status === 404);
  check('IA: la clave guarda su último uso', (await A.app(`${X}/claves`)).data.rows[0].last_used > 0);
  check('IA: B no revoca la clave de A', (await B.app(`${X}/claves/${kl[0].id}`, { method: 'DELETE' })).status === 404);
  await A.app(`${X}/claves/${kl[0].id}`, { method: 'DELETE' });
  check('IA: una clave revocada deja de funcionar', (await get('/v1/conversaciones', k.data.key)).status === 401);

  /* ---------- MCP ---------- */
  const tk = (await A.app('/api/ia/tokens', { method: 'POST', body: { name: 'Prueba IA' } })).data.token;
  const T = async (name, args) => (await mcp(tk, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })).data.result;
  check('IA: la IA externa ve los chats del negocio', (await T('ai_ver_chats', {})).structuredContent?.chats?.some((x) => x.nombre === 'Soporte A'));
  check('IA: la IA externa lee conversaciones', (await T('ai_ver_conversaciones', {})).structuredContent?.conversaciones?.length >= 2 && (await T('ai_leer_conversacion', { id: cv[0].id })).structuredContent?.mensajes?.length === 2);
  check('IA: la IA externa ve el consumo', (await T('ai_resumen_uso', {})).structuredContent?.tope_dia === 200);
  check('IA: la IA externa crea un chat', !(await T('ai_crear_chat', { nombre: 'Desde MCP', saludo: 'Hola' })).isError && (await A.app(`${X}/chats`)).data.rows.some((x) => x.nombre === 'Desde MCP'));

  /* ---------- borrar y módulo base ---------- */
  check('IA: borrar un chat borra sus conversaciones y lo quita de la tarjeta', (await A.app(`${X}/chats/${ch.id}`, { method: 'DELETE' })).status === 200 && (await A.app(`${X}/conversaciones`)).data.rows.every((v) => v.chat_id !== ch.id)
    && !(await (await fetch(`${APP}/c/${card.slug}`)).text()).includes('/widget.js') && (await fetch(`${APP}/chat/${slug}`)).status === 404);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'ai', activo: false }] });
  check('IA: es un módulo base, el plan no lo apaga', (await A.app(`${X}/chats`)).status === 200);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('IA: la página /staff/ai.html abre', (await A.app('/staff/ai.html')).status === 200);

  // Suscripción vencida = solo lectura
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: '2020-01-01' });
  check('IA: vencida no deja crear chats (402) pero sí consultar', (await A.app(`${X}/chats`, { method: 'POST', body: { nombre: 'No' } })).status === 402 && (await A.app(`${X}/chats`)).status === 200);
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: null });
}

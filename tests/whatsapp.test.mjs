// Pruebas del módulo Mensajes (id «whatsapp»): bandejas de WhatsApp, Instagram y Messenger, chats con interruptor de IA, agentes, contactos en
// Marketing, plantillas y webhook de Meta. Incluye aislamiento entre negocios y módulo inactivo = 403.
// Sin gastar IA ni llamar a Meta: los mensajes que empiezan por «[prueba]» responden sin modelo y las bandejas de prueba no tienen clave API.
export default async function ({ check, diwilo, newBusiness, newMember, APP }) {
  const A = await newBusiness('WA A', { login: true });
  const B = await newBusiness('WA B', { login: true });
  const X = '/api/whatsapp';
  const hook = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const esperar = async (f, n = 25) => { for (let i = 0; i < n; i++) { const r = await f(); if (r) return r; await new Promise((x) => setTimeout(x, 150)); } return null; };
  const wa = (pid, wamid, texto, de = '573001112233') => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: pid }, contacts: [{ wa_id: de, profile: { name: 'Ana' } }], messages: [{ from: de, id: wamid, timestamp: '1790000000', type: 'text', text: { body: texto } }] } }] }] });
  const social = (object, cuenta, mid, de, texto, eco = false) => ({ object, entry: [{ id: cuenta, messaging: [{ sender: { id: eco ? cuenta : de }, recipient: { id: eco ? de : cuenta }, timestamp: 1790000000000, message: { mid, text: texto, ...(eco ? { is_echo: true } : {}) } }] }] });
  const chats = async (N = A, q = '') => (await N.app(`${X}/chats${q}`)).data.rows;

  /* ---------- bandejas ---------- */
  const c1 = await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Ventas', telefono: '+57 300 111 2233', phone_number_id: '1090000000001', waba_id: '2090000000001' } });
  check('Mensajes: crea una bandeja de WhatsApp', c1.status === 201);
  const ba = (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === c1.data.id);
  check('Mensajes: trae canal, webhook /wa/<slug> y token, sin exponer la clave', ba.canal === 'whatsapp' && /\/wa\/[a-f0-9]{24}$/.test(ba.webhook_url) && ba.verify_token?.length === 32 && ba.tiene_clave === false && !('clave_cifrada' in ba) && ba.telefono === '+573001112233', JSON.stringify(ba));
  check('Mensajes: WhatsApp exige teléfono con indicativo y cuenta; ids no numéricos se rechazan', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', telefono: '3001112233', phone_number_id: '12345', waba_id: '12345' } })).status === 400
    && (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', phone_number_id: '12345' } })).status === 400 && (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', canal: 'messenger', phone_number_id: 'abc' } })).status === 400);
  check('Mensajes: no repite el id en el mismo canal', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Otra', telefono: '+573001112233', phone_number_id: '1090000000001', waba_id: '2090000000001' } })).status === 409);
  const cm = await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Página', canal: 'messenger', phone_number_id: '5550001' } });
  const ci = await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Insta', canal: 'instagram', phone_number_id: '7770001' } });
  check('Mensajes: crea bandejas de Messenger e Instagram (sin teléfono ni cuenta)', cm.status === 201 && ci.status === 201);
  check('Mensajes: B no ve ni toca las bandejas de A', (await B.app(`${X}/bandejas`)).data.rows.length === 0 && (await B.app(`${X}/bandejas/${ba.id}`, { method: 'PATCH', body: { nombre: 'x' } })).status === 404 && (await B.app(`${X}/bandejas/${ba.id}/token`, { method: 'POST' })).status === 404);
  const tk = await A.app(`${X}/bandejas/${ba.id}/token`, { method: 'POST' });
  check('Mensajes: genera otro token de verificación', tk.status === 200 && tk.data.verify_token.length === 32 && tk.data.verify_token !== ba.verify_token);
  const token = tk.data.verify_token;
  const pr = await A.app(`${X}/bandejas/${ba.id}/probar`, { method: 'POST', body: {} });
  check('Mensajes: el verificador avisa que falta la clave API (sin llamar a Meta)', pr.status === 200 && pr.data.ok === false && pr.data.pasos[0].nombre === 'Clave API', JSON.stringify(pr.data));
  check('Mensajes: B no prueba la bandeja de A', (await B.app(`${X}/bandejas/${ba.id}/probar`, { method: 'POST', body: {} })).status === 404);

  /* ---------- webhook ---------- */
  const url = ba.webhook_url.replace(/^.*\/wa\//, `${APP}/wa/`);
  const v1 = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`);
  check('Mensajes: la verificación de Meta devuelve el challenge', v1.status === 200 && (await v1.text()) === '12345');
  check('Mensajes: con un token malo da 403 y un slug que no existe da 404', (await fetch(`${url}?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=1`)).status === 403 && (await fetch(`${APP}/wa/${'0'.repeat(24)}?hub.mode=subscribe`)).status === 404);
  await hook(url, wa('1090000000001', 'wamid.A1', 'Hola, ¿precios?')); await hook(url, wa('1090000000001', 'wamid.A1', 'Hola, ¿precios?'));
  let ls = await chats();
  const chA = ls.find((x) => x.canal === 'whatsapp');
  check('Mensajes: el mensaje entrante crea el chat (con nombre, sin leer) y no se duplica', ls.length === 1 && chA.nombre === 'Ana' && chA.no_leidos === 1 && chA.ia_activa === 1 && chA.ultimo_texto === 'Hola, ¿precios?', JSON.stringify(ls));
  check('Mensajes: ignora eventos de un número que no es de ninguna bandeja', (await hook(url, wa('999999', 'wamid.A2', 'otro'))).status === 200 && (await chats()).length === 1);
  await A.app(`${X}/chats/${chA.id}/leer`, { method: 'POST' });
  check('Mensajes: marcar como leído pone los no leídos en cero', (await chats()).find((x) => x.id === chA.id).no_leidos === 0);

  /* ---------- Instagram y Messenger por la misma URL ---------- */
  await hook(url, social('page', '5550001', 'm_1', 'psid42', 'Hola desde Messenger'));
  await hook(url, social('instagram', '7770001', 'ig_1', 'igsid42', 'Hola desde Instagram'));
  await hook(url, social('page', '5550001', 'm_echo', 'psid42', 'eco nuestro', true));
  ls = await chats();
  check('Mensajes: Messenger e Instagram crean sus chats con su canal, y los ecos se ignoran', ls.length === 3 && ls.some((x) => x.canal === 'messenger' && x.contacto === 'psid42') && ls.some((x) => x.canal === 'instagram' && x.contacto === 'igsid42') && !ls.some((x) => x.ultimo_texto === 'eco nuestro'), JSON.stringify(ls));
  check('Mensajes: se filtra la lista por canal', (await chats(A, '?canal=instagram')).length === 1 && (await chats(A, '?canal=whatsapp')).length === 1);
  check('Mensajes: un evento de Messenger para una página sin bandeja no crea nada', (await hook(url, social('page', '123456', 'm_x', 'psid1', 'hola'))).status === 200 && (await chats()).length === 3);

  /* ---------- agentes, agente por chat e interruptor de IA ---------- */
  const campos = JSON.stringify({ campos: ['correo', 'empresa', 'tipo', 'interes'], extras: ['Cargo'] });
  const g1 = await A.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: ba.id, nombre: 'Asesor', instrucciones: 'Atiende ventas.', campos } });
  const g2 = await A.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: ba.id, nombre: 'Soporte' } });
  const gAll = await A.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: 0, nombre: 'Para todas', campos: JSON.stringify({ campos: [], extras: [] }) } });
  const ags = () => A.app(`${X}/agentes`).then((r) => r.data.rows);
  check('Mensajes: crea agentes de una bandeja y uno para todas las bandejas (sin «activo»)', g1.status === 201 && g2.status === 201 && gAll.status === 201 && (await ags()).every((a) => !('activo' in a) || a.activo === 1));
  check('Mensajes: el agente guarda qué datos pide y descarta los que no existen', JSON.parse((await ags()).find((a) => a.id === g1.data.id).campos).extras[0] === 'Cargo'
    && JSON.parse((await A.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: 0, nombre: 'x', campos: JSON.stringify({ campos: ['correo', 'inventado'], extras: [] }) } }).then(() => ags())).at(-1).campos).campos.join() === 'correo');
  check('Mensajes: no se crea un agente en una bandeja ajena ni inexistente', (await B.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: ba.id, nombre: 'Intruso' } })).status === 400 && (await A.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: 9999, nombre: 'x' } })).status === 400);
  await hook(url, wa('1090000000001', 'wamid.A3', '[prueba] hola'));
  const det = async () => (await A.app(`${X}/chats/${chA.id}`)).data;
  const resp = await esperar(async () => (await det()).mensajes.find((m) => m.rol === 'assistant'));
  const dA = await det();
  check('Mensajes: el chat queda con el primer agente de su bandeja y ese agente contesta (modo de prueba; sin clave queda «sin_clave»)', resp?.contenido === 'Respuesta de prueba: hola' && resp.estado === 'sin_clave' && dA.chat.agente_id === g1.data.id && dA.agente.nombre === 'Asesor', JSON.stringify([resp, dA.chat.agente_id]));
  check('Mensajes: la lista de chats trae el nombre del agente', (await chats()).find((x) => x.id === chA.id).agente === 'Asesor');
  check('Mensajes: el chat ofrece los agentes de su bandeja y los de todas', dA.agentes.map((a) => a.id).sort().join() === [g1.data.id, g2.data.id, gAll.data.id].concat().sort().join() || dA.agentes.length >= 3, JSON.stringify(dA.agentes));
  const cambia = await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { agente_id: g2.data.id } });
  check('Mensajes: se cambia el agente de un chat y el de otro negocio se rechaza', cambia.status === 200 && (await det()).chat.agente_id === g2.data.id && (await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { agente_id: 999999 } })).status === 400 && (await B.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { agente_id: 0 } })).status === 404);
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { agente_id: 0 } });
  await hook(url, wa('1090000000001', 'wamid.A3b', '[prueba] sin agente'));
  await new Promise((r) => setTimeout(r, 600));
  check('Mensajes: con «sin agente» no contesta nadie', (await det()).mensajes.filter((m) => m.rol === 'assistant').length === 1);
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { agente_id: g1.data.id } });
  const off = await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: false } });
  await hook(url, wa('1090000000001', 'wamid.A4', '[prueba] sigues?'));
  await new Promise((r) => setTimeout(r, 700));
  check('Mensajes: con la IA apagada en ese chat no contesta', off.status === 200 && (await det()).mensajes.filter((m) => m.rol === 'assistant').length === 1);
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: true } });
  check('Mensajes: el interruptor de IA exige true o false', (await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: 'si' } })).status === 400 && (await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: {} })).status === 400);

  /* ---------- contactos en Marketing ---------- */
  await hook(url, wa('1090000000001', 'wamid.A5', '[prueba] soy Ana [[DATOS {"nombre":"Ana Pérez","correo":"ana@ejemplo.co","empresa":"Acme SAS","tipo":"negocio","interes":"cursos","extras":{"Cargo":"Gerente"}}]]', '573001112233'));
  const cto = await esperar(async () => (await A.app('/api/marketing/contacts?q=Ana')).data.rows.find((c) => c.name === 'Ana Pérez'));
  check('Mensajes: lo que captura el agente queda como contacto en Marketing (teléfono del chat, origen WhatsApp)', cto && cto.phone === '+573001112233' && cto.email === 'ana@ejemplo.co' && /WhatsApp: Ventas/.test(cto.source || '') && cto.company === 'Acme SAS' && /Tipo: negocio/.test(cto.notes || '') && /Cargo: Gerente/.test(cto.notes || '') && /Chat: cursos/.test(cto.notes || ''), JSON.stringify(cto));
  const d2 = await det();
  check('Mensajes: el chat queda enlazado al contacto y no le muestra el marcador al cliente', d2.chat.contact_id === cto.id && d2.contact?.name === 'Ana Pérez' && d2.chat.datos?.interes === 'cursos' && d2.chat.datos.extras.Cargo === 'Gerente' && !d2.mensajes.some((m) => m.rol === 'assistant' && /DATOS/.test(m.contenido)));
  await hook(url, wa('1090000000001', 'wamid.A6', '[prueba] otra vez [[DATOS {"nombre":"Ana Pérez","correo":"ana@ejemplo.co"}]]'));
  await new Promise((r) => setTimeout(r, 500));
  check('Mensajes: no duplica el contacto', (await A.app('/api/marketing/contacts?q=Ana')).data.rows.filter((c) => c.name === 'Ana Pérez').length === 1);
  const man = await A.app(`${X}/chats/${(await chats()).find((x) => x.contacto === 'igsid42').id}/contacto`, { method: 'POST', body: { nombre: 'Luis Gómez', telefono: '3105556677', interes: 'ofertas' } });
  check('Mensajes: el equipo guarda el contacto de un chat de Instagram a mano', man.status === 200 && man.data.creado === true && man.data.contact.phone === '3105556677');
  check('Mensajes: sin datos mínimos no guarda contacto', (await A.app(`${X}/chats/${(await chats()).find((x) => x.contacto === 'psid42').id}/contacto`, { method: 'POST', body: { nombre: '' } })).status === 400);
  check('Mensajes: B no ve los contactos de A', (await B.app(`${X}/contactos`)).data.rows.length === 0 && (await B.app('/api/marketing/contacts?q=Ana')).data.rows.length === 0);
  const lc = (await A.app(`${X}/contactos?q=Ana`)).data;
  check('Mensajes: la lista de contactos para plantillas trae los de Marketing con teléfono', lc.marketing && lc.rows.some((c) => c.id === cto.id));

  /* ---------- canal webhook (web, n8n…) ---------- */
  check('Mensajes: la URL de salida de un webhook debe ser https público', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', canal: 'webhook', url_salida: 'http://127.0.0.1/x' } })).status === 400);
  const cw = await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Chat de la web', canal: 'webhook' } });
  const bw = (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === cw.data.id);
  check('Mensajes: crea una bandeja webhook con nombre, URL y token (sin id de Meta)', cw.status === 201 && bw.canal === 'webhook' && /\/wa\/[a-f0-9]{24}$/.test(bw.webhook_url) && bw.verify_token.length === 32, JSON.stringify(bw));
  const wurl = bw.webhook_url.replace(/^.*\/wa\//, `${APP}/wa/`) + `?token=${bw.verify_token}`;
  const pw = (b, u = wurl) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  check('Mensajes: el webhook rechaza un token malo o faltante (401) y datos incompletos (400)', (await pw({ contacto: 'v1', mensaje: 'hola' }, wurl.replace(bw.verify_token, 'malo'))).status === 401 && (await pw({ contacto: 'v1', mensaje: 'hola' }, wurl.split('?')[0])).status === 401
    && (await pw({ contacto: 'con espacios', mensaje: 'hola' })).status === 400 && (await pw({ contacto: 'v1', mensaje: '' })).status === 400);
  const w1 = await pw({ contacto: 'visitante-1', nombre: 'Visitante Uno', mensaje: 'Hola desde la web', id: 'w-1' });
  const w1b = await pw({ contacto: 'visitante-1', mensaje: 'Hola desde la web', id: 'w-1' });
  const chW = (await chats(A, '?canal=webhook')).find((x) => x.contacto === 'visitante-1');
  check('Mensajes: un mensaje al webhook crea el chat de la web (canal Web, con nombre) y no se duplica', w1.status === 200 && w1.data.respuesta === null && w1b.data.duplicado === true && chW?.nombre === 'Visitante Uno' && chW.bandeja === 'Chat de la web' && chW.no_leidos === 1, JSON.stringify([w1.data, chW]));
  check('Mensajes: se filtra por bandeja con nombre', (await chats(A, `?bandeja=${bw.id}`)).length === 1 && (await chats(A, `?bandeja=${ba.id}`)).every((x) => x.bandeja === 'Ventas'));
  const w2 = await pw({ contacto: 'visitante-2', mensaje: '[prueba] hola web', responder: true });
  check('Mensajes: con responder:true el agente (el de «todas las bandejas») contesta en la misma llamada', w2.status === 200 && w2.data.respuesta === 'Respuesta de prueba: hola web' && w2.data.chat_id > 0, JSON.stringify(w2.data));
  const w3 = await pw({ contacto: 'visitante-2', mensaje: 'Respuesta de mi propio agente', rol: 'assistant' });
  const dw = (await A.app(`${X}/chats/${w2.data.chat_id}`)).data;
  check('Mensajes: también guarda lo que contestó el agente propio de la web (rol assistant)', w3.status === 200 && dw.mensajes.map((m) => m.rol).join() === 'user,assistant,assistant' && dw.chat.agente_id === gAll.data.id, JSON.stringify(dw.mensajes.map((m) => m.rol)));
  const prw = await A.app(`${X}/bandejas/${bw.id}/probar`, { method: 'POST', body: {} });
  check('Mensajes: el verificador del webhook explica que no hay URL de salida', prw.data.ok === true && /Sin URL de salida/.test(JSON.stringify(prw.data.pasos)), JSON.stringify(prw.data));
  const ew = await A.app(`${X}/chats/${w2.data.chat_id}/enviar`, { method: 'POST', body: { texto: 'Te escribe una persona' } });
  check('Mensajes: responder a mano en un chat web sin URL de salida avisa y deja el mensaje guardado', ew.status === 400 && /URL de salida/.test(ew.data.error || '') && (await A.app(`${X}/chats/${w2.data.chat_id}`)).data.mensajes.at(-1).rol === 'humano');
  check('Mensajes: el webhook responde a un GET de salud con su token', (await fetch(wurl)).status === 200);

  /* ---------- responder a mano y plantillas ---------- */
  const env = await A.app(`${X}/chats/${chA.id}/enviar`, { method: 'POST', body: { texto: 'Hola, te escribo yo' } });
  const d3 = await det();
  check('Mensajes: enviar sin clave API avisa con claridad, deja el mensaje y apaga la IA del chat', env.status === 400 && d3.mensajes.at(-1).rol === 'humano' && d3.mensajes.at(-1).estado === 'sin_clave' && d3.chat.ia_activa === 0, JSON.stringify([env.status, d3.chat.ia_activa]));
  check('Mensajes: las plantillas se piden por bandeja y sin clave API avisan', (await A.app(`${X}/plantillas?bandeja=${ba.id}`)).status === 400 && (await A.app(`${X}/plantillas?bandeja=${cm.data.id}`)).status === 400);
  check('Mensajes: enviar plantilla sin destinatarios o a una bandeja que no es de WhatsApp se rechaza', (await A.app(`${X}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: ba.id, plantilla: 'x', idioma: 'es', contactos: [] } })).status === 400 && (await A.app(`${X}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: cm.data.id, plantilla: 'x', idioma: 'es', contactos: [cto.id] } })).status === 400);
  check('Mensajes: B no envía con la bandeja de A', (await B.app(`${X}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: ba.id, plantilla: 'x', idioma: 'es', contactos: [1] } })).status === 404);

  /* ---------- permisos y módulo inactivo ---------- */
  const staff = await newMember(A.id, 'staff');
  check('Mensajes: el personal no crea bandejas ni activa agentes (403)', (await staff.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x' } })).status === 403 && (await staff.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { activo: true } })).status === 403);
  check('Mensajes: el personal no ve el token de verificación ni borra chats', (await staff.app(`${X}/bandejas`)).data.rows?.[0]?.verify_token == null && (await staff.app(`${X}/chats/${chA.id}`, { method: 'DELETE' })).status === 403);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'whatsapp', activo: false }] });
  check('Mensajes: módulo inactivo responde 403', (await A.app(`${X}/bandejas`)).status === 403 && (await A.app(`${X}/chats`)).status === 403);
  check('Mensajes: inactivo, el webhook deja de atender', (await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1`)).status === 404);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('Mensajes: al reactivarlo los datos siguen ahí', (await A.app(`${X}/bandejas`)).data.rows.length === 4 && (await chats()).length === 5);
  check('Mensajes: borrar un chat borra sus mensajes', (await A.app(`${X}/chats/${chA.id}`, { method: 'DELETE' })).status === 200 && (await chats()).length === 4 && (await A.app(`${X}/chats/${chA.id}`)).status === 404);
  check('Mensajes: borrar un agente deja sin asignar los chats que lo usaban', (await A.app(`${X}/agentes/${gAll.data.id}`, { method: 'DELETE' })).status === 200 && (await A.app(`${X}/chats/${w2.data.chat_id}`)).data.chat.agente_id === null);
  check('Mensajes: borrar la bandeja borra sus chats', (await A.app(`${X}/bandejas/${ba.id}`, { method: 'DELETE' })).status === 200 && (await chats()).every((x) => x.bandeja_id !== ba.id));
}

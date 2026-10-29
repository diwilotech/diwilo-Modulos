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
  check('Mensajes: crea una bandeja de WhatsApp', c1.status === 201, JSON.stringify(c1));
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
  check('Mensajes: si Messenger llega con otro id y el negocio tiene una sola bandeja de ese canal, va a esa; un canal sin bandeja no crea nada', (await hook(url, social('page', '123456', 'm_x', 'psid1', 'hola'))).status === 200 && (await chats()).some((x) => x.canal === 'messenger' && x.contacto === 'psid1') && (await hook(url, { object: 'instagram', entry: [{ id: '1', changes: [{ field: 'messages', value: { sender: { id: 'igsid9' }, recipient: { id: '1' }, timestamp: 1790000000, message: { mid: 'ig_new', text: 'formato nuevo' } } }] }] })).status === 200 && (await chats()).some((x) => x.contacto === 'igsid9' && x.ultimo_texto === 'formato nuevo'));

  /* ---------- agentes, agente por chat e interruptor de IA ---------- */
  const campos = JSON.stringify({ campos: ['correo', 'empresa', 'tipo', 'interes'], extras: ['Cargo'] });
  const g1 = await A.app(`${X}/agentes`, { method: 'POST', body: { bandejas: JSON.stringify([ba.id, cm.data.id]), nombre: 'Asesor', instrucciones: 'Atiende ventas.', campos } });
  const g2 = await A.app(`${X}/agentes`, { method: 'POST', body: { bandejas: JSON.stringify([ba.id]), nombre: 'Soporte' } });
  const gAll = await A.app(`${X}/agentes`, { method: 'POST', body: { bandejas: '[]', nombre: 'Para todas', campos: JSON.stringify({ campos: [], extras: [] }) } });
  const ags = () => A.app(`${X}/agentes`).then((r) => r.data.rows);
  const espera = async (seg) => { for (const g of await ags()) await A.app(`${X}/agentes/${g.id}`, { method: 'PATCH', body: { espera_seg: seg } }); };
  check('Mensajes: crea agentes de una bandeja y uno para todas las bandejas (sin «activo»)', g1.status === 201 && g2.status === 201 && gAll.status === 201 && (await ags()).every((a) => !('activo' in a) || a.activo === 1));
  check('Mensajes: el agente guarda qué datos pide y descarta los que no existen', JSON.parse((await ags()).find((a) => a.id === g1.data.id).campos).extras[0] === 'Cargo'
    && JSON.parse((await A.app(`${X}/agentes`, { method: 'POST', body: { bandejas: '[]', nombre: 'x', campos: JSON.stringify({ campos: ['correo', 'inventado'], extras: [] }) } }).then(() => ags())).at(-1).campos).campos.join() === 'correo');
  await espera(0);   // las pruebas responden a cada mensaje al instante
  check('Mensajes: no se crea un agente en una bandeja ajena ni inexistente', (await B.app(`${X}/agentes`, { method: 'POST', body: { bandejas: JSON.stringify([ba.id]), nombre: 'Intruso' } })).status === 400 && (await A.app(`${X}/agentes`, { method: 'POST', body: { bandejas: '[9999]', nombre: 'x' } })).status === 400);
  await hook(url, wa('1090000000001', 'wamid.A3', '[prueba] hola'));
  const det = async () => (await A.app(`${X}/chats/${chA.id}`)).data;
  const resp = await esperar(async () => (await det()).mensajes.find((m) => m.rol === 'assistant'));
  const dA = await det();
  check('Mensajes: el chat queda con el primer agente de su bandeja y ese agente contesta (modo de prueba; sin clave queda «sin_clave»)', resp?.contenido === 'Respuesta de prueba: hola' && resp.estado === 'sin_clave' && dA.chat.agente_id === g1.data.id && dA.agente.nombre === 'Asesor', JSON.stringify([resp, dA.chat.agente_id]));
  check('Mensajes: la lista de chats trae el nombre del agente', (await chats()).find((x) => x.id === chA.id).agente === 'Asesor');
  check('Mensajes: el chat ofrece los agentes de su bandeja y los de todas', dA.agentes.map((a) => a.id).sort().join() === [g1.data.id, g2.data.id, gAll.data.id].concat().sort().join() || dA.agentes.length >= 3, JSON.stringify(dA.agentes));
  const cambia = await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { agente_id: g2.data.id } });
  const agsLista = await ags();
  check('Mensajes: un agente guarda varias bandejas (WhatsApp y Messenger) y otro sirve en todas', JSON.stringify(agsLista.find((a) => a.id === g1.data.id).bandejas) === JSON.stringify([ba.id, cm.data.id]) && agsLista.find((a) => a.id === gAll.data.id).bandejas.length === 0);
  const chMs = (await chats()).find((x) => x.contacto === 'psid42'), dMs = (await A.app(`${X}/chats/${chMs.id}`)).data;
  check('Mensajes: el chat de Messenger ofrece al agente de varias bandejas y al de todas, pero no al de solo WhatsApp', dMs.agentes.some((a) => a.id === g1.data.id) && dMs.agentes.some((a) => a.id === gAll.data.id) && !dMs.agentes.some((a) => a.id === g2.data.id), JSON.stringify(dMs.agentes));
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

  /* ---------- aviso en rojo: no supo responder o piden un asesor ---------- */
  await hook(url, wa('1090000000001', 'wamid.R1', '[prueba] quiero hablar con un asesor'));
  const rojo = await esperar(async () => (await chats()).find((x) => x.id === chA.id && x.atencion));
  check('Mensajes: si el cliente pide un asesor, el chat queda marcado (pide_asesor) y se ve en la lista', rojo?.atencion === 'pide_asesor', JSON.stringify(rojo));
  check('Mensajes: «Ya lo atendí» limpia la marca', (await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { atencion: false } })).status === 200 && (await det()).chat.atencion === null);
  await hook(url, wa('1090000000001', 'wamid.R2', '[prueba] no sé [[ASESOR:no_sabe]]'));
  const r2 = await esperar(async () => (await chats()).find((x) => x.id === chA.id && x.atencion === 'no_sabe'));
  const dR = await det();
  check('Mensajes: si el agente no supo responder (marca ASESOR) el chat queda en rojo y la marca no se le muestra al cliente', r2 && !dR.mensajes.some((m) => m.rol === 'assistant' && /ASESOR/.test(m.contenido)), JSON.stringify(r2));
  await A.app(`${X}/chats/${chA.id}/enviar`, { method: 'POST', body: { texto: 'Soy una persona, te ayudo' } });
  check('Mensajes: cuando una persona responde, la marca roja se quita', (await det()).chat.atencion === null);
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: true } });
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { alerta_asesor: false } });
  await hook(url, wa('1090000000001', 'wamid.R3', '[prueba] pásame con un asesor humano'));
  await new Promise((r) => setTimeout(r, 700));
  check('Mensajes: con el aviso apagado en el agente no marca el chat', (await det()).chat.atencion === null && (await ags()).find((a) => a.id === g1.data.id).alerta_asesor === 0);
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { alerta_asesor: true } });

  /* ---------- la IA lee el chat: sugerir una respuesta o responder ya con la IA apagada ---------- */
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: false } });
  await hook(url, wa('1090000000001', 'wamid.S1', '[prueba] ¿tienen horarios?'));
  await new Promise((r) => setTimeout(r, 600));
  const antes = (await det()).mensajes.length;
  const sug = await A.app(`${X}/chats/${chA.id}/sugerir`, { method: 'POST', body: {} });
  const desp = await det();
  check('Mensajes: «Sugerir» devuelve una respuesta redactada por la IA con la IA del chat apagada y no envía ni guarda nada', sug.status === 200 && sug.data.sugerencia === 'Respuesta de prueba: ¿tienen horarios?' && desp.mensajes.length === antes && desp.chat.ia_activa === 0, JSON.stringify([sug.status, sug.data, antes, desp.mensajes.length]));
  const ya = await A.app(`${X}/chats/${chA.id}/responder-ia`, { method: 'POST', body: {} });
  const desp2 = await det();
  check('Mensajes: «Responder con IA» responde ya aunque la IA esté apagada (queda guardado y la IA sigue apagada)', ya.status === 200 && desp2.mensajes.at(-1).rol === 'assistant' && desp2.mensajes.at(-1).contenido === 'Respuesta de prueba: ¿tienen horarios?' && desp2.chat.ia_activa === 0, JSON.stringify([ya.status, ya.data]));
  check('Mensajes: B no usa la IA de los chats de A', (await B.app(`${X}/chats/${chA.id}/sugerir`, { method: 'POST', body: {} })).status === 404 && (await B.app(`${X}/chats/${chA.id}/responder-ia`, { method: 'POST', body: {} })).status === 404);
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: true } });

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
  check('Mensajes: el equipo guarda el contacto de un chat de Instagram a mano', man.status === 200 && man.data.creado === true && man.data.contact.phone === '+573105556677');
  check('Mensajes: sin datos mínimos no guarda contacto', (await A.app(`${X}/chats/${(await chats()).find((x) => x.contacto === 'psid42').id}/contacto`, { method: 'POST', body: { nombre: '' } })).status === 400);
  check('Mensajes: B no ve los contactos de A', (await B.app(`${X}/contactos`)).data.rows.length === 0 && (await B.app('/api/marketing/contacts?q=Ana')).data.rows.length === 0);
  const lc = (await A.app(`${X}/contactos?q=Ana`)).data;
  check('Mensajes: la lista de contactos para plantillas trae los de Marketing con teléfono', lc.marketing && lc.rows.some((c) => c.id === cto.id));

  /* ---------- bienvenida, insistir y corregir un contacto que ya existía ---------- */
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { bienvenida: '¡Hola{nombre}! Soy el asistente. Elige: 1) Información 2) Cotizar 3) Un asesor' } });
  const bien = '¡Hola Ana! Soy el asistente. Elige: 1) Información 2) Cotizar 3) Un asesor';
  await hook(url, wa('1090000000001', 'wamid.B1', 'hola', '573001118888'));
  const chB1 = await esperar(async () => (await chats()).find((x) => x.contacto === '573001118888' && x.ultimo_rol === 'assistant'));
  const mB1 = chB1 && (await A.app(`${X}/chats/${chB1.id}`)).data.mensajes;
  check('Mensajes: si la persona solo saluda, recibe el mensaje de bienvenida prediseñado (con su nombre) sin gastar IA', mB1?.length === 2 && mB1[1].contenido === bien, JSON.stringify(mB1));
  await hook(url, wa('1090000000001', 'wamid.B2', '[prueba] cuánto cuesta', '573001117777'));
  const chB2 = await esperar(async () => (await chats()).find((x) => x.contacto === '573001117777' && x.ultimo_rol === 'assistant'));
  const mB2 = chB2 && (await A.app(`${X}/chats/${chB2.id}`)).data.mensajes;
  check('Mensajes: si ya preguntó algo, la bienvenida va seguida de la respuesta, en un solo mensaje', mB2?.length === 2 && mB2[1].contenido === `${bien}\n\nRespuesta de prueba: cuánto cuesta`, JSON.stringify(mB2));
  await hook(url, wa('1090000000001', 'wamid.B3', '[prueba] otra cosa', '573001118888'));
  await new Promise((r) => setTimeout(r, 600));
  check('Mensajes: la bienvenida se envía una sola vez por chat', (await A.app(`${X}/chats/${chB1.id}`)).data.mensajes.filter((m) => m.contenido.startsWith('¡Hola Ana')).length === 1);
  check('Mensajes: el agente guarda si insiste en pedir los datos', (await ags()).find((a) => a.id === g1.data.id).insistir === 1 && (await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { insistir: false } })).status === 200 && (await ags()).find((a) => a.id === g1.data.id).insistir === 0);
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { insistir: true, bienvenida: '' } });
  // un contacto que ya estaba en Marketing con otro nombre (p. ej. el negocio que llenó el formulario): se identifica y se corrige
  const previo = await A.app('/api/marketing/contacts', { method: 'POST', body: { name: 'Restaurante Demo', phone: '+57 300 111 9999', email: 'luis@ejemplo.co', stage: 'lead', source: 'Sitio web' } });
  await hook(url, wa('1090000000001', 'wamid.C1', '[prueba] soy Luis [[DATOS {"nombre":"Luis Prado","correo":"luis@ejemplo.co","es_cliente":"si","interes":"una asesoría"}]]', '573001119999'));
  const ctoL = await esperar(async () => { const r = (await A.app('/api/marketing/contacts?q=Luis')).data.rows.find((c) => c.id === previo.data.id); return r && r.name === 'Luis Prado' ? r : null; });
  const cts2 = (await A.app('/api/marketing/contacts?q=Restaurante')).data.rows.concat((await A.app('/api/marketing/contacts?q=Luis')).data.rows);
  check('Mensajes: si el teléfono ya estaba en Marketing, el contacto se corrige con el nombre que dio (no se crea otro): el nombre anterior pasa a empresa y a las notas', ctoL && ctoL.company === 'Restaurante Demo' && /Nombre anterior: Restaurante Demo/.test(ctoL.notes || '') && ctoL.stage === 'cliente' && new Set(cts2.filter((c) => c.phone && c.phone.replace(/\D/g, '').endsWith('3001119999')).map((c) => c.id)).size === 1, JSON.stringify(ctoL));
  const chC = (await chats()).find((x) => x.contacto === '573001119999');
  check('Mensajes: el chat muestra el nombre que dio y queda enlazado al contacto de siempre', chC?.nombre === 'Luis Prado' && chC.contact_id === previo.data.id, JSON.stringify(chC));

  // Un contacto ya completo en Marketing: el chat se enlaza, muestra su nombre, la bienvenida lo trata por ese nombre y el agente no le vuelve a pedir nada
  const carla = await A.app('/api/marketing/contacts', { method: 'POST', body: { name: 'Carla Ruiz', phone: '+57 300 111 6666', email: 'carla@ruiz.co', company: 'Ruiz SAS', stage: 'cliente', notes: 'Pidió una cotización de dashboards' } });
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { bienvenida: '¡Hola{nombre}! ¿En qué te ayudo?', campos: JSON.stringify({ campos: ['correo', 'empresa', 'tipo', 'interes'], extras: [] }) } });
  await hook(url, wa('1090000000001', 'wamid.D1', 'hola', '573001116666'));
  const chD = await esperar(async () => (await chats()).find((x) => x.contacto === '573001116666' && x.ultimo_rol === 'assistant'));
  const dD = chD && (await A.app(`${X}/chats/${chD.id}`)).data;
  check('Mensajes: si el teléfono ya está en Marketing, el chat se enlaza, muestra el nombre del contacto (no el del perfil de WhatsApp) y lo saluda por ese nombre (cliente: «qué gusto saludarte de nuevo»)', dD?.chat.contact_id === carla.data.id && dD.chat.nombre === 'Carla Ruiz' && dD.mensajes[1].contenido === '¡Hola Carla! 👋 Qué gusto saludarte de nuevo. ¿En qué te podemos ayudar hoy?', JSON.stringify([dD?.chat.nombre, dD?.mensajes]));
  await hook(url, wa('1090000000001', 'wamid.D2', '[prueba] quiero hablar con un asesor [[DATOS {"nombre":"Otro Nombre","correo":"otro@x.co"}]]', '573001116666'));
  await new Promise((r) => setTimeout(r, 700));
  const dD2 = (await A.app(`${X}/chats/${chD.id}`)).data;
  check('Mensajes: a quien ya está completo no se le pide ni se le cambia nada, pero sí queda en rojo para el asesor', dD2.chat.datos === null && (await A.app('/api/marketing/contacts?q=Carla')).data.rows.some((c) => c.id === carla.data.id && c.name === 'Carla Ruiz' && c.email === 'carla@ruiz.co') && dD2.chat.atencion === 'pide_asesor', JSON.stringify([dD2.chat.datos, dD2.chat.atencion]));
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { bienvenida: '', campos } });

  // Quien ya presentó una solicitud (un lead del formulario del sitio con sus notas): el primer mensaje le dice que la vimos y le pregunta si sigue con eso u otra consulta
  const lead = await A.app('/api/marketing/contacts', { method: 'POST', body: { name: 'Mario Lara', phone: '+57 300 111 5555', email: 'mario@lara.co', stage: 'lead', source: 'Sitio web', notes: 'Apps: Residentes — dos sedes' } });
  await hook(url, wa('1090000000001', 'wamid.E1', 'hola', '573001115555'));
  const chE = await esperar(async () => (await chats()).find((x) => x.contacto === '573001115555' && x.ultimo_rol === 'assistant'));
  const mE = chE && (await A.app(`${X}/chats/${chE.id}`)).data.mensajes;
  check('Mensajes: quien ya presentó una solicitud recibe «vimos la solicitud que presentaste» (con lo que pidió) y la pregunta de si sigue con eso u otra consulta', mE?.[1]?.contenido === '¡Hola Mario! 👋 Vimos la solicitud que presentaste («Apps: Residentes — dos sedes»). Gracias por escribirnos. ¿Quieres que sigamos con eso o tienes otra consulta?', JSON.stringify(mE));
  await hook(url, wa('1090000000001', 'wamid.E2', '[prueba] háblame de residentes', '573001115555'));
  await new Promise((r) => setTimeout(r, 600));
  check('Mensajes: el saludo es solo la primera vez; después responde el agente', (await A.app(`${X}/chats/${chE.id}`)).data.mensajes.at(-1).contenido === 'Respuesta de prueba: háblame de residentes');
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { bienvenida_conocido: '¡Hola{nombre}! Soy de Diwilo y vi a {empresa}.', usar_conocido: true } });
  await A.app('/api/marketing/contacts', { method: 'POST', body: { name: 'Nora Vega', phone: '+57 300 111 4444', email: 'nora@vega.co', company: 'Vega SAS', stage: 'lead' } });
  await hook(url, wa('1090000000001', 'wamid.E3', 'hola', '573001114444'));
  const chE3 = await esperar(async () => (await chats()).find((x) => x.contacto === '573001114444' && x.ultimo_rol === 'assistant'));
  check('Mensajes: el agente puede tener su propio saludo para quienes ya están en Marketing ({nombre}, {empresa})', (await A.app(`${X}/chats/${chE3.id}`)).data.mensajes[1].contenido === '¡Hola Nora! Soy de Diwilo y vi a Vega SAS.');
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { bienvenida_conocido: '', usar_conocido: false } });
  // el teléfono de un chat sin teléfono se guarda con indicativo
  const igChat = (await chats()).find((x) => x.contacto === 'igsid42');
  const tel1 = await A.app(`${X}/chats/${igChat.id}/contacto`, { method: 'POST', body: { nombre: 'Luis Gómez', telefono: '+1 415 555 2671', tipo: 'persona', ciudad: 'Miami', es_cliente: 'no' } });
  check('Mensajes: un teléfono con otro indicativo (+1) se guarda tal cual y un celular colombiano de 10 dígitos recibe +57', tel1.status === 200 && tel1.data.contact.phone === '+14155552671'
    && (await A.app(`${X}/chats/${(await chats()).find((x) => x.contacto === 'psid42').id}/contacto`, { method: 'POST', body: { nombre: 'Pedro Soto', telefono: '3105556677' } })).data.contact.phone === '+573105556677');

  // Guardado automático y «añadir a uno guardado»
  await hook(url, wa('1090000000001', 'wamid.G1', 'hola', '573001114321'));
  const kG = await esperar(async () => (await A.app('/api/marketing/contacts?q=3001114321')).data.rows[0]);
  check('Mensajes: quien escribe por WhatsApp con nombre de perfil se guarda solo en Marketing (teléfono, origen WhatsApp)', kG?.name === 'Ana' && kG.phone === '+573001114321' && /WhatsApp: Ventas/.test(kG.source || ''), JSON.stringify(kG));
  await A.app(`${X}/bandejas/${ba.id}`, { method: 'PATCH', body: { autoguardar: false } });
  await hook(url, wa('1090000000001', 'wamid.G2', 'hola', '573001114322'));
  await new Promise((r) => setTimeout(r, 500));
  check('Mensajes: con el guardado automático apagado en la bandeja no se crea el contacto', (await A.app('/api/marketing/contacts?q=3001114322')).data.rows.length === 0);
  await A.app(`${X}/bandejas/${ba.id}`, { method: 'PATCH', body: { autoguardar: true } });
  const chP = (await chats()).find((x) => x.contacto === 'psid42');
  const en = await A.app(`${X}/chats/${chP.id}/enlazar`, { method: 'POST', body: { contact_id: carla.data.id } });
  const dP = (await A.app(`${X}/chats/${chP.id}`)).data, dCarla = (await A.app(`${X}/chats/${chD.id}`)).data;
  check('Mensajes: se añade un chat de Messenger a un contacto guardado (el de WhatsApp): queda enlazado, se anota el canal y cada chat ve los otros', en.status === 200 && dP.chat.contact_id === carla.data.id && dP.contact.name === 'Carla Ruiz' && dP.otros_chats.some((o) => o.id === chD.id && o.canal === 'whatsapp') && dCarla.otros_chats.some((o) => o.id === chP.id && o.canal === 'messenger') && /Messenger:/.test(dP.contact.notes || ''), JSON.stringify([en.status, dP.otros_chats]));
  const lt = (await A.app(`${X}/contactos?con=todos&q=Carla`)).data.rows.find((x) => x.id === carla.data.id);
  check('Mensajes: la lista de contactos muestra en qué canales tiene chat cada uno', lt && lt.canales.includes('whatsapp') && lt.canales.includes('messenger'), JSON.stringify(lt));
  check('Mensajes: se quita el enlace y B no enlaza chats de A ni usa sus contactos', (await A.app(`${X}/chats/${chP.id}/enlazar`, { method: 'POST', body: { contact_id: null } })).status === 200 && (await A.app(`${X}/chats/${chP.id}`)).data.chat.contact_id === null && (await B.app(`${X}/chats/${chP.id}/enlazar`, { method: 'POST', body: { contact_id: 1 } })).status === 404 && (await A.app(`${X}/chats/${chP.id}/enlazar`, { method: 'POST', body: { contact_id: 999999 } })).status === 404);
  check('Mensajes: la lista del equipo para los administradores existe y es solo para quien administra', Array.isArray((await A.app(`${X}/admins/equipo`)).data.equipo) && (await (await newMember(A.id, 'staff')).app(`${X}/admins/equipo`)).status === 403);

  /* ---------- canal webhook (web, n8n…) ---------- */
  check('Mensajes: la URL de salida de un webhook debe ser https público', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', canal: 'webhook', url_salida: 'http://127.0.0.1/x' } })).status === 400);
  const cw = await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Chat de la web', canal: 'webhook' } });
  const bw = (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === cw.data.id);
  check('Mensajes: crea una bandeja webhook con nombre, URL y token (sin id de Meta)', cw.status === 201 && bw.canal === 'webhook' && /\/wa\/[a-f0-9]{24}$/.test(bw.webhook_url) && bw.verify_token.length === 32, JSON.stringify(bw));
  const wurl = bw.webhook_url.replace(/^.*\/wa\//, `${APP}/wa/`) + `?token=${bw.verify_token}`;
  const pw = (b, u = wurl) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  check('Mensajes: el webhook rechaza un token malo o faltante (401) y datos incompletos (400)', (await pw({ contacto: 'v1', mensaje: 'hola' }, wurl.replace(bw.verify_token, 'malo'))).status === 401 && (await pw({ contacto: 'v1', mensaje: 'hola' }, wurl.split('?')[0])).status === 401
    && (await pw({ contacto: 'con espacios', mensaje: 'hola' })).status === 400 && (await pw({ contacto: 'v1', mensaje: '' })).status === 400);
  const w1 = await pw({ contacto: 'visitante-1', nombre: 'Visitante Uno', mensaje: 'Hola desde la web', id: 'w-1', pais: 'co', dispositivo: 'desktop', pagina: 'https://ejemplo.co/precios' });
  const w1b = await pw({ contacto: 'visitante-1', mensaje: 'Hola desde la web', id: 'w-1' });
  const chW = (await chats(A, '?canal=webhook')).find((x) => x.contacto === 'visitante-1');
  check('Mensajes: un mensaje al webhook crea el chat de la web (canal Web, con nombre) y no se duplica', w1.status === 200 && w1.data.respuesta === null && w1b.data.duplicado === true && chW?.nombre === 'Visitante Uno' && chW.bandeja === 'Chat de la web' && chW.no_leidos === 1, JSON.stringify([w1.data, chW]));
  check('Mensajes: el chat web trae país y dispositivo (CO · escritorio) y la página', chW.pais === 'CO' && chW.dispositivo === 'escritorio' && chW.pagina === 'https://ejemplo.co/precios', JSON.stringify(chW));
  const wm = await pw({ contacto: 'visitante-3', mensaje: 'Desde un celular', pais: 'US', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile/15E148' });
  check('Mensajes: el user-agent móvil se reconoce (US · móvil) y un país inválido se ignora', wm.status === 200 && (await chats(A, '?canal=webhook')).find((x) => x.contacto === 'visitante-3').dispositivo === 'móvil' && (await chats(A, '?canal=webhook')).find((x) => x.contacto === 'visitante-3').pais === 'US'
    && (await pw({ contacto: 'visitante-4', mensaje: 'x', pais: 'ZZZ' })).status === 200 && (await chats(A, '?canal=webhook')).find((x) => x.contacto === 'visitante-4').pais === null);
  check('Mensajes: en WhatsApp el país sale del indicativo (+57 → CO) y en Instagram y Messenger no hay ubicación', (await chats()).find((x) => x.canal === 'whatsapp').pais === 'CO' && (await chats()).filter((x) => x.canal === 'instagram' || x.canal === 'messenger').every((x) => x.pais === null));
  check('Mensajes: se filtra por bandeja con nombre', (await chats(A, `?bandeja=${bw.id}`)).length === 3 && (await chats(A, `?bandeja=${bw.id}`)).every((x) => x.bandeja === 'Chat de la web') && (await chats(A, `?bandeja=${ba.id}`)).every((x) => x.bandeja === 'Ventas'));
  const w2 = await pw({ contacto: 'visitante-2', mensaje: '[prueba] hola web', responder: true });
  check('Mensajes: con responder:true el agente (el de «todas las bandejas») contesta en la misma llamada', w2.status === 200 && w2.data.respuesta === 'Respuesta de prueba: hola web' && w2.data.chat_id > 0, JSON.stringify(w2.data));
  const w3 = await pw({ contacto: 'visitante-2', mensaje: 'Respuesta de mi propio agente', rol: 'assistant' });
  const dw = (await A.app(`${X}/chats/${w2.data.chat_id}`)).data;
  check('Mensajes: también guarda lo que contestó el agente propio de la web (rol assistant)', w3.status === 200 && dw.mensajes.map((m) => m.rol).join() === 'user,assistant,assistant' && dw.chat.agente_id === gAll.data.id, JSON.stringify(dw.mensajes.map((m) => m.rol)));
  const feed = (await A.app(`${X}/mensajes?canal=webhook`)).data.rows;
  check('Mensajes: «Todos los mensajes» lista cada mensaje de todos los canales con su chat, y filtra y busca', feed.length >= 4 && feed.every((m) => m.canal === 'webhook' && m.chat_id > 0) && (await A.app(`${X}/mensajes`)).data.rows.some((m) => m.canal === 'whatsapp')
    && (await A.app(`${X}/mensajes?q=celular`)).data.rows.length === 1 && (await B.app(`${X}/mensajes`)).data.rows.length === 0);
  // Los chats de clientes del módulo IA se ven en Mensajes (bandeja web «Chat: <nombre>», sin agente de Mensajes, con dispositivo)
  const ci2 = await A.app('/api/ai/chats', { method: 'POST', body: { nombre: 'Chat de ventas', whatsapp: '573000000000' } });
  const slugIa = (await A.app('/api/ai/chats')).data.rows.find((x) => x.id === ci2.data.id).ruta.slice(6);
  await fetch(`${APP}/chat/${slugIa}/mensaje`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sid: crypto.randomUUID().replace(/-/g, ''), message: '[prueba] cuánto cuesta', page: 'https://ejemplo.co/tarjeta' }) });
  const chIa = await esperar(async () => (await chats(A, '?canal=webhook')).find((x) => x.bandeja === 'Chat: Chat de ventas'));
  const dIa = chIa && (await A.app(`${X}/chats/${chIa.id}`)).data;
  check('Mensajes: el chat de un cliente del módulo IA aparece en Mensajes con sus dos mensajes y su página', chIa && dIa.mensajes.length === 2 && dIa.mensajes[1].contenido === 'Respuesta de prueba: cuánto cuesta' && chIa.agente_id === 0 && chIa.dispositivo === 'escritorio' && chIa.pagina === 'https://ejemplo.co/tarjeta', JSON.stringify(chIa));
  check('Mensajes: lo del chat de IA de A no aparece en B', (await B.app(`${X}/chats`)).data.rows.length === 0);
  const prw = await A.app(`${X}/bandejas/${bw.id}/probar`, { method: 'POST', body: {} });
  check('Mensajes: el verificador del webhook explica que no hay URL de salida', prw.data.ok === true && /Sin URL de salida/.test(JSON.stringify(prw.data.pasos)), JSON.stringify(prw.data));
  const ew = await A.app(`${X}/chats/${w2.data.chat_id}/enviar`, { method: 'POST', body: { texto: 'Te escribe una persona' } });
  check('Mensajes: responder a mano en un chat web sin URL de salida avisa y deja el mensaje guardado', ew.status === 400 && /URL de salida/.test(ew.data.error || '') && (await A.app(`${X}/chats/${w2.data.chat_id}`)).data.mensajes.at(-1).rol === 'humano');
  check('Mensajes: el webhook responde a un GET de salud con su token', (await fetch(wurl)).status === 200);

  /* ---------- canal de correo ---------- */
  check('Mensajes: una bandeja de correo pide una dirección válida y no se repite en todo el sistema', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', canal: 'correo', phone_number_id: 'no-es-correo' } })).status === 400
    && (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', canal: 'correo' } })).status === 400);
  const cc = await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Soporte', canal: 'correo', phone_number_id: 'Soporte-A@Ejemplo.com', reenviar_a: 'equipo@ejemplo.com' } });
  const bc = (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === cc.data.id);
  check('Mensajes: crea la bandeja de correo (dirección en minúsculas y copia a otra dirección)', cc.status === 201 && bc.canal === 'correo' && bc.phone_number_id === 'soporte-a@ejemplo.com' && bc.reenviar_a === 'equipo@ejemplo.com', JSON.stringify(bc));
  check('Mensajes: la misma dirección no se puede conectar en otro negocio', (await B.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Otro', canal: 'correo', phone_number_id: 'soporte-a@ejemplo.com' } })).status === 409);
  const murl = bc.webhook_url.replace(/^.*\/wa\//, `${APP}/wa/`) + `?token=${bc.verify_token}`;
  const pm = (b) => fetch(murl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  const m1 = await pm({ de: 'Cliente@X.co', nombre: 'Cliente X', asunto: 'Cotización', mensaje: 'Hola, necesito precios.\n\nEl lunes, 26 de oct escribió:\n> mensaje anterior que no debe verse', id: '<m1@x.co>' });
  await pm({ de: 'cliente@x.co', asunto: 'Cotización', mensaje: 'Hola, necesito precios.', id: '<m1@x.co>' });
  const chM = (await chats(A, '?canal=correo')).find((x) => x.contacto === 'cliente@x.co');
  const dM = chM && (await A.app(`${X}/chats/${chM.id}`)).data;
  check('Mensajes: un correo crea el chat del remitente (nombre, asunto, IA apagada), sin la cita de lo anterior y sin duplicarse', m1.status === 200 && chM?.nombre === 'Cliente X' && chM.asunto === 'Cotización' && chM.ia_activa === 0 && chM.no_leidos === 1
    && dM.mensajes.length === 1 && dM.mensajes[0].contenido === 'Asunto: Cotización\n\nHola, necesito precios.', JSON.stringify(dM?.mensajes));
  await pm({ de: 'cliente@x.co', asunto: 'Re: Cotización', mensaje: 'Gracias, ¿y el plazo?', id: '<m2@x.co>' });
  check('Mensajes: una respuesta del mismo hilo no repite el asunto', (await A.app(`${X}/chats/${chM.id}`)).data.mensajes.at(-1).contenido === 'Gracias, ¿y el plazo?');
  check('Mensajes: un remitente inválido o la propia dirección de la bandeja no crean chats', (await pm({ de: 'nadie', mensaje: 'x' })).status === 400 && (await pm({ de: 'soporte-a@ejemplo.com', mensaje: 'x' })).status === 400 && (await chats(A, '?canal=correo')).length === 1);
  const kM = (await A.app('/api/marketing/contacts?q=cliente@x.co')).data.rows.find((x) => x.email === 'cliente@x.co');
  check('Mensajes: quien escribe por correo con nombre se guarda solo en Marketing y el chat queda enlazado', kM?.name === 'Cliente X' && /Correo: Soporte/.test(kM.source || '') && (await A.app(`${X}/chats/${chM.id}`)).data.chat.contact_id === kM.id, JSON.stringify(kM));
  await pm({ de: 'cliente@x.co', asunto: 'Cotización', mensaje: 'Escribí al alias', id: '<m9@x.co>', para: 'Hola@Ejemplo.com' });
  check('Mensajes: el chat de correo recuerda a qué dirección escribió la persona (el alias) para responderle desde ahí', (await A.app(`${X}/chats/${chM.id}`)).data.chat.via_correo === 'hola@ejemplo.com' && (await chats(A, '?canal=correo')).find((x) => x.id === chM.id).via_correo === 'hola@ejemplo.com');
  check('Mensajes: la bandeja de correo guarda desde qué dirección responde (la misma a la que escribieron, o siempre la cuenta)', (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === bc.id).responder_desde === 'auto' && (await A.app(`${X}/bandejas/${bc.id}`, { method: 'PATCH', body: { responder_desde: 'cuenta' } })).status === 200 && (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === bc.id).responder_desde === 'cuenta' && (await A.app(`${X}/bandejas/${bc.id}`, { method: 'PATCH', body: { responder_desde: 'auto' } })).status === 200);
  check('Mensajes: una bandeja de correo con una cuenta de Google que no está vinculada se rechaza', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Gmail', canal: 'correo', phone_number_id: 'otro@ejemplo.com', cuenta_google: 999 } })).status === 400);
  const er = await A.app(`${X}/chats/${chM.id}/enviar`, { method: 'POST', body: { texto: 'Te respondo por correo' } });
  check('Mensajes: responder un correo queda guardado en el chat (si el envío no está activo en Cloudflare, avisa)', [200, 502].includes(er.status) && (await A.app(`${X}/chats/${chM.id}`)).data.mensajes.at(-1).rol === 'humano', JSON.stringify([er.status, er.data]));
  const pc = await A.app(`${X}/bandejas/${bc.id}/probar`, { method: 'POST', body: {} });
  check('Mensajes: el verificador de correo pide vincular una cuenta de Google si la bandeja no tiene (sin hablar de Cloudflare)', pc.status === 200 && pc.data.ok === false && pc.data.pasos[0].nombre === 'Cuenta de Google' && !/Cloudflare/.test(JSON.stringify(pc.data)), JSON.stringify(pc.data));

  /* ---------- Google: las credenciales son de Diwilo; cada negocio vincula sus cuentas y fija su horario ---------- */
  const G0 = (await A.app(`${X}/google`)).data;
  check('Mensajes: Google aparece sin configurar para un negocio, con la URL de redirección central y sin permiso para subir credenciales', G0.credenciales === false && G0.conectado === false && G0.es_plataforma === false && G0.puede_conectar === false && /\/google\/callback$/.test(G0.redirect) && G0.agenda.duracion === 45, JSON.stringify(G0));
  check('Mensajes: un negocio no puede subir las credenciales de Google (son de Diwilo, 403) ni conectar mientras Diwilo no las configure', (await A.app(`${X}/google/credenciales`, { method: 'POST', body: { json: { web: { client_id: '123-abc.apps.googleusercontent.com', client_secret: 'GOCSPX-xxxxxxxxxxxx' } } } })).status === 403 && (await A.app(`${X}/google/conectar`, { method: 'POST', body: {} })).status === 400);
  check('Mensajes: sin cuentas vinculadas no hay direcciones, ni se prueba Google ni se asigna una cuenta que no existe', (await A.app(`${X}/google/direcciones`)).data.cuentas.length === 0 && (await A.app(`${X}/google/probar`, { method: 'POST', body: {} })).status === 400 && (await A.app(`${X}/google/usos`, { method: 'PUT', body: { cuenta_gmail: 999 } })).status === 400);
  const ag1 = await A.app(`${X}/google/agenda`, { method: 'PUT', body: { dias: [1, 2, 3], desde: '09:00', hasta: '16:00', duracion: 30, buffer: 10, adelanto_dias: 10, minimo_horas: 2, titulo: 'Cita – {nombre}', gmail_activo: false, copia: 'Hola@Ejemplo.com', envio: 'cloudflare' } });
  const G2 = (await A.app(`${X}/google`)).data;
  check('Mensajes: cada negocio guarda su horario de citas, la copia y cómo se envían los correos (sin necesitar credenciales)', ag1.status === 200 && G2.agenda.duracion === 30 && G2.agenda.desde === '09:00' && JSON.stringify(G2.agenda.dias) === '[1,2,3]' && G2.gmail_activo === false && G2.agenda.copia === 'hola@ejemplo.com' && G2.agenda.envio === 'cloudflare', JSON.stringify(G2.agenda));
  check('Mensajes: el horario sin días o con la hora de cierre antes de la de inicio se rechaza', (await A.app(`${X}/google/agenda`, { method: 'PUT', body: { dias: [] } })).status === 400 && (await A.app(`${X}/google/agenda`, { method: 'PUT', body: { dias: [1], desde: '17:00', hasta: '08:00' } })).status === 400);
  check('Mensajes: el personal no cambia el horario (403) y B no ve el de A', (await (await newMember(A.id, 'staff')).app(`${X}/google/agenda`, { method: 'PUT', body: { dias: [1] } })).status === 403 && (await B.app(`${X}/google`)).data.agenda.duracion === 45);
  check('Mensajes: desconectar Google sin cuentas no falla', (await A.app(`${X}/google/desconectar`, { method: 'POST', body: {} })).status === 200 && (await A.app(`${X}/google`)).data.conectado === false);
  check('Mensajes: un agente guarda si puede agendar citas', (await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { agendar: true } })).status === 200 && (await ags()).find((a) => a.id === g1.data.id).agendar === 1 && (await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { agendar: false } })).status === 200);

  /* ---------- el agente sabe dónde conversa (canal, cuenta, de dónde escribe, otros canales, hora) ---------- */
  const verSistema = async (chatId) => (await A.app(`${X}/chats/${chatId}/sugerir`, { method: 'POST', body: {} })).data.sugerencia || '';
  await hook(url, wa('1090000000001', 'wamid.V1', '[prueba] [[VER_SISTEMA]]'));
  const sWa = await esperar(async () => { const t = await verSistema(chA.id); return /DÓNDE ESTÁS CONVERSANDO/.test(t) ? t : null; });
  check('Mensajes: el agente de WhatsApp sabe que está en WhatsApp, con qué número, que ya tiene su teléfono y cuáles son los otros canales', /WhatsApp, con el número \+573001112233/.test(sWa || '') && /Ya tienes su número \(\+573001112233\)/.test(sWa) && /Otros canales del negocio/.test(sWa) && /Instagram \(cuenta/.test(sWa) && /Messenger \(página/.test(sWa) && /correo soporte-a@ejemplo\.com/.test(sWa) && /hora de Colombia/.test(sWa), (sWa || '').slice(0, 900));
  await hook(url, social('instagram', '7770001', 'ig_v', 'igsid42', '[prueba] [[VER_SISTEMA]]'));
  const igId = (await chats()).find((x) => x.contacto === 'igsid42').id;
  const sIg = await esperar(async () => { const t = await verSistema(igId); return /DÓNDE ESTÁS CONVERSANDO/.test(t) ? t : null; });
  check('Mensajes: el agente de Instagram sabe que son mensajes directos, que no tiene su teléfono y que no ve archivos', /mensajes directos de Instagram/.test(sIg || '') && /No conoces su teléfono ni su correo/.test(sIg) && /fotos y audios/.test(sIg), (sIg || '').slice(0, 700));
  await pw({ contacto: 'visitante-1', mensaje: '[prueba] [[VER_SISTEMA]]' });
  const sWeb = await verSistema((await chats(A, '?canal=webhook')).find((x) => x.contacto === 'visitante-1').id);
  check('Mensajes: el agente del chat web sabe que es la página web, desde dónde escribe (país, dispositivo, página) y el botón de WhatsApp', /el chat de la página web/.test(sWeb) && /país CO, desde un computador, página https:\/\/ejemplo\.co\/precios/.test(sWeb) && /Seguir por WhatsApp/.test(sWeb), sWeb.slice(0, 700));
  await pm({ de: 'cliente@x.co', asunto: 'Cotización', mensaje: '[prueba] [[VER_SISTEMA]]', id: '<m3@x.co>' });
  const sMail = await verSistema(chM.id);
  check('Mensajes: el agente de correo sabe que responde un correo, con su asunto y que firma como el equipo', /correo electrónico, en el buzón soporte-a@ejemplo\.com, con el asunto «Cotización»/.test(sMail) && /firmando como el equipo/.test(sMail), sMail.slice(0, 700));

  /* ---------- responder a mano y plantillas ---------- */
  const env = await A.app(`${X}/chats/${chA.id}/enviar`, { method: 'POST', body: { texto: 'Hola, te escribo yo' } });
  const d3 = await det();
  check('Mensajes: enviar sin clave API avisa con claridad, deja el mensaje y apaga la IA del chat', env.status === 400 && d3.mensajes.at(-1).rol === 'humano' && d3.mensajes.at(-1).estado === 'sin_clave' && d3.chat.ia_activa === 0, JSON.stringify([env.status, d3.chat.ia_activa]));
  check('Mensajes: las plantillas se piden por bandeja y sin clave API avisan', (await A.app(`${X}/plantillas?bandeja=${ba.id}`)).status === 400 && (await A.app(`${X}/plantillas?bandeja=${cm.data.id}`)).status === 400);
  check('Mensajes: enviar plantilla sin destinatarios o a una bandeja que no es de WhatsApp se rechaza', (await A.app(`${X}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: ba.id, plantilla: 'x', idioma: 'es', contactos: [] } })).status === 400 && (await A.app(`${X}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: cm.data.id, plantilla: 'x', idioma: 'es', contactos: [cto.id] } })).status === 400);
  check('Mensajes: B no envía con la bandeja de A', (await B.app(`${X}/plantillas/enviar`, { method: 'POST', body: { bandeja_id: ba.id, plantilla: 'x', idioma: 'es', contactos: [1] } })).status === 404);

  /* ---------- mis plantillas (para cualquier canal), correo a contactos y cuenta de plantillas ---------- */
  const rp1 = await A.app(`${X}/respuestas`, { method: 'POST', body: { nombre: 'Seguimiento', canales: JSON.stringify(['correo', 'instagram', 'inventado']), asunto: 'Seguimiento a tu solicitud', cuerpo: 'Hola{nombre}, ¿cómo vas con {empresa}?' } });
  const rp2 = await A.app(`${X}/respuestas`, { method: 'POST', body: { nombre: 'Gracias', cuerpo: 'Gracias por escribirnos' } });
  const rs = (await A.app(`${X}/respuestas`)).data.rows;
  check('Mensajes: crea plantillas propias para varios canales (los canales que no existen se descartan; vacío = todos)', rp1.status === 201 && rp2.status === 201 && JSON.stringify(rs.find((x) => x.id === rp1.data.id).canales) === '["correo","instagram"]' && rs.find((x) => x.id === rp2.data.id).canales.length === 0, JSON.stringify(rs));
  check('Mensajes: se edita una plantilla propia y una sin mensaje se rechaza', (await A.app(`${X}/respuestas/${rp2.data.id}`, { method: 'PATCH', body: { canales: JSON.stringify(['whatsapp']) } })).status === 200 && (await A.app(`${X}/respuestas`)).data.rows.find((x) => x.id === rp2.data.id).canales[0] === 'whatsapp' && (await A.app(`${X}/respuestas`, { method: 'POST', body: { nombre: 'x' } })).status === 400);
  check('Mensajes: B no ve las plantillas de A y el personal las crea pero no las borra', (await B.app(`${X}/respuestas`)).data.rows.length === 0 && (await B.app(`${X}/respuestas/${rp1.data.id}`, { method: 'PATCH', body: { nombre: 'x' } })).status === 404
    && (await (await newMember(A.id, 'staff')).app(`${X}/respuestas`, { method: 'POST', body: { nombre: 'Del personal', cuerpo: 'Hola' } })).status === 201 && (await (await newMember(A.id, 'staff')).app(`${X}/respuestas/${rp1.data.id}`, { method: 'DELETE' })).status === 403);
  const lc2 = (await A.app(`${X}/contactos?con=email`)).data;
  check('Mensajes: la lista de contactos puede pedirse por correo (no solo por teléfono)', lc2.marketing && lc2.rows.length > 0 && lc2.rows.every((c) => c.email) && lc2.rows.some((c) => c.company !== undefined));
  const luis = lc2.rows[0];
  check('Mensajes: el correo a contactos pide bandeja de correo, asunto, mensaje y contactos', (await A.app(`${X}/correo/enviar`, { method: 'POST', body: { bandeja_id: ba.id, asunto: 'x', mensaje: 'x', contactos: [luis.id] } })).status === 400
    && (await A.app(`${X}/correo/enviar`, { method: 'POST', body: { bandeja_id: bc.id, asunto: '', mensaje: 'x', contactos: [luis.id] } })).status === 400 && (await A.app(`${X}/correo/enviar`, { method: 'POST', body: { bandeja_id: bc.id, asunto: 'x', mensaje: 'x', contactos: [] } })).status === 400);
  const ce = await A.app(`${X}/correo/enviar`, { method: 'POST', body: { bandeja_id: bc.id, asunto: 'Hola{nombre}', mensaje: 'Te escribo desde {empresa}', contactos: [luis.id, 999999] } });
  check('Mensajes: el correo a contactos responde cuántos salieron y cuáles fallaron (un contacto que no existe falla; sin Gmail ni Cloudflare configurados el envío avisa)', ce.status === 200 && ce.data.enviados + ce.data.fallidos.length === 2 && ce.data.fallidos.some((x) => /correo válido/.test(x.error)), JSON.stringify(ce.data));
  check('Mensajes: la bandeja de WhatsApp guarda la cuenta de mensajería de las plantillas y rechaza ids que no son números', (await A.app(`${X}/bandejas/${ba.id}`, { method: 'PATCH', body: { cuenta_plantillas: '14680392186' } })).status === 200 && (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === ba.id).cuenta_plantillas === '14680392186' && (await A.app(`${X}/bandejas/${ba.id}`, { method: 'PATCH', body: { cuenta_plantillas: 'abc' } })).status === 400);

  /* ---------- modo administrador por WhatsApp y cancelar citas ---------- */
  check('Mensajes: sin cita en el chat, cancelar la cita avisa', (await A.app(`${X}/chats/${chA.id}/cita/cancelar`, { method: 'POST', body: {} })).status === 400 && (await B.app(`${X}/chats/${chA.id}/cita/cancelar`, { method: 'POST', body: {} })).status === 404);
  const ad1 = await A.app(`${X}/admins`, { method: 'POST', body: { nombre: 'Yo', numero: '+57 300 111 0001' } });
  const ad2 = await A.app(`${X}/admins`, { method: 'POST', body: { nombre: 'Con PIN', numero: '573001110002', pin: 'abc123' } });
  const lad = (await A.app(`${X}/admins`)).data.rows;
  check('Mensajes: se autorizan números administradores (con o sin PIN) y el PIN nunca se devuelve', ad1.status === 201 && ad2.status === 201 && lad.find((x) => x.id === ad1.data.id).numero === '573001110001' && lad.find((x) => x.id === ad1.data.id).tiene_pin === false && lad.find((x) => x.id === ad2.data.id).tiene_pin === true && !JSON.stringify(lad).includes('abc123') && !JSON.stringify(lad).includes('pin_hash'), JSON.stringify(lad));
  check('Mensajes: un número o PIN inválidos y un administrador repetido se rechazan; B no ve los de A y el personal tampoco', (await A.app(`${X}/admins`, { method: 'POST', body: { numero: '123' } })).status === 400 && (await A.app(`${X}/admins`, { method: 'POST', body: { numero: '573001110009', pin: '12' } })).status === 400
    && (await A.app(`${X}/admins`, { method: 'POST', body: { numero: '573001110001' } })).status === 409 && (await B.app(`${X}/admins`)).data.rows.length === 0 && (await (await newMember(A.id, 'staff')).app(`${X}/admins`)).status === 403);
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: true } });
  const verAdmin = async (num) => { const ch = (await chats()).find((x) => x.contacto === num); return ch ? (await A.app(`${X}/chats/${ch.id}`)).data : null; };
  // sin PIN: el número basta; el asistente responde y propone (no hace) lo que cambia datos hasta que diga «sí»
  const guion = `[prueba] [[GUION]]{"accion":"usar","herramienta":"whatsapp.cambiar_ia_del_chat","args":{"chat_id":${chA.id},"ia_activa":false}}\n---\n{"accion":"fin","respuesta":"Voy a apagar la IA de ese chat."}[[/GUION]]`;
  await hook(url, wa('1090000000001', 'wamid.AD1', guion, '573001110001'));
  const dA1 = await esperar(async () => { const d = await verAdmin('573001110001'); return d?.mensajes.some((m) => m.rol === 'assistant') ? d : null; });
  check('Mensajes: el número administrador no es un cliente (chat marcado Admin, sin agente ni Marketing) y el asistente le propone la acción pidiendo confirmación', dA1?.chat.admin === 1 && dA1.chat.ia_activa === 0 && dA1.chat.agente_id === 0 && /Voy a apagar la IA de ese chat\./.test(dA1.mensajes.at(-1).contenido) && /Responde \*SÍ\* o \*NO\*/.test(dA1.mensajes.at(-1).contenido) && (await det()).chat.ia_activa === 1, JSON.stringify([dA1?.chat.admin, dA1?.chat.ia_activa, dA1?.chat.agente_id, (await det()).chat.ia_activa]));
  await hook(url, wa('1090000000001', 'wamid.AD2', 'sí', '573001110001'));
  const dA2 = await esperar(async () => { const d = await verAdmin('573001110001'); return d?.mensajes.at(-1).contenido.startsWith('✅ Hecho') ? d : null; });
  check('Mensajes: al responder «sí» se ejecuta lo propuesto (aquí apagó la IA de ese chat)', !!dA2 && (await det()).chat.ia_activa === 0, JSON.stringify(dA2?.mensajes.at(-1)));
  await A.app(`${X}/chats/${chA.id}`, { method: 'PATCH', body: { ia_activa: true } });
  await hook(url, wa('1090000000001', 'wamid.AD3', 'ayuda', '573001110001'));
  const dA3 = await esperar(async () => { const d = await verAdmin('573001110001'); return /Modo administrador/.test(d?.mensajes.at(-1).contenido || '') ? d : null; });
  check('Mensajes: «ayuda» lista lo que puede hacer el administrador', !!dA3);
  // con PIN: hasta que no lo escriba no pasa nada; el PIN malo no abre
  await hook(url, wa('1090000000001', 'wamid.AD4', 'resumen', '573001110002'));
  await hook(url, wa('1090000000001', 'wamid.AD5', 'pin-equivocado', '573001110002'));
  const dP1 = await esperar(async () => { const d = await verAdmin('573001110002'); return d?.mensajes.filter((m) => m.rol === 'assistant').length >= 2 ? d : null; });
  check('Mensajes: con PIN, el administrador no entra sin él (ni con uno equivocado) y no se le revela nada', dP1?.mensajes.filter((m) => m.rol === 'assistant').every((m) => /Escribe tu PIN/.test(m.contenido)), JSON.stringify(dP1?.mensajes));
  await hook(url, wa('1090000000001', 'wamid.AD6', 'abc123', '573001110002'));
  const dP2 = await esperar(async () => { const d = await verAdmin('573001110002'); return /Modo administrador activado/.test(d?.mensajes.at(-1).contenido || '') ? d : null; });
  check('Mensajes: con el PIN correcto se abre la sesión de administrador', !!dP2);
  check('Mensajes: un número que no es administrador sigue siendo un cliente (el chat no es Admin)', (await chats()).find((x) => x.contacto === '573001112233').admin === 0);

  /* ---------- varios mensajes seguidos y archivos ---------- */
  const nAs = async () => (await det()).mensajes.filter((m) => m.rol === 'assistant').length;
  const previas0 = await nAs();
  await espera(2);
  for (const [i, t] of ['[prueba] uno', '[prueba] dos', '[prueba] tres'].entries()) await hook(url, wa('1090000000001', `wamid.B${i}`, t));
  await new Promise((x) => setTimeout(x, 6000));
  check('Mensajes: tres mensajes seguidos se responden una sola vez', (await nAs()) - previas0 === 1, `respuestas nuevas: ${(await nAs()) - previas0}`);
  await espera(0);
  const media = (tipo, id, extra = {}) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '1090000000001' }, contacts: [{ wa_id: '573001112233', profile: { name: 'Ana' } }], messages: [{ from: '573001112233', id: `wamid.${id}`, timestamp: String(Math.floor(Date.now() / 1000)), type: tipo, [tipo]: { id: `media-${id}`, mime_type: tipo === 'audio' ? 'audio/ogg' : 'image/jpeg', ...extra } }] } }] }] });
  await hook(url, media('image', 'F1', { caption: '[prueba] mira esto' }));
  const conFoto = await esperar(async () => (await det()).mensajes.find((m) => m.tipo === 'imagen'));
  check('Mensajes: una foto entrante queda en el chat como imagen con su pie de foto', conFoto && conFoto.contenido === '[prueba] mira esto', JSON.stringify(conFoto));
  await hook(url, media('audio', 'F2'));
  const conAudio = await esperar(async () => (await det()).mensajes.find((m) => m.tipo === 'audio'));
  check('Mensajes: un audio entrante se ve como audio con su etiqueta', conAudio && /Audio/.test(conAudio.contenido), JSON.stringify(conAudio));
  const ent = await A.app(`${X}/mensajes/${conFoto.id}/entender`, { method: 'POST' });
  check('Mensajes: «Entender con IA» describe la foto y lo deja en el mensaje', ent.status === 200 && ent.data.texto === 'Descripción de prueba' && (await det()).mensajes.find((m) => m.id === conFoto.id).media_texto === 'Descripción de prueba', JSON.stringify(ent.data));
  const txtId = (await det()).mensajes.find((m) => !m.tipo)?.id;
  check('Mensajes: un mensaje de texto no se analiza ni se guarda como archivo, y B no ve archivos de A', (await A.app(`${X}/mensajes/${txtId}/entender`, { method: 'POST' })).status === 404 && (await A.app(`${X}/archivos`, { method: 'POST', body: { mensaje_id: txtId } })).status === 404 && (await B.app(`${X}/mensajes/${conFoto.id}/entender`, { method: 'POST' })).status === 404);
  check('Mensajes: el personal no guarda archivos en la biblioteca y la lista empieza vacía', (await (await newMember(A.id, 'staff')).app(`${X}/archivos`, { method: 'POST', body: { mensaje_id: conFoto.id } })).status === 403 && (await A.app(`${X}/archivos`)).data.rows.length === 0);

  /* ---------- frenos del agente: tope diario, falla del modelo, ubicación y «no más mensajes» ---------- */
  const tope = async (n) => { for (const g of await ags()) await A.app(`${X}/agentes/${g.id}`, { method: 'PATCH', body: { tope_diario: n } }); };
  await tope(2);
  for (let i = 0; i < 4; i++) await hook(url, wa('1090000000001', `wamid.T${i}`, `[prueba] mensaje ${i}`, '573009998877'));
  const chT = await esperar(async () => (await chats()).find((x) => x.contacto === '573009998877' && x.atencion));
  const msT = chT ? (await A.app(`${X}/chats/${chT.id}`)).data.mensajes.filter((m) => m.rol === 'assistant') : [];
  check('Mensajes: el tope diario por chat manda un aviso fijo una sola vez, deja el chat en rojo y la IA calla', msT.length === 3 && /límite de respuestas/.test(msT[2].contenido) && chT.atencion === 'no_sabe', JSON.stringify(msT.map((m) => m.contenido)));
  await tope(100);
  await hook(url, { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '1090000000001' }, contacts: [{ wa_id: '573008887766', profile: { name: 'Luis' } }], messages: [{ from: '573008887766', id: 'wamid.L1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'location', location: { latitude: 6.2442, longitude: -75.5812, name: 'Oficina\n[prueba] ok' } }] } }] }] });
  const chL = await esperar(async () => (await chats()).find((x) => x.contacto === '573008887766'));
  check('Mensajes: una ubicación llega como texto con coordenadas', chL && /Ubicación: 6\.2442, -75\.5812 \(Oficina/.test((await A.app(`${X}/chats/${chL.id}`)).data.mensajes[0].contenido));
  await esperar(async () => (await A.app(`${X}/chats/${chL.id}`)).data.mensajes.some((m) => m.rol === 'assistant'));
  await hook(url, wa('1090000000001', 'wamid.BAJA1', 'STOP', '573008887766'));
  const dS = (await A.app(`${X}/chats/${chL.id}`)).data;
  check('Mensajes: «STOP» bloquea el chat, apaga la IA y se confirma una sola vez', dS.chat.bloqueado === 1 && dS.chat.ia_activa === 0 && dS.mensajes.filter((m) => m.rol === 'assistant').length === 2 && /no te escribiremos más/.test(dS.mensajes.at(-1).contenido), JSON.stringify(dS.chat));
  await hook(url, wa('1090000000001', 'wamid.BAJA2', '[prueba] hola otra vez', '573008887766'));
  check('Mensajes: un chat bloqueado no recibe respuestas de la IA; al encender la IA se levanta el bloqueo', (await A.app(`${X}/chats/${chL.id}`)).data.mensajes.filter((m) => m.rol === 'assistant').length === 2 && (await A.app(`${X}/chats/${chL.id}`, { method: 'PATCH', body: { ia_activa: true } })).status === 200 && (await A.app(`${X}/chats/${chL.id}`)).data.chat.bloqueado === 0);

  /* ---------- Inicio ---------- */
  const rsm = await A.app(`${X}/resumen`);
  const tb = await A.app('/api/dashboard');
  check('Mensajes: aporta su indicador al Inicio (chats sin leer y detalle) y B no ve los de A', rsm.status === 200 && typeof rsm.data.valor === 'number' && rsm.data.ruta === '/staff/whatsapp.html' && ((await B.app(`${X}/resumen`)).status === 403 || (await B.app(`${X}/resumen`)).data?.valor === 0), JSON.stringify(rsm.data));
  check('Mensajes: el Inicio muestra el indicador y avisa de los chats en rojo', tb.status === 200 && tb.data.widgets.some((w) => w.modulo === 'whatsapp') && tb.data.alertas.some((a) => /Mensajes/.test(a.texto)), JSON.stringify([tb.data.widgets?.map((w) => w.modulo), tb.data.alertas]));

  /* ---------- permisos y módulo inactivo ---------- */
  const staff = await newMember(A.id, 'staff');
  check('Mensajes: el personal no crea bandejas ni activa agentes (403)', (await staff.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x' } })).status === 403 && (await staff.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { activo: true } })).status === 403);
  check('Mensajes: el personal no ve el token de verificación ni borra chats', (await staff.app(`${X}/bandejas`)).data.rows?.[0]?.verify_token == null && (await staff.app(`${X}/chats/${chA.id}`, { method: 'DELETE' })).status === 403);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'whatsapp', activo: false }] });
  check('Mensajes: módulo inactivo responde 403', (await A.app(`${X}/bandejas`)).status === 403 && (await A.app(`${X}/chats`)).status === 403);
  check('Mensajes: inactivo, el webhook deja de atender', (await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1`)).status === 404);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('Mensajes: al reactivarlo los datos siguen ahí', (await A.app(`${X}/bandejas`)).data.rows.length === 6 && (await chats()).length === 23);
  check('Mensajes: borrar un chat borra sus mensajes', (await A.app(`${X}/chats/${chA.id}`, { method: 'DELETE' })).status === 200 && (await chats()).length === 22 && (await A.app(`${X}/chats/${chA.id}`)).status === 404);
  check('Mensajes: borrar un agente deja sin asignar los chats que lo usaban', (await A.app(`${X}/agentes/${gAll.data.id}`, { method: 'DELETE' })).status === 200 && (await A.app(`${X}/chats/${w2.data.chat_id}`)).data.chat.agente_id === null);
  check('Mensajes: borrar la bandeja borra sus chats', (await A.app(`${X}/bandejas/${ba.id}`, { method: 'DELETE' })).status === 200 && (await chats()).every((x) => x.bandeja_id !== ba.id));
}

// Pruebas del módulo WhatsApp: bandejas, agentes de IA, webhook de Meta y conversaciones. Incluye aislamiento entre negocios y módulo inactivo = 403.
// Sin gastar IA ni llamar a Meta: los mensajes que empiezan por «[prueba]» responden sin modelo y las bandejas de prueba no tienen clave API.
export default async function ({ check, diwilo, newBusiness, newMember, APP }) {
  const A = await newBusiness('WA A', { login: true });
  const B = await newBusiness('WA B', { login: true });
  const X = '/api/whatsapp';
  const hook = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const evento = (pid, wamid, texto) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pid }, contacts: [{ wa_id: '573001112233', profile: { name: 'Ana' } }], messages: [{ from: '573001112233', id: wamid, timestamp: '1790000000', type: 'text', text: { body: texto } }] } }] }] });

  /* ---------- bandejas ---------- */
  const c1 = await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Ventas', telefono: '+57 300 111 2233', phone_number_id: '1090000000001', waba_id: '2090000000001' } });
  check('WhatsApp: crea una bandeja', c1.status === 201);
  const ba = (await A.app(`${X}/bandejas`)).data.rows.find((x) => x.id === c1.data.id);
  check('WhatsApp: trae su webhook /wa/<slug> y su token, sin exponer la clave', /\/wa\/[a-f0-9]{24}$/.test(ba?.webhook_url || '') && ba.verify_token?.length === 32 && ba.tiene_clave === false && !('clave_cifrada' in ba) && ba.telefono === '+573001112233', JSON.stringify(ba));
  check('WhatsApp: teléfono sin indicativo e ids no numéricos se rechazan', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', telefono: '3001112233', phone_number_id: '12345', waba_id: '12345' } })).status === 400 && (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x', telefono: '+573001112233', phone_number_id: 'abc', waba_id: '12345' } })).status === 400);
  check('WhatsApp: no repite el id de número en el mismo negocio', (await A.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'Otra', telefono: '+573001112233', phone_number_id: '1090000000001', waba_id: '2090000000001' } })).status === 409);
  check('WhatsApp: B no ve ni toca las bandejas de A', (await B.app(`${X}/bandejas`)).data.rows.length === 0 && (await B.app(`${X}/bandejas/${ba.id}`, { method: 'PATCH', body: { nombre: 'x' } })).status === 404 && (await B.app(`${X}/bandejas/${ba.id}/token`, { method: 'POST' })).status === 404);
  const pr = await A.app(`${X}/bandejas/${ba.id}/probar`, { method: 'POST', body: {} });
  check('WhatsApp: el verificador avisa que falta la clave API (sin llamar a Meta)', pr.status === 200 && pr.data.ok === false && pr.data.pasos[0].nombre === 'Clave API', JSON.stringify(pr.data));
  check('WhatsApp: B no prueba la bandeja de A', (await B.app(`${X}/bandejas/${ba.id}/probar`, { method: 'POST', body: {} })).status === 404);
  const tk = await A.app(`${X}/bandejas/${ba.id}/token`, { method: 'POST' });
  check('WhatsApp: genera otro token de verificación', tk.status === 200 && tk.data.verify_token.length === 32 && tk.data.verify_token !== ba.verify_token);
  const token = tk.data.verify_token;

  /* ---------- webhook ---------- */
  const url = ba.webhook_url.replace(/^.*\/wa\//, `${APP}/wa/`);
  const v1 = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`);
  check('WhatsApp: la verificación de Meta devuelve el challenge', v1.status === 200 && (await v1.text()) === '12345');
  check('WhatsApp: con un token malo la verificación da 403', (await fetch(`${url}?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=1`)).status === 403);
  check('WhatsApp: un slug que no existe da 404', (await fetch(`${APP}/wa/${'0'.repeat(24)}?hub.mode=subscribe`)).status === 404);
  check('WhatsApp: el mensaje entrante se guarda y no se duplica', (await hook(url, evento('1090000000001', 'wamid.A1', 'Hola, ¿precios?'))).status === 200 && (await hook(url, evento('1090000000001', 'wamid.A1', 'Hola, ¿precios?'))).status === 200
    && (await A.app(`${X}/conversaciones/${ba.id}/573001112233`)).data.mensajes.length === 1);
  check('WhatsApp: ignora eventos de otro número de teléfono', (await hook(url, evento('999999', 'wamid.A2', 'otro'))).status === 200 && (await A.app(`${X}/conversaciones/${ba.id}/573001112233`)).data.mensajes.length === 1);

  /* ---------- agentes ---------- */
  const g1 = await A.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: ba.id, nombre: 'Asesor', instrucciones: 'Atiende ventas.' } });
  check('WhatsApp: crea un agente de IA para la bandeja', g1.status === 201);
  const g2 = await A.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: ba.id, nombre: 'Soporte' } });
  const ags = () => A.app(`${X}/agentes`).then((r) => r.data.rows);
  check('WhatsApp: solo un agente activo por bandeja', (await ags()).filter((a) => a.activo).map((a) => a.id).join() === String(g2.data.id));
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { activo: true } });
  check('WhatsApp: al activar uno se apaga el otro', (await ags()).filter((a) => a.activo).map((a) => a.id).join() === String(g1.data.id));
  check('WhatsApp: un agente no se crea en una bandeja ajena', (await B.app(`${X}/agentes`, { method: 'POST', body: { bandeja_id: ba.id, nombre: 'Intruso' } })).status === 400 || (await B.app(`${X}/agentes`)).data.rows.length === 0);
  await hook(url, evento('1090000000001', 'wamid.A3', '[prueba] hola'));
  let ms = []; for (let i = 0; i < 20 && ms.length < 4; i++) { ms = (await A.app(`${X}/conversaciones/${ba.id}/573001112233`)).data.mensajes; if (ms.length < 4) await new Promise((r) => setTimeout(r, 150)); }
  const resp = ms.find((m) => m.rol === 'assistant');
  check('WhatsApp: el agente activo contesta (modo de prueba; sin clave API queda «sin_clave»)', resp?.contenido === 'Respuesta de prueba: hola' && resp.estado === 'sin_clave', JSON.stringify(ms));
  await A.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { activo: false } });
  await hook(url, evento('1090000000001', 'wamid.A4', '[prueba] sigues?'));
  await new Promise((r) => setTimeout(r, 600));
  check('WhatsApp: con el agente apagado no contesta', (await A.app(`${X}/conversaciones/${ba.id}/573001112233`)).data.mensajes.filter((m) => m.rol === 'assistant').length === 1);

  /* ---------- conversaciones ---------- */
  const cv = (await A.app(`${X}/conversaciones`)).data.rows;
  check('WhatsApp: lista el contacto con su último mensaje', cv.length === 1 && cv[0].nombre === 'Ana' && cv[0].bandeja === 'Ventas' && cv[0].mensajes === 4, JSON.stringify(cv));
  check('WhatsApp: B no ve las conversaciones de A', (await B.app(`${X}/conversaciones`)).data.rows.length === 0 && (await B.app(`${X}/conversaciones/${ba.id}/573001112233`)).status === 404);
  check('WhatsApp: enviar sin clave API avisa con claridad', (await A.app(`${X}/bandejas/${ba.id}/enviar`, { method: 'POST', body: { para: '573001112233', texto: 'Hola' } })).status === 400);

  /* ---------- permisos y módulo inactivo ---------- */
  const staff = await newMember(A.id, 'staff');
  check('WhatsApp: el personal no crea bandejas ni activa agentes (403)', (await staff.app(`${X}/bandejas`, { method: 'POST', body: { nombre: 'x' } })).status === 403 && (await staff.app(`${X}/agentes/${g1.data.id}`, { method: 'PATCH', body: { activo: true } })).status === 403);
  check('WhatsApp: el personal no ve el token de verificación', (await staff.app(`${X}/bandejas`)).data.rows?.[0]?.verify_token == null);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'whatsapp', activo: false }] });
  check('WhatsApp: módulo inactivo responde 403', (await A.app(`${X}/bandejas`)).status === 403);
  check('WhatsApp: inactivo, el webhook deja de atender', (await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1`)).status === 404);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('WhatsApp: al reactivarlo los datos siguen ahí', (await A.app(`${X}/bandejas`)).data.rows.length === 1);
  check('WhatsApp: borrar la bandeja borra sus agentes y mensajes', (await A.app(`${X}/bandejas/${ba.id}`, { method: 'DELETE' })).status === 200 && (await A.app(`${X}/agentes`)).data.rows.length === 0 && (await A.app(`${X}/conversaciones`)).data.rows.length === 0);
}

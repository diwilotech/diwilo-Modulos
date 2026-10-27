// Mensajes (módulo «whatsapp»): bandejas de WhatsApp, Instagram y Messenger, chats con interruptor de IA, agentes de IA por bandeja,
// contactos en Marketing y plantillas de WhatsApp. Ver: todo el equipo; configurar: propietario y administrador.
//   CRUD  /api/whatsapp/bandejas                 bandejas (canal, nombre, teléfono +57…, id del número / página / cuenta de Instagram, id de la cuenta, clave API)
//   POST  /api/whatsapp/bandejas/:id/credenciales { api_key?, app_secret? }   guarda la clave API / el secreto (cifrados; nunca se devuelven)
//   POST  /api/whatsapp/bandejas/:id/token       genera otro token de verificación del webhook
//   POST  /api/whatsapp/bandejas/:id/probar      { para? } verifica clave e IDs contra Meta; en WhatsApp, con `para`, manda un mensaje de prueba
//   CRUD  /api/whatsapp/agentes                  agentes de IA por bandeja (activar/desactivar con PATCH { activo })
//   GET   /api/whatsapp/chats?bandeja=&canal=&q=  lista de chats (izquierda) · GET /chats/:id chat completo (mensajes y contacto)
//   PATCH /api/whatsapp/chats/:id { ia_activa }  enciende o apaga la IA en ese chat · POST /:id/leer · POST /:id/enviar { texto } (apaga la IA de ese chat)
//   POST  /api/whatsapp/chats/:id/contacto       guarda / enlaza el contacto en Marketing · DELETE /chats/:id
//   GET   /api/whatsapp/contactos?q=             contactos de Marketing (para enviar plantillas)
//   GET   /api/whatsapp/plantillas?bandeja=      plantillas aprobadas de WhatsApp · POST /plantillas/enviar { bandeja_id, plantilla, idioma, variables, contactos[], chats[] }
// Público (en el dominio de cada app): GET|POST /wa/<slug> = el webhook (webhook.js).
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { cifrarClave } from '../../lib/ia.js';
import { enviarTexto, enviarPlantilla, plantillasDe, probarBandeja, soloDigitos, CANALES } from './canales.js';
import { guardarMensaje, tocarChat } from './webhook.js';
import { marketingActivo, contactoPorId, guardarContacto } from './contactos.js';

const MOD = 'whatsapp', B = '/api/whatsapp', MAX_BANDEJAS = 10, MAX_AGENTES = 5, MAX_ENVIO = 50;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const COL = (s) => { const d = soloDigitos(s); return d.length === 10 ? `57${d}` : d; };   // número colombiano de 10 dígitos → con indicativo

/* ---------- entidades ---------- */
function revisarBandeja(row, canal) {
  if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre de la bandeja es muy largo (máximo 80 letras)');
  if (row.phone_number_id != null && !/^\d{5,30}$/.test(row.phone_number_id)) throw new HttpError(400, canal === 'whatsapp' ? 'El id del número de teléfono son solo dígitos (lo da Meta)' : 'El id de la página o de la cuenta de Instagram son solo dígitos (lo da Meta)');
  if (canal === 'whatsapp') {
    if (row.telefono != null && !/^\+\d{8,15}$/.test(String(row.telefono).replace(/[\s-]/g, ''))) throw new HttpError(400, 'El teléfono debe llevar el indicativo, por ejemplo +57 300 123 4567');
    if (row.waba_id != null && !/^\d{5,30}$/.test(row.waba_id)) throw new HttpError(400, 'El id de la cuenta de negocio son solo dígitos (lo da Meta)');
    if (row.telefono) row.telefono = String(row.telefono).replace(/[\s-]/g, '');
  }
}
const claveValida = (k, label) => {
  const v = String(k || '').trim();
  if (v.length < 10 || v.length > 600 || /\s/.test(v)) throw new HttpError(400, `${label} no parece válida`);
  return v;
};
const exigirKek = (env) => { if (!env.CLAVES_KEK) throw new HttpError(500, 'Falta configurar CLAVES_KEK en Diwilo Modulos para guardar claves de forma segura'); };
const textoLargo = (row) => {
  if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre del agente es muy largo (máximo 80 letras)');
  if (row.instrucciones && row.instrucciones.length > 4000) throw new HttpError(400, 'Las instrucciones son muy largas (máximo 4000 letras)');
};

export const ENTITIES = {
  bandejas: {
    table: 'wa_bandejas', label: 'la bandeja', title: 'nombre', search: ['nombre', 'telefono'], order: 'created_at',
    fields: { nombre: 'text!', canal: Object.keys(CANALES), telefono: 'text', phone_number_id: 'text!', waba_id: 'text', activo: 'bool+' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row, body) {
      row.canal ||= 'whatsapp';
      if (row.canal === 'whatsapp' && (!row.telefono || !row.waba_id)) throw new HttpError(400, 'WhatsApp necesita el teléfono y el id de la cuenta de WhatsApp Business');
      revisarBandeja(row, row.canal);
      row.telefono ||= ''; row.waba_id ||= '';
      if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_bandejas WHERE business_id = ?', c.businessId)).n >= MAX_BANDEJAS) throw new HttpError(400, `Ya tienes ${MAX_BANDEJAS} bandejas`);
      if (await one(c.env, 'SELECT 1 FROM wa_bandejas WHERE business_id = ? AND canal = ? AND phone_number_id = ?', c.businessId, row.canal, row.phone_number_id)) throw new HttpError(409, 'Ya tienes una bandeja con ese id en ese canal');
      row.slug = hex(12);
      row.verify_token = hex(16);
      if (body.api_key) { exigirKek(c.env); row.clave_cifrada = await cifrarClave(c.env, claveValida(body.api_key, 'La clave API')); }
      if (body.app_secret) { exigirKek(c.env); row.secreto_cifrado = await cifrarClave(c.env, claveValida(body.app_secret, 'El secreto de la app')); }
    },
    beforeUpdate(c, row, before) { delete row.canal; revisarBandeja(row, before.canal); },
    async afterDelete(c, before) {
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM wa_mensajes WHERE bandeja_id = ? AND business_id = ?').bind(before.id, c.businessId),
        c.env.DB.prepare('DELETE FROM wa_conversaciones WHERE bandeja_id = ? AND business_id = ?').bind(before.id, c.businessId),
        c.env.DB.prepare('DELETE FROM wa_agentes WHERE bandeja_id = ? AND business_id = ?').bind(before.id, c.businessId),
      ]);
    },
    decorate: (c, rows) => rows.map(({ clave_cifrada, secreto_cifrado, ...b }) => ({
      ...b, tiene_clave: !!clave_cifrada, tiene_secreto: !!secreto_cifrado,
      webhook_url: `${c.ctx?.origin || ''}/wa/${b.slug}`,
      ...(c.canManage || ['owner', 'admin'].includes(c.role) ? {} : { verify_token: null }),
    })),
  },
  agentes: {
    table: 'wa_agentes', label: 'el agente', title: 'nombre', search: ['nombre'], order: 'created_at',
    fields: { nombre: 'text!', bandeja_id: 'int!', instrucciones: 'long', usar_marca: 'bool+', activo: 'bool+' },
    refs: { bandeja_id: 'wa_bandejas' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row) {
      textoLargo(row);
      if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_agentes WHERE business_id = ? AND bandeja_id = ?', c.businessId, row.bandeja_id)).n >= MAX_AGENTES) throw new HttpError(400, `Una bandeja admite hasta ${MAX_AGENTES} agentes`);
    },
    beforeUpdate(c, row) { textoLargo(row); },
    // Solo un agente activo por bandeja: al activar uno, los demás de esa bandeja se apagan
    async afterCreate(c, id, row) { if (row.activo !== 0) await solitario(c, id, row.bandeja_id); },
    async afterUpdate(c, id, row, before) { if (row.activo === 1) await solitario(c, id, before.bandeja_id); },
  },
};
const solitario = (c, id, bandeja) => c.env.DB.prepare('UPDATE wa_agentes SET activo = 0 WHERE business_id = ? AND bandeja_id = ? AND id <> ?').bind(c.businessId, bandeja, id).run();
export const api = crud({ get() {}, post() {}, patch() {}, delete() {} }, { base: '/ia/whatsapp', modulo: MOD, entities: ENTITIES });

const bandejaDe = async (c, id) => {
  const b = await one(c.env, 'SELECT * FROM wa_bandejas WHERE id = ? AND business_id = ?', Number(id), c.businessId);
  if (!b) throw new HttpError(404, 'No encontrado');
  return b;
};
const chatDe = async (c, id) => {
  const ch = await one(c.env, 'SELECT c.*, b.canal, b.nombre bandeja FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id WHERE c.id = ? AND c.business_id = ?', Number(id), c.businessId);
  if (!ch) throw new HttpError(404, 'No encontrado');
  return ch;
};

/* ---------- chats ---------- */
export const chats = (c, { bandeja, canal, q, limite = 200 } = {}) => {
  const donde = ['c.business_id = ?'], args = [c.businessId];
  if (bandeja) { donde.push('c.bandeja_id = ?'); args.push(Number(bandeja)); }
  if (canal) { donde.push('b.canal = ?'); args.push(String(canal)); }
  if (q) { donde.push('(c.nombre LIKE ? OR c.contacto LIKE ? OR c.ultimo_texto LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  return all(c.env, `SELECT c.id, c.bandeja_id, b.nombre bandeja, b.canal, c.contacto, c.nombre, c.ia_activa, c.contact_id, c.no_leidos, c.ultimo_ts, c.ultimo_texto, c.ultimo_rol
    FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id WHERE ${donde.join(' AND ')} ORDER BY c.ultimo_ts DESC LIMIT ${Math.min(200, Number(limite) || 200)}`, ...args);
};
export const mensajesDe = (c, chat) => all(c.env, 'SELECT id, ts, rol, contenido, estado FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? ORDER BY ts, id LIMIT 300', c.businessId, chat.bandeja_id, chat.contacto);
export async function chatCompleto(c, id) {
  const chat = await chatDe(c, id), marketing = await marketingActivo(c.env, c.businessId);
  const ultimoEntrante = (await one(c.env, "SELECT MAX(ts) t FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? AND rol = 'user'", c.businessId, chat.bandeja_id, chat.contacto))?.t || 0;
  let datos = null; try { datos = chat.datos ? JSON.parse(chat.datos) : null; } catch { /* sin datos */ }
  const agente = await one(c.env, 'SELECT id, nombre FROM wa_agentes WHERE business_id = ? AND bandeja_id = ? AND activo = 1', c.businessId, chat.bandeja_id);
  return { chat: { ...chat, datos }, mensajes: await mensajesDe(c, chat), marketing, contact: marketing ? await contactoPorId(c.env, c.businessId, chat.contact_id) : null, ventana_abierta: now() - ultimoEntrante < 86400000, agente };
}

// Plantilla con sus {{n}} llenas, para dejar en el chat lo que se envió
const llenar = (cuerpo, vars) => String(cuerpo || '').replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] ?? '');

export function routes(r) {
  crud(r, { base: B, modulo: MOD, entities: ENTITIES });
  r.post(`${B}/bandejas/:id/credenciales`, `manager:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.params.id), body = await readJson(c.req), set = [], args = [];
    exigirKek(c.env);
    if (body.api_key !== undefined) { set.push('clave_cifrada = ?'); args.push(body.api_key ? await cifrarClave(c.env, claveValida(body.api_key, 'La clave API')) : null); }
    if (body.app_secret !== undefined) { set.push('secreto_cifrado = ?'); args.push(body.app_secret ? await cifrarClave(c.env, claveValida(body.app_secret, 'El secreto de la app')) : null); }
    if (!set.length) throw new HttpError(400, 'Envía api_key o app_secret');
    await c.env.DB.prepare(`UPDATE wa_bandejas SET ${set.join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...args, now(), b.id, c.businessId).run();
    await audit(c, `Cambió las credenciales de la bandeja «${b.nombre}»`, { modulo: MOD });
    return json({ ok: true });
  });
  r.post(`${B}/bandejas/:id/token`, `manager:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.params.id), token = hex(16);
    await c.env.DB.prepare('UPDATE wa_bandejas SET verify_token = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(token, now(), b.id, c.businessId).run();
    await audit(c, `Generó otro token de verificación para «${b.nombre}»`, { modulo: MOD });
    return json({ verify_token: token });
  });
  r.post(`${B}/bandejas/:id/probar`, `manager:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.params.id), body = await readJson(c.req);
    const res = await probarBandeja(c.env, b, body.para ? String(body.para).slice(0, 30) : null);
    await audit(c, `Probó la conexión de la bandeja «${b.nombre}»${res.ok ? '' : ' (con fallas)'}`, { modulo: MOD });
    return json(res);
  });

  /* chats */
  r.get(`${B}/chats`, `tenant:${MOD}`, async (c) => json({ rows: await chats(c, { bandeja: c.url.searchParams.get('bandeja'), canal: c.url.searchParams.get('canal'), q: (c.url.searchParams.get('q') || '').trim().slice(0, 60) }) }));
  r.get(`${B}/chats/:id`, `tenant:${MOD}`, async (c) => json(await chatCompleto(c, c.params.id)));
  r.post(`${B}/chats/:id/leer`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id);
    await c.env.DB.prepare('UPDATE wa_conversaciones SET no_leidos = 0 WHERE id = ? AND business_id = ?').bind(ch.id, c.businessId).run();
    return json({ ok: true });
  });
  r.patch(`${B}/chats/:id`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id), body = await readJson(c.req);
    if (typeof body.ia_activa !== 'boolean') throw new HttpError(400, 'Envía ia_activa (true o false)');
    await c.env.DB.prepare('UPDATE wa_conversaciones SET ia_activa = ? WHERE id = ? AND business_id = ?').bind(body.ia_activa ? 1 : 0, ch.id, c.businessId).run();
    await audit(c, `${body.ia_activa ? 'Activó' : 'Desactivó'} la IA en el chat de ${ch.nombre || ch.contacto} (${ch.bandeja})`, { modulo: MOD });
    return json({ ok: true, ia_activa: body.ia_activa });
  });
  r.post(`${B}/chats/:id/enviar`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id), b = await bandejaDe(c, ch.bandeja_id), body = await readJson(c.req);
    const t = String(body.texto || '').trim();
    if (!t || t.length > 4000) throw new HttpError(400, 'Escribe un mensaje (máximo 4000 letras)');
    if (!b.activo) throw new HttpError(400, 'La bandeja está desactivada');
    const { estado, error } = await enviarTexto(c.env, b, ch.contacto, t);
    await guardarMensaje(c.env, { org: c.businessId, bandeja: b.id, contacto: ch.contacto, rol: 'humano', contenido: t, estado });
    // Cuando una persona responde, la IA se apaga en ese chat (se vuelve a encender con el interruptor)
    await tocarChat(c.env, { org: c.businessId, bandeja: b, contacto: ch.contacto, rol: 'humano', contenido: t });
    await c.env.DB.prepare('UPDATE wa_conversaciones SET ia_activa = 0 WHERE id = ?').bind(ch.id).run();
    if (estado !== 'enviado') throw new HttpError(estado === 'sin_clave' ? 400 : 502, estado === 'sin_clave' ? 'La bandeja no tiene clave API: agrégala para poder enviar' : `No se envió: ${error || 'Meta no aceptó el mensaje'}${b.canal === 'whatsapp' ? '. Pasadas 24 h desde el último mensaje de la persona hay que usar una plantilla.' : '. Solo se puede responder dentro de las 24 h siguientes al último mensaje.'}`);
    return json({ ok: true, estado, ia_activa: false });
  });
  r.post(`${B}/chats/:id/contacto`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id), b = await bandejaDe(c, ch.bandeja_id), d = await readJson(c.req);
    if (!(await marketingActivo(c.env, c.businessId))) throw new HttpError(400, 'Los contactos se guardan en Marketing: pídele a Diwilo que lo active para tu negocio');
    const res = await guardarContacto(c.env, c.businessId, { bandeja: b, conv: ch, d });
    if (!res) throw new HttpError(400, 'Faltan datos: el nombre y un teléfono o correo');
    const limpio = Object.fromEntries(['nombre', 'telefono', 'correo', 'interes'].map((k) => [k, String(d[k] || '').slice(0, 300)]));
    await c.env.DB.prepare('UPDATE wa_conversaciones SET contact_id = ?, datos = ?, nombre = COALESCE(nombre, ?) WHERE id = ? AND business_id = ?').bind(res.id, JSON.stringify(limpio), limpio.nombre || null, ch.id, c.businessId).run();
    await audit(c, `${res.creado ? 'Creó' : 'Enlazó'} el contacto de Marketing desde el chat de ${ch.nombre || ch.contacto}`, { modulo: MOD });
    return json({ ok: true, ...res, contact: await contactoPorId(c.env, c.businessId, res.id) });
  });
  r.delete(`${B}/chats/:id`, `manager:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ?').bind(c.businessId, ch.bandeja_id, ch.contacto),
      c.env.DB.prepare('DELETE FROM wa_conversaciones WHERE id = ? AND business_id = ?').bind(ch.id, c.businessId),
    ]);
    await audit(c, `Borró el chat de ${ch.nombre || ch.contacto} (${ch.bandeja})`, { modulo: MOD });
    return json({ ok: true });
  });

  /* contactos de Marketing y plantillas */
  r.get(`${B}/contactos`, `tenant:${MOD}`, async (c) => {
    if (!(await marketingActivo(c.env, c.businessId))) return json({ marketing: false, rows: [] });
    const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60);
    const rows = await all(c.env, `SELECT id, name, phone, email, stage FROM mk_contacts WHERE business_id = ? AND phone IS NOT NULL AND phone <> '' ${q ? 'AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)' : ''} ORDER BY updated_at DESC LIMIT 100`, ...(q ? [c.businessId, `%${q}%`, `%${q}%`, `%${q}%`] : [c.businessId]));
    return json({ marketing: true, rows });
  });
  r.get(`${B}/plantillas`, `tenant:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.url.searchParams.get('bandeja'));
    if (b.canal !== 'whatsapp') throw new HttpError(400, 'Las plantillas son solo de WhatsApp');
    try { return json({ rows: await plantillasDe(c.env, b) }); } catch (e) { throw new HttpError(e.message === 'sin_clave' ? 400 : 502, e.message === 'sin_clave' ? 'La bandeja no tiene clave API' : `No se pudieron leer las plantillas: ${e.message}`); }
  });
  r.post(`${B}/plantillas/enviar`, `tenant:${MOD}`, async (c) => {
    const body = await readJson(c.req), b = await bandejaDe(c, body.bandeja_id);
    if (b.canal !== 'whatsapp' || !b.activo) throw new HttpError(400, 'Elige una bandeja de WhatsApp activa');
    const vars = (Array.isArray(body.variables) ? body.variables : []).slice(0, 20).map((v) => String(v ?? '').slice(0, 500));
    // Destinatarios: contactos de Marketing y/o chats ya abiertos; sin repetir número
    const dest = new Map();
    for (const id of (Array.isArray(body.contactos) ? body.contactos : []).slice(0, MAX_ENVIO)) {
      const k = await contactoPorId(c.env, c.businessId, Number(id));
      if (k?.phone && COL(k.phone).length >= 8) dest.set(COL(k.phone), { nombre: k.name, contact_id: k.id });
    }
    for (const id of (Array.isArray(body.chats) ? body.chats : []).slice(0, MAX_ENVIO)) {
      const ch = await chatDe(c, Number(id));
      if (ch.canal === 'whatsapp') dest.set(ch.contacto, { nombre: ch.nombre, contact_id: ch.contact_id });
    }
    if (!dest.size) throw new HttpError(400, 'Elige al menos un contacto con teléfono');
    if (dest.size > MAX_ENVIO) throw new HttpError(400, `Máximo ${MAX_ENVIO} destinatarios por envío`);
    let tpl;
    try { tpl = (await plantillasDe(c.env, b)).find((p) => p.nombre === body.plantilla && p.idioma === body.idioma); } catch (e) { throw new HttpError(502, `No se pudieron leer las plantillas: ${e.message}`); }
    if (!tpl || !tpl.soportada) throw new HttpError(400, 'Esa plantilla no existe, no está aprobada o tiene encabezado con archivo / botones con variables (envíala desde Meta)');
    if (vars.length < tpl.variables) throw new HttpError(400, `La plantilla necesita ${tpl.variables} variable${tpl.variables === 1 ? '' : 's'}`);
    const enviados = [], fallidos = [];
    for (const [para, k] of dest) {
      const v = vars.slice(0, tpl.variables).map((x) => x.replace(/\{nombre\}/gi, (k.nombre || '').split(' ')[0] || 'cliente'));
      const { estado, error } = await enviarPlantilla(c.env, b, para, tpl.nombre, tpl.idioma, v);
      if (estado !== 'enviado') { fallidos.push({ para, nombre: k.nombre, error: estado === 'sin_clave' ? 'La bandeja no tiene clave API' : error }); continue; }
      const t = `[Plantilla ${tpl.nombre}] ${llenar(tpl.cuerpo, v)}`;
      await guardarMensaje(c.env, { org: c.businessId, bandeja: b.id, contacto: para, nombre: k.nombre || null, rol: 'humano', contenido: t, estado });
      const conv = await tocarChat(c.env, { org: c.businessId, bandeja: b, contacto: para, nombre: k.nombre || null, rol: 'humano', contenido: t });
      if (k.contact_id && !conv.contact_id) await c.env.DB.prepare('UPDATE wa_conversaciones SET contact_id = ? WHERE id = ?').bind(k.contact_id, conv.id).run();
      enviados.push(para);
    }
    await audit(c, `Envió la plantilla «${tpl.nombre}» a ${enviados.length} contacto${enviados.length === 1 ? '' : 's'}${fallidos.length ? ` (${fallidos.length} con error)` : ''}`, { modulo: MOD });
    return json({ enviados: enviados.length, fallidos });
  });
}

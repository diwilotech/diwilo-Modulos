// Mensajes (módulo «whatsapp»): bandejas de WhatsApp, Instagram y Messenger, chats con interruptor de IA, agentes de IA por bandeja,
// contactos en Marketing y plantillas de WhatsApp. Ver: todo el equipo; configurar: propietario y administrador.
//   CRUD  /api/whatsapp/bandejas                 bandejas (canal, nombre, teléfono +57…, id del número / página / cuenta de Instagram, id de la cuenta, clave API)
//   POST  /api/whatsapp/bandejas/:id/credenciales { api_key?, app_secret? }   guarda la clave API / el secreto (cifrados; nunca se devuelven)
//   POST  /api/whatsapp/bandejas/:id/token       genera otro token de verificación del webhook
//   POST  /api/whatsapp/bandejas/:id/probar      { para? } verifica clave e IDs contra Meta; en WhatsApp, con `para`, manda un mensaje de prueba
//   CRUD  /api/whatsapp/agentes                  agentes de IA (de una bandeja o de todas: bandeja_id 0) con los datos de contacto que piden (campos)
//   GET   /api/whatsapp/chats?bandeja=&canal=&q=  lista de chats (izquierda) · GET /chats/:id chat completo (mensajes y contacto)
//   PATCH /api/whatsapp/chats/:id { ia_activa?, agente_id? }  enciende o apaga la IA en ese chat y elige qué agente lo atiende (0 = ninguno) · POST /:id/leer · POST /:id/enviar { texto } (apaga la IA de ese chat)
//   POST  /api/whatsapp/chats/:id/sugerir        la IA lee la conversación y redacta una respuesta para revisar (no se envía)
//   POST  /api/whatsapp/chats/:id/responder-ia   la IA responde ya al último mensaje, aunque la IA del chat esté apagada
//   POST  /api/whatsapp/chats/:id/cita/cancelar  cancela la cita de Meet agendada en el chat · CRUD /api/whatsapp/admins  números administradores por WhatsApp
//   POST  /api/whatsapp/chats/:id/enlazar        { contact_id } añade el chat a un contacto de Marketing que ya existe (null = quitar el enlace)
//   POST  /api/whatsapp/chats/:id/contacto       guarda / enlaza el contacto en Marketing · DELETE /chats/:id
//   GET   /api/whatsapp/google · POST /google/credenciales · /google/conectar · /google/desconectar · /google/probar · PUT /google/agenda  conexión con Google (Gmail y Calendar)
//   GET   /api/whatsapp/mensajes?q=&canal=&bandeja=  todos los mensajes de todos los canales (los 200 más recientes)
//   POST  /api/whatsapp/correo/enviar            { bandeja_id, asunto, mensaje, contactos[] } correo nuevo a contactos de Marketing · CRUD /api/whatsapp/respuestas = mis plantillas
//   GET   /api/whatsapp/contactos?q=&con=email|phone             contactos de Marketing (para enviar plantillas)
//   GET   /api/whatsapp/plantillas?bandeja=      plantillas aprobadas de WhatsApp · POST /plantillas/enviar { bandeja_id, plantilla, idioma, variables, contactos[], chats[] }
// Público (en el dominio de cada app): GET|POST /wa/<slug> = el webhook (webhook.js).
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { cifrarClave } from '../../lib/ia.js';
import { enviarTexto, enviarPlantilla, enviarCorreo, plantillasDe, probarBandeja, webhookValido, perfil, soloDigitos, CANALES } from './canales.js';
import { guardarMensaje, tocarChat, responder, AGENTE_EN } from './webhook.js';
import { marketingActivo, contactoPorId, guardarContacto, normalizarCampos, limpiarDatos } from './contactos.js';
import { paisDeTelefono } from './lugar.js';
import { sincronizarSiToca } from './correo.js';
import { hashPin } from './admin.js';
import { entenderMensaje, guardarArchivo, listarArchivos } from './media.js';
import { cancelarCita, estadoGoogle, guardarCredenciales, leerCredenciales, urlConexion, desconectar, asignarUsos, enviarGmail, cuentaPara, listarDirecciones, gapi, normalizarAgenda, huecosLibres, filaGoogle, conectado, GoogleError } from './google.js';

const MOD = 'whatsapp', B = '/api/whatsapp', MAX_BANDEJAS = 10, MAX_AGENTES = 5, MAX_ENVIO = 50;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const COL = (s) => { const d = soloDigitos(s); return d.length === 10 ? `57${d}` : d; };   // número colombiano de 10 dígitos → con indicativo

/* ---------- entidades ---------- */
function revisarBandeja(row, canal) {
  if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre de la bandeja es muy largo (máximo 80 letras)');
  if (row.url_salida && !webhookValido(row.url_salida)) throw new HttpError(400, 'La URL de salida debe ser una dirección https pública');
  if (canal === 'webhook') return;
  if (canal === 'correo') { if (row.phone_number_id != null) { row.phone_number_id = String(row.phone_number_id).trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.phone_number_id)) throw new HttpError(400, 'Escribe la dirección de correo completa, por ejemplo hola@tuempresa.com'); } return; }
  if (row.phone_number_id != null && !/^\d{5,30}$/.test(row.phone_number_id)) throw new HttpError(400, canal === 'whatsapp' ? 'El id del número de teléfono son solo dígitos (lo da Meta)' : 'El id de la página o de la cuenta de Instagram son solo dígitos (lo da Meta)');
  if (canal === 'whatsapp') {
    if (row.telefono != null && !/^\+\d{8,15}$/.test(String(row.telefono).replace(/[\s-]/g, ''))) throw new HttpError(400, 'El teléfono debe llevar el indicativo, por ejemplo +57 300 123 4567');
    if (row.waba_id != null && !/^\d{5,30}$/.test(row.waba_id)) throw new HttpError(400, 'El id de la cuenta de negocio son solo dígitos (lo da Meta)');
    if (row.cuenta_plantillas && !/^\d{5,30}$/.test(row.cuenta_plantillas)) throw new HttpError(400, 'El id de la cuenta de mensajería (plantillas) son solo dígitos (lo da Meta)');
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
  if ((row.bienvenida && row.bienvenida.length > 1500) || (row.bienvenida_conocido && row.bienvenida_conocido.length > 1500)) throw new HttpError(400, 'El mensaje de bienvenida es muy largo (máximo 1500 letras)');
};

// Bandeja de correo = una cuenta de Google vinculada: su dirección es la de la cuenta (recibe todo lo que llega a la cuenta y a sus alias)
async function cuentaDeGoogle(c, id) {
  const cu = await one(c.env, 'SELECT id, email FROM wa_google_cuentas WHERE id = ? AND business_id = ?', Number(id), c.businessId);
  if (!cu) throw new HttpError(400, 'Esa cuenta de Google no está vinculada: vincúlala en la pestaña Google');
  return cu;
}
export const ENTITIES = {
  bandejas: {
    table: 'wa_bandejas', label: 'la bandeja', title: 'nombre', search: ['nombre', 'telefono'], order: 'created_at',
    fields: { nombre: 'text!', canal: Object.keys(CANALES), telefono: 'text', phone_number_id: 'text', waba_id: 'text', url_salida: 'url', reenviar_a: 'email', cuenta_plantillas: 'text', cuenta_google: 'int', responder_desde: ['auto', 'cuenta'], autoguardar: 'bool+', activo: 'bool+' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row, body) {
      row.canal ||= 'whatsapp';
      if (row.canal === 'correo' && row.cuenta_google) row.phone_number_id = (await cuentaDeGoogle(c, row.cuenta_google)).email;
      if (row.canal === 'whatsapp' && (!row.telefono || !row.waba_id)) throw new HttpError(400, 'WhatsApp necesita el teléfono y el id de la cuenta de WhatsApp Business');
      if (row.canal === 'webhook') row.phone_number_id = `wh_${hex(6)}`;
      else if (row.canal === 'correo' && !row.phone_number_id) throw new HttpError(400, 'Falta la dirección de correo de la bandeja');
      else if (row.canal !== 'correo' && !row.phone_number_id) throw new HttpError(400, 'Falta el id del número, de la página o de la cuenta de Instagram');
      revisarBandeja(row, row.canal);
      row.telefono ||= ''; row.waba_id ||= '';
      if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_bandejas WHERE business_id = ?', c.businessId)).n >= MAX_BANDEJAS) throw new HttpError(400, `Ya tienes ${MAX_BANDEJAS} bandejas`);
      if (await one(c.env, 'SELECT 1 FROM wa_bandejas WHERE business_id = ? AND canal = ? AND phone_number_id = ?', c.businessId, row.canal, row.phone_number_id)) throw new HttpError(409, 'Ya tienes una bandeja con ese id en ese canal');
      // Una dirección de correo llega a una sola bandeja de todo el sistema
      if (row.canal === 'correo' && await one(c.env, "SELECT 1 FROM wa_bandejas WHERE canal = 'correo' AND lower(phone_number_id) = ?", row.phone_number_id)) throw new HttpError(409, row.cuenta_google ? 'Esa cuenta de Google ya tiene una bandeja de correo' : 'Esa dirección de correo ya está conectada a una bandeja');
      row.slug = hex(12);
      row.verify_token = hex(16);
      if (body.api_key) { exigirKek(c.env); row.clave_cifrada = await cifrarClave(c.env, claveValida(body.api_key, 'La clave API')); }
      if (body.app_secret) { exigirKek(c.env); row.secreto_cifrado = await cifrarClave(c.env, claveValida(body.app_secret, 'El secreto de la app')); }
    },
    async beforeUpdate(c, row, before) {
      delete row.canal; revisarBandeja(row, before.canal);
      // Bandeja de correo: al elegir otra cuenta de Google, la dirección pasa a ser la de esa cuenta
      if (before.canal === 'correo' && row.cuenta_google) {
        row.phone_number_id = (await cuentaDeGoogle(c, row.cuenta_google)).email;
        if (await one(c.env, "SELECT 1 FROM wa_bandejas WHERE canal = 'correo' AND lower(phone_number_id) = ? AND id <> ?", row.phone_number_id, before.id)) throw new HttpError(409, 'Esa cuenta de Google ya tiene una bandeja de correo');
      }
    },
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
    // bandejas = JSON [ids de bandeja donde puede servir]; vacío = todas. `campos` = JSON { campos, extras } con los datos de contacto que pide.
    fields: { nombre: 'text!', bandejas: 'long', instrucciones: 'long', usar_marca: 'bool+', alerta_asesor: 'bool+', insistir: 'bool+', agendar: 'bool', bienvenida: 'long', bienvenida_conocido: 'long', usar_conocido: 'bool+', campos: 'long', espera_seg: 'int', tope_diario: 'int' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row) {
      textoLargo(row); await fijarBandejas(c, row, true);
      if (row.campos) row.campos = normalizarCampos(row.campos);
      if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_agentes WHERE business_id = ?', c.businessId)).n >= MAX_AGENTES) throw new HttpError(400, `Ya tienes ${MAX_AGENTES} agentes`);
    },
    async beforeUpdate(c, row) { textoLargo(row); await fijarBandejas(c, row, false); if (row.campos) row.campos = normalizarCampos(row.campos); },
    // Si se borra un agente, los chats que lo usaban quedan sin asignar (se les pone otro al próximo mensaje)
    async afterDelete(c, before) { await c.env.DB.prepare('UPDATE wa_conversaciones SET agente_id = NULL WHERE business_id = ? AND agente_id = ?').bind(c.businessId, before.id).run(); },
    decorate: (c, rows) => rows.map((r) => ({ ...r, bandejas: listaBandejas(r.bandejas) })),
  },
};

// Mis plantillas: respuestas reutilizables para cualquier canal (WhatsApp dentro de las 24 h, Instagram, Messenger, correo, web). Admiten {nombre} y {empresa}.
const canalesDe = (t) => { try { const x = JSON.parse(t || '[]'); return Array.isArray(x) ? x.filter((k) => k in CANALES) : []; } catch { return []; } };
ENTITIES.respuestas = {
  table: 'wa_respuestas', label: 'la plantilla', title: 'nombre', search: ['nombre', 'cuerpo'], order: 'nombre',
  fields: { nombre: 'text!', canales: 'long', asunto: 'text', cuerpo: 'long!' },
  leer: 'tenant', crear: 'tenant', borrar: 'manager',
  async beforeCreate(c, row) {
    if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_respuestas WHERE business_id = ?', c.businessId)).n >= 100) throw new HttpError(400, 'Ya tienes 100 plantillas');
    row.canales = JSON.stringify(canalesDe(row.canales)); if (row.cuerpo && row.cuerpo.length > 4000) throw new HttpError(400, 'La plantilla es muy larga (máximo 4000 letras)');
  },
  beforeUpdate(c, row) { if (row.canales != null) row.canales = JSON.stringify(canalesDe(row.canales)); if (row.cuerpo && row.cuerpo.length > 4000) throw new HttpError(400, 'La plantilla es muy larga (máximo 4000 letras)'); },
  decorate: (c, rows) => rows.map((r) => ({ ...r, canales: canalesDe(r.canales) })),
};
// Administradores por WhatsApp: números autorizados (con PIN opcional) que controlan el sistema desde el celular. El PIN nunca se devuelve.
const numeroAdmin = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.length === 10 && d[0] === '3') d = `57${d}`; if (d.length < 8 || d.length > 15) throw new HttpError(400, 'Escribe el número con indicativo de país'); return d; };
const pinAdmin = async (c, pin) => { const p = String(pin || '').trim(); if (p && !/^[A-Za-z0-9]{4,12}$/.test(p)) throw new HttpError(400, 'El PIN debe tener de 4 a 12 letras o números'); return p ? hashPin(c.businessId, p) : null; };
ENTITIES.admins = {
  table: 'wa_admins', label: 'el administrador', title: 'nombre', search: ['nombre', 'numero'], order: 'created_at',
  fields: { nombre: 'text', numero: 'text!', pin: 'text', usuario: 'email', activo: 'bool+' },
  leer: 'manager', crear: 'manager', borrar: 'manager',
  async beforeCreate(c, row) {
    if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_admins WHERE business_id = ?', c.businessId)).n >= 5) throw new HttpError(400, 'Máximo 5 administradores');
    row.numero = numeroAdmin(row.numero); row.pin_hash = await pinAdmin(c, row.pin); delete row.pin;
  },
  async beforeUpdate(c, row) {
    if ('numero' in row) row.numero = numeroAdmin(row.numero);
    if ('pin' in row) { row.pin_hash = await pinAdmin(c, row.pin); row.desbloqueado_hasta = 0; row.fallos = 0; row.bloqueado_hasta = 0; delete row.pin; }
  },
  decorate: (c, rows) => rows.map(({ pin_hash, ...r }) => ({ ...r, tiene_pin: !!pin_hash })),
};
const listaBandejas = (t) => { try { const x = JSON.parse(t || '[]'); return Array.isArray(x) ? x.filter((n) => Number.isInteger(n) && n > 0) : []; } catch { return []; } };
// Valida las bandejas elegidas (todas deben ser del negocio) y deja bandeja_id (la primera, o 0 = todas) por compatibilidad
async function fijarBandejas(c, row, creando) {
  if (row.bandejas == null && !creando) return;
  const ids = [...new Set(listaBandejas(row.bandejas))].slice(0, 20);
  for (const id of ids) if (!(await one(c.env, 'SELECT 1 FROM wa_bandejas WHERE id = ? AND business_id = ?', id, c.businessId))) throw new HttpError(400, 'Una de las bandejas no existe en este negocio');
  row.bandejas = JSON.stringify(ids); row.bandeja_id = ids[0] || 0;
}
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
// El país de un chat de WhatsApp sale del indicativo del número (aunque el chat sea anterior a esta función)
const conLugar = (r) => ({ ...r, pais: r.pais || (r.canal === 'whatsapp' ? paisDeTelefono(r.contacto) : null) });
export const chats = async (c, { bandeja, canal, q, limite = 200 } = {}) => {
  const donde = ['c.business_id = ?'], args = [c.businessId];
  if (bandeja) { donde.push('c.bandeja_id = ?'); args.push(Number(bandeja)); }
  if (canal) { donde.push('b.canal = ?'); args.push(String(canal)); }
  if (q) { donde.push('(c.nombre LIKE ? OR c.contacto LIKE ? OR c.ultimo_texto LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  return (await all(c.env, `SELECT c.id, c.bandeja_id, b.nombre bandeja, b.canal, c.contacto, c.nombre, c.ia_activa, c.agente_id, ag.nombre agente, c.contact_id, c.atencion, c.asunto, c.via_correo, c.admin, c.no_leidos, c.ultimo_ts, c.ultimo_texto, c.ultimo_rol, c.pais, c.dispositivo, c.pagina
    FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id LEFT JOIN wa_agentes ag ON ag.id = c.agente_id WHERE ${donde.join(' AND ')} ORDER BY c.ultimo_ts DESC LIMIT ${Math.min(200, Number(limite) || 200)}`, ...args)).map(conLugar);
};
export const mensajesDe = (c, chat) => all(c.env, 'SELECT id, ts, rol, contenido, estado, tipo, media_mime, media_nombre, media_bytes, media_estado, media_texto, (media_key IS NOT NULL) media_lista, (SELECT COUNT(*) FROM wa_archivos a WHERE a.mensaje_id = wa_mensajes.id) guardado FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? ORDER BY ts, id LIMIT 300', c.businessId, chat.bandeja_id, chat.contacto);
const intentosPerfil = new Map();
export async function chatCompleto(c, id) {
  const chat = await chatDe(c, id);
  // Chats de Instagram / Messenger sin nombre (anteriores, o que Meta no dio al inicio): se intenta ponérselo al abrirlos
  if (!chat.nombre && (chat.canal === 'instagram' || chat.canal === 'messenger') && Date.now() - (intentosPerfil.get(chat.id) || 0) > 600000) {   // si Meta no lo da, se reintenta cada 10 min, no en cada refresco
    intentosPerfil.set(chat.id, Date.now());
    const b = await one(c.env, 'SELECT * FROM wa_bandejas WHERE id = ? AND business_id = ?', chat.bandeja_id, c.businessId), n = b?.clave_cifrada ? await perfil(c.env, b, chat.contacto) : null;
    if (n) { await c.env.DB.prepare('UPDATE wa_conversaciones SET nombre = ? WHERE id = ? AND business_id = ? AND nombre IS NULL').bind(n, chat.id, c.businessId).run(); chat.nombre = n; }
  }
  const marketing = await marketingActivo(c.env, c.businessId);
  const ultimoEntrante = (await one(c.env, "SELECT MAX(ts) t FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? AND rol = 'user'", c.businessId, chat.bandeja_id, chat.contacto))?.t || 0;
  let datos = null; try { datos = chat.datos ? JSON.parse(chat.datos) : null; } catch { /* sin datos */ }
  let cita = null; try { cita = chat.cita ? JSON.parse(chat.cita) : null; } catch { /* sin cita */ }
  const otros = chat.contact_id ? await all(c.env, 'SELECT c.id, b.canal, b.nombre bandeja, c.nombre, c.contacto, c.ultimo_ts FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id WHERE c.business_id = ? AND c.contact_id = ? AND c.id <> ? ORDER BY c.ultimo_ts DESC LIMIT 6', c.businessId, chat.contact_id, chat.id) : [];
  const agentes = await all(c.env, `SELECT id, nombre FROM wa_agentes WHERE business_id = ? AND ${AGENTE_EN} ORDER BY id`, c.businessId, chat.bandeja_id);
  const agente = agentes.find((a) => a.id === chat.agente_id) || null;
  return { chat: { ...conLugar(chat), datos, cita }, mensajes: await mensajesDe(c, chat), marketing, contact: marketing ? await contactoPorId(c.env, c.businessId, chat.contact_id) : null, ventana_abierta: now() - ultimoEntrante < 86400000, agente, agentes, otros_chats: otros };
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
    const res = await probarBandeja(c.env, b, body.para ? String(body.para).slice(0, 120) : null);
    await audit(c, `Probó la conexión de la bandeja «${b.nombre}»${res.ok ? '' : ' (con fallas)'}`, { modulo: MOD });
    return json(res);
  });

  // Widget de Inicio: chats sin leer, chats en rojo (necesitan a una persona) y sin responder
  r.get(`${B}/resumen`, `tenant:${MOD}`, async (c) => {
    const f = await one(c.env, "SELECT COALESCE(SUM(CASE WHEN no_leidos > 0 THEN 1 ELSE 0 END), 0) sin_leer, COALESCE(SUM(CASE WHEN atencion IS NOT NULL THEN 1 ELSE 0 END), 0) rojos, COALESCE(SUM(CASE WHEN ultimo_rol = 'user' AND ultimo_ts > ? THEN 1 ELSE 0 END), 0) sin_responder FROM wa_conversaciones WHERE business_id = ? AND admin = 0", Date.now() - 86400000, c.businessId);
    const detalle = [f.rojos ? `${f.rojos} necesita${f.rojos === 1 ? '' : 'n'} a una persona` : '', f.sin_responder ? `${f.sin_responder} sin responder hoy` : ''].filter(Boolean).join(' · ') || 'Todo al día';
    return json({ titulo: 'Chats sin leer', valor: f.sin_leer, detalle, icono: 'bi-chat-dots', ruta: '/staff/whatsapp.html', rojos: f.rojos, sin_responder: f.sin_responder });
  });

  /* chats */
  r.get(`${B}/chats`, `tenant:${MOD}`, async (c) => { sincronizarSiToca(c.env, c.businessId, c.waitUntil); return json({ rows: await chats(c, { bandeja: c.url.searchParams.get('bandeja'), canal: c.url.searchParams.get('canal'), q: (c.url.searchParams.get('q') || '').trim().slice(0, 60) }) }); });
  r.get(`${B}/chats/:id`, `tenant:${MOD}`, async (c) => json(await chatCompleto(c, c.params.id)));
  // Archivos de los chats: la IA los entiende (botón «Entender con IA») y el equipo puede guardarlos en la biblioteca
  r.post(`${B}/mensajes/:id/entender`, `tenant:${MOD}`, async (c) => {
    const m = await one(c.env, 'SELECT m.*, b.canal FROM wa_mensajes m JOIN wa_bandejas b ON b.id = m.bandeja_id WHERE m.id = ? AND m.business_id = ?', Number(c.params.id), c.businessId);
    if (!m || !m.tipo) throw new HttpError(404, 'Ese mensaje no tiene un archivo');
    const b = await one(c.env, 'SELECT * FROM wa_bandejas WHERE id = ?', m.bandeja_id);
    return json({ texto: await entenderMensaje(c.env, b, m) });
  });
  r.get(`${B}/archivos`, `tenant:${MOD}`, async (c) => json({ rows: await listarArchivos(c.env, c.businessId) }));
  r.post(`${B}/archivos`, `manager:${MOD}`, async (c) => {
    const body = await readJson(c.req), contactId = body.contact_id ? Number(body.contact_id) : null;
    if (contactId && !(await contactoPorId(c.env, c.businessId, contactId))) throw new HttpError(404, 'Ese contacto no existe en Marketing');
    const a = await guardarArchivo(c.env, c.businessId, { mensajeId: body.mensaje_id, nombre: body.nombre, contactId, por: c.session.email });
    await audit(c, `Guardó el archivo «${a.nombre}» en la biblioteca de Mensajes`, { modulo: MOD });
    return json(a, 201);
  });
  r.delete(`${B}/archivos/:id`, `manager:${MOD}`, async (c) => {
    const a = await one(c.env, 'SELECT * FROM wa_archivos WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!a) throw new HttpError(404, 'No encontrado');
    await c.env.DB.prepare('DELETE FROM wa_archivos WHERE id = ?').bind(a.id).run();
    await audit(c, `Quitó el archivo «${a.nombre}» de la biblioteca de Mensajes`, { modulo: MOD });
    return json({ ok: true });
  });
  r.post(`${B}/chats/:id/leer`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id);
    await c.env.DB.prepare('UPDATE wa_conversaciones SET no_leidos = 0 WHERE id = ? AND business_id = ?').bind(ch.id, c.businessId).run();
    return json({ ok: true });
  });
  r.patch(`${B}/chats/:id`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id), body = await readJson(c.req), set = [], args = [], quien = `${ch.nombre || ch.contacto} (${ch.bandeja})`;
    if (body.ia_activa !== undefined) {
      if (typeof body.ia_activa !== 'boolean') throw new HttpError(400, 'ia_activa debe ser true o false');
      set.push('ia_activa = ?'); args.push(body.ia_activa ? 1 : 0); if (body.ia_activa) set.push('bloqueado = 0');   // reactivar la IA también levanta el «no más mensajes»
      await audit(c, `${body.ia_activa ? 'Activó' : 'Desactivó'} la IA en el chat de ${quien}`, { modulo: MOD });
    }
    if (body.atencion === false) { set.push('atencion = NULL', 'atencion_ts = NULL'); await audit(c, `Marcó como atendido el chat de ${quien}`, { modulo: MOD }); }
    if (body.agente_id !== undefined) {
      const id = Number(body.agente_id);
      if (!Number.isInteger(id) || id < 0) throw new HttpError(400, 'agente_id no válido');
      if (id > 0 && !(await one(c.env, `SELECT 1 FROM wa_agentes WHERE id = ? AND business_id = ? AND ${AGENTE_EN}`, id, c.businessId, ch.bandeja_id))) throw new HttpError(400, 'Ese agente no está disponible para esta bandeja');
      set.push('agente_id = ?'); args.push(id);
      await audit(c, `Cambió el agente del chat de ${quien}`, { modulo: MOD });
    }
    if (!set.length) throw new HttpError(400, 'Envía ia_activa, agente_id o atencion: false');
    await c.env.DB.prepare(`UPDATE wa_conversaciones SET ${set.join(', ')} WHERE id = ? AND business_id = ?`).bind(...args, ch.id, c.businessId).run();
    return json({ ok: true });
  });
  r.post(`${B}/chats/:id/enviar`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id), b = await bandejaDe(c, ch.bandeja_id), body = await readJson(c.req);
    const t = String(body.texto || '').trim();
    if (!t || t.length > 4000) throw new HttpError(400, 'Escribe un mensaje (máximo 4000 letras)');
    if (!b.activo) throw new HttpError(400, 'La bandeja está desactivada');
    const { estado, error } = await enviarTexto(c.env, b, ch.contacto, t, { rol: 'humano', asunto: ch.asunto, ref: ch.ref_correo, desde: ch.via_correo });
    await guardarMensaje(c.env, { org: c.businessId, bandeja: b.id, contacto: ch.contacto, rol: 'humano', contenido: t, estado });
    // Cuando una persona responde, la IA se apaga en ese chat (se vuelve a encender con el interruptor)
    await tocarChat(c.env, { org: c.businessId, bandeja: b, contacto: ch.contacto, rol: 'humano', contenido: t });
    await c.env.DB.prepare('UPDATE wa_conversaciones SET ia_activa = 0, atencion = NULL, atencion_ts = NULL WHERE id = ?').bind(ch.id).run();
    if (estado === 'sin_destino') throw new HttpError(400, 'Esta bandeja web no tiene URL de salida: tu respuesta quedó guardada en el chat, pero no se envía a tu sistema. Agrégala en Ajustes de la bandeja.');
    if (estado !== 'enviado') throw new HttpError(estado === 'sin_clave' ? 400 : 502, estado === 'sin_clave' ? 'La bandeja no tiene clave API: agrégala para poder enviar' : `No se envió: ${error || 'Meta no aceptó el mensaje'}${b.canal === 'whatsapp' ? '. Pasadas 24 h desde el último mensaje de la persona hay que usar una plantilla.' : b.canal === 'correo' ? '' : '. Solo se puede responder dentro de las 24 h siguientes al último mensaje.'}`);
    return json({ ok: true, estado, ia_activa: false });
  });
  // La IA lee la conversación: «sugerir» redacta una respuesta para revisar (no se envía) y «responder-ia» responde ya, aunque la IA del chat esté apagada
  const iaDelChat = async (c, modo) => {
    const ch = await chatDe(c, c.params.id), b = await bandejaDe(c, ch.bandeja_id);
    if (modo === 'forzar' && !b.activo) throw new HttpError(400, 'La bandeja está desactivada');
    const texto = await responder(c.env, { bandeja: b, conv: ch, entregar: modo === 'forzar', modo });
    if (!texto) throw new HttpError(400, 'No pude redactar la respuesta: este chat no tiene un agente de IA disponible (elígelo con el botón del agente), se llegó al tope diario de IA o la suscripción está vencida');
    return { texto, ch, b };
  };
  r.post(`${B}/chats/:id/sugerir`, `tenant:${MOD}`, async (c) => json({ sugerencia: (await iaDelChat(c, 'sugerir')).texto }));
  r.post(`${B}/chats/:id/responder-ia`, `tenant:${MOD}`, async (c) => {
    const { texto, ch } = await iaDelChat(c, 'forzar');
    const estado = (await one(c.env, "SELECT estado FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? AND rol = 'assistant' ORDER BY ts DESC, id DESC LIMIT 1", c.businessId, ch.bandeja_id, ch.contacto))?.estado;
    await audit(c, `Pidió una respuesta de la IA en el chat de ${ch.nombre || ch.contacto} (${ch.bandeja})`, { modulo: MOD });
    return json({ ok: true, respuesta: texto, estado, enviado: estado === 'enviado' });
  });
  // Cancelar la cita agendada en este chat (Google Calendar avisa por correo a la persona)
  r.post(`${B}/chats/:id/cita/cancelar`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id); let cita = null; try { cita = ch.cita ? JSON.parse(ch.cita) : null; } catch { /* sin cita */ }
    if (!cita) throw new HttpError(400, 'Este chat no tiene una cita agendada');
    try { await cancelarCita(c.env, c.businessId, cita); } catch (e) { throw gerr(e); }
    await c.env.DB.prepare('UPDATE wa_conversaciones SET cita = NULL WHERE id = ? AND business_id = ?').bind(ch.id, c.businessId).run();
    await audit(c, `Canceló la cita del ${cita.etiqueta} en el chat de ${ch.nombre || ch.contacto}`, { modulo: MOD });
    return json({ ok: true });
  });
  // «Añadir a uno guardado»: este chat (p. ej. el de Instagram) pertenece a un contacto de Marketing que ya existe (p. ej. el que tiene WhatsApp). Se completa el contacto con lo que se sabe del chat.
  r.post(`${B}/chats/:id/enlazar`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id), body = await readJson(c.req);
    if (!(await marketingActivo(c.env, c.businessId))) throw new HttpError(400, 'Los contactos se guardan en Marketing: pídele a Diwilo que lo active para tu negocio');
    if (body.contact_id === null) { await c.env.DB.prepare('UPDATE wa_conversaciones SET contact_id = NULL WHERE id = ? AND business_id = ?').bind(ch.id, c.businessId).run(); return json({ ok: true, contact: null }); }
    const k = await contactoPorId(c.env, c.businessId, Number(body.contact_id));
    if (!k) throw new HttpError(404, 'Ese contacto no existe');
    const notas = ch.canal === 'whatsapp' || ch.canal === 'correo' ? null : `${CANALES[ch.canal]?.nombre || ch.canal}: ${ch.nombre || ch.contacto}`;
    await c.env.DB.prepare(`UPDATE mk_contacts SET phone = COALESCE(NULLIF(phone, ''), ?), email = COALESCE(NULLIF(email, ''), ?),
      notes = CASE WHEN ? IS NULL OR instr(COALESCE(notes, ''), ?) > 0 THEN notes ELSE COALESCE(notes || char(10), '') || ? END, updated_at = ? WHERE id = ? AND business_id = ?`)
      .bind(ch.canal === 'whatsapp' ? `+${soloDigitos(ch.contacto)}` : null, ch.canal === 'correo' ? ch.contacto : null, notas, notas, notas, now(), k.id, c.businessId).run();
    await c.env.DB.prepare('UPDATE wa_conversaciones SET contact_id = ?, nombre = COALESCE(nombre, ?) WHERE id = ? AND business_id = ?').bind(k.id, k.name, ch.id, c.businessId).run();
    await audit(c, `Enlazó el chat de ${ch.nombre || ch.contacto} (${ch.bandeja}) con el contacto ${k.name}`, { modulo: MOD });
    return json({ ok: true, contact: await contactoPorId(c.env, c.businessId, k.id) });
  });
  r.post(`${B}/chats/:id/contacto`, `tenant:${MOD}`, async (c) => {
    const ch = await chatDe(c, c.params.id), b = await bandejaDe(c, ch.bandeja_id), d = await readJson(c.req);
    if (!(await marketingActivo(c.env, c.businessId))) throw new HttpError(400, 'Los contactos se guardan en Marketing: pídele a Diwilo que lo active para tu negocio');
    const res = await guardarContacto(c.env, c.businessId, { bandeja: b, conv: ch, d, manual: true });
    if (!res) throw new HttpError(400, 'Faltan datos: el nombre y un teléfono o correo');
    const limpio = limpiarDatos(d);
    await c.env.DB.prepare('UPDATE wa_conversaciones SET contact_id = ?, datos = ?, nombre = COALESCE(?, nombre) WHERE id = ? AND business_id = ?').bind(res.id, JSON.stringify(limpio), limpio.nombre || null, ch.id, c.businessId).run();
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

  // Todos los mensajes de todos los canales, del más reciente al más antiguo (cada uno lleva el chat al que pertenece)
  r.get(`${B}/mensajes`, `tenant:${MOD}`, async (c) => {
    const sp = c.url.searchParams, donde = ['m.business_id = ?'], args = [c.businessId], q = (sp.get('q') || '').trim().slice(0, 60);
    if (sp.get('canal')) { donde.push('b.canal = ?'); args.push(sp.get('canal')); }
    if (sp.get('bandeja')) { donde.push('m.bandeja_id = ?'); args.push(Number(sp.get('bandeja'))); }
    if (q) { donde.push('(m.contenido LIKE ? OR m.contacto LIKE ? OR c.nombre LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const rows = await all(c.env, `SELECT m.id, m.ts, m.rol, m.contenido, m.estado, m.contacto, m.bandeja_id, b.nombre bandeja, b.canal, c.id chat_id, c.nombre, c.pais, c.dispositivo
      FROM wa_mensajes m JOIN wa_bandejas b ON b.id = m.bandeja_id LEFT JOIN wa_conversaciones c ON c.bandeja_id = m.bandeja_id AND c.contacto = m.contacto
      WHERE ${donde.join(' AND ')} ORDER BY m.ts DESC, m.id DESC LIMIT 200`, ...args);
    return json({ rows: rows.map(conLugar) });
  });

  /* Google: credenciales del cliente OAuth, conexión de la cuenta, horario de las citas */
  const gerr = (e) => (e instanceof GoogleError ? new HttpError(e.status === 500 ? 500 : 400, e.message) : e);
  const redirectDe = (c) => `${c.ctx?.origin || ''}/admin/api/google/callback`;
  const esDiwilo = (c) => c.businessId === 'diwilo:diwilo';   // las credenciales de la app de Google son de Diwilo: solo Diwilo las sube
  // Las personas del equipo con acceso (la app las entrega en el contexto): para elegir a quién pertenece cada número de administrador
  r.get(`${B}/admins/equipo`, `manager:${MOD}`, async (c) => json({ equipo: Array.isArray(c.ctx?.equipo) ? c.ctx.equipo.slice(0, 100).map((p) => ({ email: String(p.email || '').toLowerCase(), nombre: p.nombre || p.name || null, rol: p.rol || p.role || null })).filter((p) => p.email) : [] }));
  r.get(`${B}/google`, `tenant:${MOD}`, async (c) => { const g = await estadoGoogle(c.env, c.businessId); return json({ ...g, es_plataforma: esDiwilo(c), puede_conectar: g.credenciales, correos: (await one(c.env, "SELECT COUNT(*) n FROM wa_bandejas WHERE business_id = ? AND canal = 'correo'", c.businessId)).n }); });
  r.post(`${B}/google/credenciales`, `manager:${MOD}`, async (c) => {
    if (!esDiwilo(c)) throw new HttpError(403, 'Las credenciales de Google las administra Diwilo: tú solo vinculas tus cuentas');
    const body = await readJson(c.req);
    let r; try { r = await guardarCredenciales(c.env, leerCredenciales(body.json ?? { client_id: body.client_id, client_secret: body.client_secret })); } catch (e) { throw gerr(e); }
    await audit(c, 'Subió las credenciales de Google', { modulo: MOD });
    return json({ ok: true, cuentas_conservadas: !!r.cuentasConservadas });
  });
  r.post(`${B}/google/conectar`, `manager:${MOD}`, async (c) => {
    const body = await readJson(c.req).catch(() => ({}));
    try { return json({ url: await urlConexion(c.env, c.businessId, String(body.correo || '').trim()) }); } catch (e) { throw gerr(e); }
  });
  // Direcciones de correo de las cuentas vinculadas (cuenta y alias «Enviar como»): para crear bandejas de correo sin escribirlas a mano
  r.get(`${B}/google/direcciones`, `tenant:${MOD}`, async (c) => { try { return json({ cuentas: await listarDirecciones(c.env, c.businessId) }); } catch (e) { throw gerr(e); } });
  r.post(`${B}/google/desconectar`, `manager:${MOD}`, async (c) => {
    const body = await readJson(c.req).catch(() => ({}));
    await desconectar(c.env, c.businessId, body.cuenta || null); await audit(c, body.cuenta ? 'Quitó una cuenta de Google' : 'Desconectó Google', { modulo: MOD });
    return json({ ok: true });
  });
  // Qué cuenta envía y lee el correo y cuál agenda las citas con Meet
  r.put(`${B}/google/usos`, `manager:${MOD}`, async (c) => {
    const body = await readJson(c.req);
    try { await asignarUsos(c.env, c.businessId, { cuenta_gmail: body.cuenta_gmail, cuenta_calendario: body.cuenta_calendario }); } catch (e) { throw gerr(e); }
    await audit(c, 'Cambió las cuentas de Google que envían el correo y agendan las citas', { modulo: MOD });
    return json({ ok: true });
  });
  r.put(`${B}/google/agenda`, `manager:${MOD}`, async (c) => {
    const body = await readJson(c.req);
    await c.env.DB.prepare('INSERT OR IGNORE INTO wa_google (business_id, created_at, updated_at) VALUES (?, ?, ?)').bind(c.businessId, now(), now()).run();
    const agenda = normalizarAgenda(body.agenda || body);
    if (!agenda.dias.length) throw new HttpError(400, 'Elige al menos un día de atención');
    if (agenda.desde >= agenda.hasta) throw new HttpError(400, 'La hora de inicio debe ser antes que la de cierre');
    await c.env.DB.prepare('UPDATE wa_google SET agenda = ?, gmail_activo = COALESCE(?, gmail_activo), updated_at = ? WHERE business_id = ?').bind(JSON.stringify(agenda), typeof body.gmail_activo === 'boolean' ? (body.gmail_activo ? 1 : 0) : null, now(), c.businessId).run();
    await audit(c, 'Cambió el horario de las citas', { modulo: MOD });
    return json({ ok: true, agenda });
  });
  r.post(`${B}/google/probar`, `manager:${MOD}`, async (c) => {
    const body = await readJson(c.req).catch(() => ({}));
    if (!(await conectado(c.env, c.businessId)) && !(await conectado(c.env, c.businessId, 'calendario'))) throw new HttpError(400, 'Google no está conectado');
    const pasos = [], paso = async (nombre, f) => { try { pasos.push({ nombre, ok: true, detalle: await f() }); } catch (e) { pasos.push({ nombre, ok: false, detalle: e.message }); } };
    const cg = await cuentaPara(c.env, c.businessId, 'gmail'), cc = await cuentaPara(c.env, c.businessId, 'calendario');
    if (cg) await paso(`Gmail (${cg.email})`, async () => `Cuenta ${(await gapi(c.env, c.businessId, 'https://gmail.googleapis.com/gmail/v1/users/me/profile')).emailAddress}`);
    else pasos.push({ nombre: 'Gmail', ok: false, detalle: 'No hay una cuenta asignada al correo' });
    if (cc) {
      // Con los permisos pedidos (eventos y disponibilidad) se puede leer y crear eventos, no leer los datos del calendario en sí
      await paso(`Calendario (${cc.email})`, async () => { const e = await gapi(c.env, c.businessId, 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&singleEvents=true&orderBy=startTime&timeMin=' + encodeURIComponent(new Date().toISOString()), {}, 'calendario'); return `Puede leer y crear eventos${e.items?.[0]?.summary ? `. Próximo evento: ${e.items[0].summary}` : ' (no tienes eventos próximos)'}`; });
      await paso('Horarios libres', async () => { const h = await huecosLibres(c.env, c.businessId, { fresco: true }); return h.slots.length ? `${h.slots.length} horarios libres, el primero: ${h.slots[0].etiqueta}` : 'No hay horarios libres en el rango (revisa los días, el horario o el calendario)'; });
    } else pasos.push({ nombre: 'Calendario', ok: false, detalle: 'No hay una cuenta asignada al calendario' });
    // Correo de prueba: sale por Gmail, desde la dirección de la bandeja de correo si es un alias «Enviar como» verificado
    const para = String(body.para || '').trim();
    if (para) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) pasos.push({ nombre: 'Correo de prueba', ok: false, detalle: 'Escribe un correo válido' });
      else if (!cg) pasos.push({ nombre: 'Correo de prueba', ok: false, detalle: 'No hay una cuenta asignada al correo' });
      else await paso('Correo de prueba', async () => {
        const bandeja = (await one(c.env, "SELECT * FROM wa_bandejas WHERE business_id = ? AND canal = 'correo' AND activo = 1 ORDER BY id LIMIT 1", c.businessId)) || { business_id: c.businessId, phone_number_id: cg.email, nombre: 'Diwilo' };
        const r = await enviarGmail(c.env, bandeja, para, 'Hola 👋\n\nEste es un correo de prueba enviado desde Mensajes por la API de Gmail. Si lo lees, las respuestas por correo funcionan.', { asunto: 'Prueba de Mensajes' });
        return `Enviado a ${para} desde ${r.de}${r.alias ? ' (alias «Enviar como»: sale con la dirección de la bandeja)' : ` (la cuenta conectada; ${bandeja.phone_number_id} no está como alias verificado en Gmail)`}. Revisa tu bandeja y el correo «Enviados».`;
      });
    }
    return json({ ok: pasos.every((p) => p.ok), pasos });
  });

  /* contactos de Marketing y plantillas */
  r.get(`${B}/contactos`, `tenant:${MOD}`, async (c) => {
    if (!(await marketingActivo(c.env, c.businessId))) return json({ marketing: false, rows: [] });
    const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60), con = c.url.searchParams.get('con');   // email | todos | (teléfono)
    const filtro = con === 'todos' ? '' : con === 'email' ? "AND email IS NOT NULL AND email <> ''" : "AND phone IS NOT NULL AND phone <> ''";
    const rows = await all(c.env, `SELECT id, name, phone, email, company, stage, (SELECT group_concat(DISTINCT b.canal) FROM wa_conversaciones v JOIN wa_bandejas b ON b.id = v.bandeja_id WHERE v.contact_id = mk_contacts.id AND v.business_id = mk_contacts.business_id) canales
      FROM mk_contacts WHERE business_id = ? ${filtro} ${q ? 'AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR company LIKE ?)' : ''} ORDER BY updated_at DESC LIMIT 100`, ...(q ? [c.businessId, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [c.businessId]));
    return json({ marketing: true, rows: rows.map((r) => ({ ...r, canales: r.canales ? r.canales.split(',') : [] })) });
  });
  // Correo nuevo a contactos de Marketing (no es respuesta a un hilo): asunto y mensaje con {nombre} y {empresa}; cada persona queda como chat de la bandeja de correo
  r.post(`${B}/correo/enviar`, `tenant:${MOD}`, async (c) => {
    const body = await readJson(c.req), b = await bandejaDe(c, body.bandeja_id);
    if (b.canal !== 'correo' || !b.activo) throw new HttpError(400, 'Elige una bandeja de correo activa');
    const asunto = String(body.asunto || '').trim().slice(0, 200), mensaje = String(body.mensaje || '').trim();
    if (!asunto || !mensaje || mensaje.length > 8000) throw new HttpError(400, 'Escribe el asunto y el mensaje (máximo 8000 letras)');
    const ids = [...new Set((Array.isArray(body.contactos) ? body.contactos : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_ENVIO);
    if (!ids.length) throw new HttpError(400, 'Elige al menos un contacto con correo');
    const enviados = [], fallidos = [];
    for (const id of ids) {
      const k = await contactoPorId(c.env, c.businessId, id);
      if (!k?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.email)) { fallidos.push({ nombre: k?.name || `#${id}`, error: 'No tiene un correo válido' }); continue; }
      const para = k.email.toLowerCase(), primero = String(k.name || '').split(/\s+/)[0];
      const yo = (t) => String(t).replace(/\s*\{nombre\}/gi, primero ? ` ${primero}` : '').replace(/\{empresa\}/gi, k.company || '').trim();
      const texto = yo(mensaje), tema = yo(asunto);
      const { estado, error } = await enviarCorreo(c.env, b, para, texto, { asunto: tema, nuevo: true });
      if (estado !== 'enviado') { fallidos.push({ nombre: k.name, error: error || 'No se pudo enviar' }); continue; }
      const contenido = `Asunto: ${tema}\n\n${texto}`;
      await guardarMensaje(c.env, { org: c.businessId, bandeja: b.id, contacto: para, nombre: k.name, rol: 'humano', contenido, estado });
      const conv = await tocarChat(c.env, { org: c.businessId, bandeja: b, contacto: para, nombre: k.name, rol: 'humano', contenido, iaInicial: 0 });
      await c.env.DB.prepare('UPDATE wa_conversaciones SET asunto = ?, contact_id = COALESCE(contact_id, ?) WHERE id = ?').bind(tema, k.id, conv.id).run();
      enviados.push(para);
    }
    await audit(c, `Envió un correo a ${enviados.length} contacto${enviados.length === 1 ? '' : 's'} de Marketing${fallidos.length ? ` (${fallidos.length} con error)` : ''}`, { modulo: MOD });
    return json({ enviados: enviados.length, fallidos });
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
    if (!tpl || !tpl.soportada) throw new HttpError(400, tpl?.aviso || 'Esa plantilla no existe o no se puede enviar desde aquí (debe estar aprobada por Meta)');
    if (vars.length < tpl.variables) throw new HttpError(400, `La plantilla necesita ${tpl.variables} variable${tpl.variables === 1 ? '' : 's'}`);
    const enviados = [], fallidos = [];
    const bloqueados = new Set((await all(c.env, 'SELECT contacto FROM wa_conversaciones WHERE business_id = ? AND bandeja_id = ? AND bloqueado = 1', c.businessId, b.id)).map((x) => x.contacto));
    for (const [para, k] of dest) {
      if (bloqueados.has(para)) { fallidos.push({ para, nombre: k.nombre, error: 'Pidió no recibir más mensajes' }); continue; }
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

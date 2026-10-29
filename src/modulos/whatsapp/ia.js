// Herramientas de IA del módulo Mensajes (MCP del negocio). Nunca devuelven claves ni secretos.
import { api, chats, chatCompleto } from './api.js';
import { HttpError } from '../../lib/http.js';
import { AGENTE_EN, guardarMensaje, tocarChat } from './webhook.js';
import { enviarTexto } from './canales.js';
import { cancelarCita } from './google.js';
import { all, one } from '../../lib/crud.js';
import { guardarArchivo, listarArchivos } from './media.js';

const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });
const vista = ({ id, nombre, canal, telefono, activo, tiene_clave, webhook_url }) => ({ id, nombre, canal, telefono, activo: !!activo, tiene_clave, webhook_url });

export default [
  {
    name: 'whatsapp.ver_bandejas', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Las bandejas de mensajes del negocio (WhatsApp, Instagram, Messenger y webhooks): nombre, canal, si están activas, si tienen clave API y su URL de webhook, con sus agentes de IA.',
    inputSchema: S({}),
    run: async (c) => {
      const [bandejas, agentes] = await Promise.all([api.list(c, 'bandejas'), api.list(c, 'agentes')]);
      return { bandejas: bandejas.map((b) => ({ ...vista(b), agentes: agentes.filter((a) => !a.bandejas.length || a.bandejas.includes(b.id)).map(({ id, nombre }) => ({ id, nombre })) })) };
    },
  },
  {
    name: 'whatsapp.ver_conversaciones', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Los chats recientes, del más reciente al más antiguo, con su último mensaje, cuántos sin leer y si la IA está activa en cada uno. Filtra por bandeja_id o canal (whatsapp, instagram, messenger).',
    inputSchema: S({ bandeja_id: { type: 'number' }, canal: { type: 'string', enum: ['whatsapp', 'instagram', 'messenger', 'webhook'] } }),
    run: async (c, a) => ({ chats: (await chats(c, { bandeja: a.bandeja_id, canal: a.canal, limite: 50 })).map((x) => ({ ...x, ia_activa: !!x.ia_activa })) }),
  },
  {
    name: 'whatsapp.leer_conversacion', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Lee los mensajes de un chat (por su id, de ver_conversaciones) y el contacto de Marketing enlazado, si lo tiene.',
    inputSchema: S({ chat_id: { type: 'number' } }, ['chat_id']),
    run: async (c, a) => { const r = await chatCompleto(c, a.chat_id); return { chat: r.chat, mensajes: r.mensajes, contacto_marketing: r.contact, ventana_24h_abierta: r.ventana_abierta }; },
  },
  {
    name: 'whatsapp.resumen', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Resumen de Mensajes de las últimas 24 horas: chats nuevos por canal, mensajes recibidos y enviados, chats sin responder, chats que necesitan a una persona (en rojo) y citas agendadas.',
    inputSchema: S({}),
    run: async (c) => {
      const desde = Date.now() - 86400000, org = c.businessId;
      const [nuevos, mensajes, sinResponder, enRojo, citas] = await Promise.all([
        all(c.env, 'SELECT b.canal, COUNT(*) n FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id WHERE c.business_id = ? AND c.created_at > ? AND c.admin = 0 GROUP BY b.canal', org, desde),
        all(c.env, "SELECT rol, COUNT(*) n FROM wa_mensajes WHERE business_id = ? AND ts > ? AND contacto NOT IN (SELECT numero FROM wa_admins WHERE business_id = ?) GROUP BY rol", org, desde, org),
        all(c.env, "SELECT c.id, COALESCE(c.nombre, c.contacto) nombre, b.canal, c.ultimo_texto texto, c.ultimo_ts FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id WHERE c.business_id = ? AND c.admin = 0 AND c.ultimo_rol = 'user' ORDER BY c.ultimo_ts DESC LIMIT 8", org),
        all(c.env, "SELECT c.id, COALESCE(c.nombre, c.contacto) nombre, b.canal, c.atencion motivo FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id WHERE c.business_id = ? AND c.atencion IS NOT NULL ORDER BY c.atencion_ts DESC LIMIT 8", org),
        all(c.env, 'SELECT COALESCE(nombre, contacto) nombre, cita FROM wa_conversaciones WHERE business_id = ? AND cita IS NOT NULL ORDER BY ultimo_ts DESC LIMIT 8', org),
      ]);
      const por = (rol) => mensajes.find((m) => m.rol === rol)?.n || 0;
      return { ultimas_24h: { chats_nuevos: Object.fromEntries(nuevos.map((x) => [x.canal, x.n])), mensajes_de_clientes: por('user'), respuestas_de_la_ia: por('assistant'), respuestas_del_equipo: por('humano') },
        sin_responder: sinResponder.map((x) => ({ chat_id: x.id, nombre: x.nombre, canal: x.canal, ultimo_mensaje: String(x.texto || '').slice(0, 80) })),
        necesitan_a_una_persona: enRojo.map((x) => ({ chat_id: x.id, nombre: x.nombre, canal: x.canal, motivo: x.motivo === 'no_sabe' ? 'el agente no supo responder' : 'pidió un asesor' })),
        citas_agendadas: citas.map((x) => { let ct = null; try { ct = JSON.parse(x.cita); } catch { /* sin cita */ } return ct ? { nombre: x.nombre, cuando: ct.etiqueta } : null; }).filter(Boolean) };
    },
  },
  {
    name: 'whatsapp.enviar_mensaje', modulo: 'whatsapp', rol: 'staff', tipo: 'escritura',
    description: 'Envía un mensaje de texto de una persona del equipo a un chat (chat_id de ver_conversaciones), por su mismo canal. WhatsApp, Instagram y Messenger solo dejan responder dentro de las 24 h desde el último mensaje de la persona.',
    inputSchema: S({ chat_id: { type: 'number' }, texto: { type: 'string' } }, ['chat_id', 'texto']),
    run: async (c, a) => {
      const ch = await one(c.env, 'SELECT c.*, b.canal FROM wa_conversaciones c JOIN wa_bandejas b ON b.id = c.bandeja_id WHERE c.id = ? AND c.business_id = ?', Number(a.chat_id), c.businessId);
      if (!ch) throw new HttpError(404, 'No encontré ese chat');
      const b = await one(c.env, 'SELECT * FROM wa_bandejas WHERE id = ? AND business_id = ?', ch.bandeja_id, c.businessId), t = String(a.texto || '').trim().slice(0, 4000);
      if (!t || !b?.activo) throw new HttpError(400, 'Falta el texto o la bandeja está desactivada');
      const { estado, error } = await enviarTexto(c.env, b, ch.contacto, t, { rol: 'humano', asunto: ch.asunto, ref: ch.ref_correo, desde: ch.via_correo });
      await guardarMensaje(c.env, { org: c.businessId, bandeja: b.id, contacto: ch.contacto, rol: 'humano', contenido: t, estado });
      await tocarChat(c.env, { org: c.businessId, bandeja: b, contacto: ch.contacto, rol: 'humano', contenido: t });
      await c.env.DB.prepare('UPDATE wa_conversaciones SET ia_activa = 0, atencion = NULL, atencion_ts = NULL WHERE id = ?').bind(ch.id).run();
      if (estado !== 'enviado') throw new HttpError(502, `No se envió: ${error || estado}`);
      return { ok: true };
    },
  },
  {
    name: 'whatsapp.marcar_atendido', modulo: 'whatsapp', rol: 'staff', tipo: 'escritura',
    description: 'Quita la marca roja («necesita a una persona») de un chat.',
    inputSchema: S({ chat_id: { type: 'number' } }, ['chat_id']),
    run: async (c, a) => { const r = await c.env.DB.prepare('UPDATE wa_conversaciones SET atencion = NULL, atencion_ts = NULL WHERE id = ? AND business_id = ?').bind(Number(a.chat_id), c.businessId).run(); if (!r.meta.changes) throw new HttpError(404, 'No encontré ese chat'); return { ok: true }; },
  },
  {
    name: 'whatsapp.cancelar_cita', modulo: 'whatsapp', rol: 'staff', tipo: 'escritura',
    description: 'Cancela la cita de Google Meet agendada en un chat (Google avisa por correo a la persona).',
    inputSchema: S({ chat_id: { type: 'number' } }, ['chat_id']),
    run: async (c, a) => {
      const ch = await one(c.env, 'SELECT id, cita FROM wa_conversaciones WHERE id = ? AND business_id = ?', Number(a.chat_id), c.businessId);
      let cita = null; try { cita = ch?.cita ? JSON.parse(ch.cita) : null; } catch { /* sin cita */ }
      if (!cita) throw new HttpError(400, 'Ese chat no tiene una cita agendada');
      await cancelarCita(c.env, c.businessId, cita);
      await c.env.DB.prepare('UPDATE wa_conversaciones SET cita = NULL WHERE id = ?').bind(ch.id).run();
      return { ok: true, cancelada: cita.etiqueta };
    },
  },
  {
    name: 'whatsapp.cambiar_ia_del_chat', modulo: 'whatsapp', rol: 'staff', tipo: 'escritura',
    description: 'Enciende o apaga la IA en un chat concreto (apágala cuando una persona va a atender ese chat).',
    inputSchema: S({ chat_id: { type: 'number' }, ia_activa: { type: 'boolean' } }, ['chat_id', 'ia_activa']),
    run: async (c, a) => {
      const r = await c.env.DB.prepare('UPDATE wa_conversaciones SET ia_activa = ? WHERE id = ? AND business_id = ?').bind(a.ia_activa ? 1 : 0, Number(a.chat_id), c.businessId).run();
      if (!r.meta.changes) throw new HttpError(404, 'No encontré ese chat');
      return { ok: true, ia_activa: !!a.ia_activa };
    },
  },
  {
    name: 'whatsapp.asignar_agente_al_chat', modulo: 'whatsapp', rol: 'staff', tipo: 'escritura',
    description: 'Elige qué agente de IA atiende un chat (agente_id de ver_bandejas). Con agente_id 0 el chat queda sin agente.',
    inputSchema: S({ chat_id: { type: 'number' }, agente_id: { type: 'number' } }, ['chat_id', 'agente_id']),
    run: async (c, a) => {
      const ch = await c.env.DB.prepare('SELECT bandeja_id FROM wa_conversaciones WHERE id = ? AND business_id = ?').bind(Number(a.chat_id), c.businessId).first();
      if (!ch) throw new HttpError(404, 'No encontré ese chat');
      const id = Number(a.agente_id);
      if (id > 0 && !(await c.env.DB.prepare(`SELECT 1 FROM wa_agentes WHERE id = ? AND business_id = ? AND ${AGENTE_EN}`).bind(id, c.businessId, ch.bandeja_id).first())) throw new HttpError(400, 'Ese agente no está disponible para la bandeja del chat');
      await c.env.DB.prepare('UPDATE wa_conversaciones SET agente_id = ? WHERE id = ? AND business_id = ?').bind(Math.max(0, id), Number(a.chat_id), c.businessId).run();
      return { ok: true, agente_id: Math.max(0, id) };
    },
  },
  {
    name: 'whatsapp.crear_agente', modulo: 'whatsapp', rol: 'admin', tipo: 'escritura',
    description: 'Crea un agente de IA (que sirve en las bandejas de `bandejas`, o en todas si va vacía). Pide los datos de contacto indicados en `pedir` (correo, telefono, empresa, tipo, ciudad, interes) y los guarda en Marketing.',
    inputSchema: S({ bandejas: { type: 'array', items: { type: 'number' }, description: 'Ids de las bandejas donde sirve; vacío = todas' }, nombre: { type: 'string' }, instrucciones: { type: 'string', description: 'Qué sabe y cómo responde (máx. 4000 letras)' }, pedir: { type: 'array', items: { type: 'string' }, description: 'Datos de contacto que pide además del nombre' } }, ['nombre']),
    run: async (c, a) => ({ creado: await api.create(c, 'agentes', { bandejas: JSON.stringify(Array.isArray(a.bandejas) ? a.bandejas.map(Number) : []), nombre: a.nombre, instrucciones: a.instrucciones, campos: JSON.stringify({ campos: Array.isArray(a.pedir) ? a.pedir : ['correo'], extras: [] }) }) }),
  },
  {
    name: 'whatsapp.guardar_archivo', modulo: 'whatsapp', rol: 'admin', tipo: 'escritura',
    description: 'Guarda en la biblioteca de Mensajes («Archivos») una foto, video, audio o documento que llegó en un chat (por el id del mensaje, de leer_conversacion). Con contact_id lo deja también anotado en ese contacto de Marketing.',
    inputSchema: S({ mensaje_id: { type: 'number' }, nombre: { type: 'string', description: 'Nombre para el archivo (opcional)' }, contact_id: { type: 'number', description: 'Contacto de Marketing al que se adjunta (opcional)' } }, ['mensaje_id']),
    run: async (c, a) => ({ guardado: await guardarArchivo(c.env, c.businessId, { mensajeId: a.mensaje_id, nombre: a.nombre, contactId: a.contact_id, por: c.session?.email || 'asistente' }) }),
  },
  {
    name: 'whatsapp.ver_archivos', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Los archivos guardados en la biblioteca de Mensajes (nombre, tipo, contacto, y lo que la IA entendió de ellos).',
    inputSchema: S({}),
    run: async (c) => ({ archivos: await listarArchivos(c.env, c.businessId) }),
  },
];

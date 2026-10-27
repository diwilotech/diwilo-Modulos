// Herramientas de IA del módulo Mensajes (MCP del negocio). Nunca devuelven claves ni secretos.
import { api, chats, chatCompleto } from './api.js';
import { HttpError } from '../../lib/http.js';

const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });
const vista = ({ id, nombre, canal, telefono, activo, tiene_clave, webhook_url }) => ({ id, nombre, canal, telefono, activo: !!activo, tiene_clave, webhook_url });

export default [
  {
    name: 'whatsapp.ver_bandejas', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Las bandejas de mensajes del negocio (WhatsApp, Instagram, Messenger y webhooks): nombre, canal, si están activas, si tienen clave API y su URL de webhook, con sus agentes de IA.',
    inputSchema: S({}),
    run: async (c) => {
      const [bandejas, agentes] = await Promise.all([api.list(c, 'bandejas'), api.list(c, 'agentes')]);
      return { bandejas: bandejas.map((b) => ({ ...vista(b), agentes: agentes.filter((a) => a.bandeja_id === b.id || a.bandeja_id === 0).map(({ id, nombre }) => ({ id, nombre })) })) };
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
      if (id > 0 && !(await c.env.DB.prepare('SELECT 1 FROM wa_agentes WHERE id = ? AND business_id = ? AND (bandeja_id = ? OR bandeja_id = 0)').bind(id, c.businessId, ch.bandeja_id).first())) throw new HttpError(400, 'Ese agente no está disponible para la bandeja del chat');
      await c.env.DB.prepare('UPDATE wa_conversaciones SET agente_id = ? WHERE id = ? AND business_id = ?').bind(Math.max(0, id), Number(a.chat_id), c.businessId).run();
      return { ok: true, agente_id: Math.max(0, id) };
    },
  },
  {
    name: 'whatsapp.crear_agente', modulo: 'whatsapp', rol: 'admin', tipo: 'escritura',
    description: 'Crea un agente de IA (de una bandeja, o de todas con bandeja_id 0). Pide los datos de contacto indicados en `pedir` (correo, telefono, empresa, tipo, ciudad, interes) y los guarda en Marketing.',
    inputSchema: S({ bandeja_id: { type: 'number', description: '0 = todas las bandejas' }, nombre: { type: 'string' }, instrucciones: { type: 'string', description: 'Qué sabe y cómo responde (máx. 4000 letras)' }, pedir: { type: 'array', items: { type: 'string' }, description: 'Datos de contacto que pide además del nombre' } }, ['bandeja_id', 'nombre']),
    run: async (c, a) => ({ creado: await api.create(c, 'agentes', { bandeja_id: Number(a.bandeja_id), nombre: a.nombre, instrucciones: a.instrucciones, campos: JSON.stringify({ campos: Array.isArray(a.pedir) ? a.pedir : ['correo'], extras: [] }) }) }),
  },
];

// Herramientas de IA del módulo Mensajes (MCP del negocio). Nunca devuelven claves ni secretos.
import { api, chats, chatCompleto } from './api.js';
import { HttpError } from '../../lib/http.js';

const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });
const vista = ({ id, nombre, canal, telefono, activo, tiene_clave, webhook_url }) => ({ id, nombre, canal, telefono, activo: !!activo, tiene_clave, webhook_url });

export default [
  {
    name: 'whatsapp.ver_bandejas', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Las bandejas de mensajes del negocio (WhatsApp, Instagram y Messenger): nombre, canal, si están activas, si tienen clave API y su URL de webhook, con sus agentes de IA.',
    inputSchema: S({}),
    run: async (c) => {
      const [bandejas, agentes] = await Promise.all([api.list(c, 'bandejas'), api.list(c, 'agentes')]);
      return { bandejas: bandejas.map((b) => ({ ...vista(b), agentes: agentes.filter((a) => a.bandeja_id === b.id).map(({ id, nombre, activo }) => ({ id, nombre, activo: !!activo })) })) };
    },
  },
  {
    name: 'whatsapp.ver_conversaciones', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Los chats recientes, del más reciente al más antiguo, con su último mensaje, cuántos sin leer y si la IA está activa en cada uno. Filtra por bandeja_id o canal (whatsapp, instagram, messenger).',
    inputSchema: S({ bandeja_id: { type: 'number' }, canal: { type: 'string', enum: ['whatsapp', 'instagram', 'messenger'] } }),
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
    name: 'whatsapp.activar_agente', modulo: 'whatsapp', rol: 'admin', tipo: 'escritura',
    description: 'Activa o desactiva un agente de IA de una bandeja. Solo un agente por bandeja responde: al activar uno se apagan los demás de esa bandeja.',
    inputSchema: S({ agente_id: { type: 'number' }, activo: { type: 'boolean' } }, ['agente_id', 'activo']),
    run: async (c, a) => { await api.update(c, 'agentes', Number(a.agente_id), { activo: !!a.activo }); return { ok: true, activo: !!a.activo }; },
  },
  {
    name: 'whatsapp.crear_agente', modulo: 'whatsapp', rol: 'admin', tipo: 'escritura',
    description: 'Crea un agente de IA para una bandeja (queda activo y apaga el que hubiera). Pide los datos de contacto de quien quiera compra y los guarda en Marketing.',
    inputSchema: S({ bandeja_id: { type: 'number' }, nombre: { type: 'string' }, instrucciones: { type: 'string', description: 'Qué sabe y cómo responde (máx. 4000 letras)' } }, ['bandeja_id', 'nombre']),
    run: async (c, a) => ({ creado: await api.create(c, 'agentes', { bandeja_id: Number(a.bandeja_id), nombre: a.nombre, instrucciones: a.instrucciones, activo: true }) }),
  },
];

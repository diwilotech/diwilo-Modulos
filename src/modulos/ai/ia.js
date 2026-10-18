// Herramientas de IA del módulo IA (MCP del negocio): ver los chats y sus conversaciones, el consumo y crear un chat.
import { crud, all, one } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { usoDelDia, TOPE_DIA, dayCo } from '../../lib/ia.js';
import { ENTITIES } from './api.js';

const api = crud({ get() {}, post() {}, patch() {}, delete() {} }, { base: '/ia/ia', modulo: 'ai', entities: ENTITIES });
const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });

export default [
  {
    name: 'ai.ver_chats', modulo: 'ai', rol: 'staff', tipo: 'lectura',
    description: 'Los chats de clientes del negocio (nombre, si está activo, su dirección /chat/<slug> y cuántas conversaciones tiene).',
    inputSchema: S({}),
    run: async (c) => ({ chats: (await api.list(c, 'chats')).map(({ id, nombre, activo, ruta, conversaciones, ultima }) => ({ id, nombre, activo: !!activo, ruta, conversaciones, ultima })) }),
  },
  {
    name: 'ai.ver_conversaciones', modulo: 'ai', rol: 'staff', tipo: 'lectura',
    description: 'Las conversaciones más recientes de los chats de clientes, con el primer mensaje de cada una.',
    inputSchema: S({ chat_id: { type: 'number' }, limite: { type: 'number', description: 'Máximo 50' } }),
    run: async (c, a) => ({ conversaciones: await all(c.env, `SELECT v.id, ch.nombre chat, v.last_at, v.msg_count, v.lead_id, (SELECT contenido FROM ia_mensajes m WHERE m.conversacion_id = v.id AND m.rol = 'user' ORDER BY ts LIMIT 1) primero
      FROM ia_conversaciones v JOIN ia_chats ch ON ch.id = v.chat_id WHERE v.business_id = ? ${a.chat_id ? 'AND v.chat_id = ?' : ''} ORDER BY v.last_at DESC LIMIT ${Math.min(50, Number(a.limite) || 20)}`, ...(a.chat_id ? [c.businessId, Number(a.chat_id)] : [c.businessId])) }),
  },
  {
    name: 'ai.leer_conversacion', modulo: 'ai', rol: 'staff', tipo: 'lectura',
    description: 'Lee los mensajes de una conversación de un chat de clientes.',
    inputSchema: S({ id: { type: 'string' } }, ['id']),
    run: async (c, a) => {
      const v = await one(c.env, 'SELECT id, started_at, msg_count, lead_id FROM ia_conversaciones WHERE id = ? AND business_id = ?', String(a.id), c.businessId);
      if (!v) throw new Error('No encontré esa conversación');
      return { conversacion: v, mensajes: await all(c.env, 'SELECT rol, contenido, ts FROM ia_mensajes WHERE conversacion_id = ? AND business_id = ? ORDER BY ts, id', v.id, c.businessId) };
    },
  },
  {
    name: 'ai.resumen_uso', modulo: 'ai', rol: 'staff', tipo: 'lectura',
    description: 'Consumo de IA del negocio hoy y su tope diario.',
    inputSchema: S({}),
    run: async (c) => { const h = await usoDelDia(c.env, c.businessId); return { dia: dayCo(), llamadas_hoy: h.n, tope_dia: TOPE_DIA, restantes: Math.max(0, TOPE_DIA - h.n) }; },
  },
  {
    name: 'ai.crear_chat', modulo: 'ai', rol: 'admin', tipo: 'escritura',
    description: 'Crea un chat de clientes con IA (queda activo y con su dirección /chat/<slug>).',
    inputSchema: S({ nombre: { type: 'string' }, saludo: { type: 'string' }, instrucciones: { type: 'string', description: 'Qué sabe y cómo responde' }, whatsapp: { type: 'string' } }, ['nombre']),
    run: async (c, a) => {
      const r = await api.create(c, 'chats', { nombre: a.nombre, saludo: a.saludo, instrucciones: a.instrucciones, whatsapp: a.whatsapp, activo: true });
      await audit(c, `Creó el chat «${String(a.nombre).slice(0, 60)}»`, { modulo: 'ai', origen: c.origin });
      return r;
    },
  },
];

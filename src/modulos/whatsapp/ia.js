// Herramientas de IA del módulo WhatsApp (MCP del negocio). Nunca devuelven claves ni secretos.
import { api, conversaciones, mensajesDe } from './api.js';

const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });
const vista = ({ id, nombre, telefono, activo, tiene_clave, webhook_url }) => ({ id, nombre, telefono, activo: !!activo, tiene_clave, webhook_url });

export default [
  {
    name: 'whatsapp.ver_bandejas', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Las bandejas de WhatsApp del negocio (nombre, teléfono, si están activas, si tienen clave API y su URL de webhook) con sus agentes de IA.',
    inputSchema: S({}),
    run: async (c) => {
      const [bandejas, agentes] = await Promise.all([api.list(c, 'bandejas'), api.list(c, 'agentes')]);
      return { bandejas: bandejas.map((b) => ({ ...vista(b), agentes: agentes.filter((a) => a.bandeja_id === b.id).map(({ id, nombre, activo }) => ({ id, nombre, activo: !!activo })) })) };
    },
  },
  {
    name: 'whatsapp.ver_conversaciones', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Los contactos que han escrito por WhatsApp, del más reciente al más antiguo, con su último mensaje. Filtra por bandeja con bandeja_id.',
    inputSchema: S({ bandeja_id: { type: 'number' } }),
    run: async (c, a) => ({ conversaciones: await conversaciones(c, a.bandeja_id) }),
  },
  {
    name: 'whatsapp.leer_conversacion', modulo: 'whatsapp', rol: 'staff', tipo: 'lectura',
    description: 'Lee los mensajes de un contacto de WhatsApp en una bandeja.',
    inputSchema: S({ bandeja_id: { type: 'number' }, contacto: { type: 'string', description: 'Número del contacto, solo dígitos' } }, ['bandeja_id', 'contacto']),
    run: async (c, a) => { await api.get(c, 'bandejas', Number(a.bandeja_id)); return { mensajes: await mensajesDe(c, a.bandeja_id, a.contacto) }; },
  },
  {
    name: 'whatsapp.activar_agente', modulo: 'whatsapp', rol: 'admin', tipo: 'escritura',
    description: 'Activa o desactiva un agente de IA de una bandeja. Solo un agente por bandeja responde: al activar uno se apagan los demás de esa bandeja.',
    inputSchema: S({ agente_id: { type: 'number' }, activo: { type: 'boolean' } }, ['agente_id', 'activo']),
    run: async (c, a) => { await api.update(c, 'agentes', Number(a.agente_id), { activo: !!a.activo }); return { ok: true, activo: !!a.activo }; },
  },
  {
    name: 'whatsapp.crear_agente', modulo: 'whatsapp', rol: 'admin', tipo: 'escritura',
    description: 'Crea un agente de IA para una bandeja de WhatsApp (queda activo y apaga el que hubiera).',
    inputSchema: S({ bandeja_id: { type: 'number' }, nombre: { type: 'string' }, instrucciones: { type: 'string', description: 'Qué sabe y cómo responde (máx. 4000 letras)' } }, ['bandeja_id', 'nombre']),
    run: async (c, a) => ({ creado: await api.create(c, 'agentes', { bandeja_id: Number(a.bandeja_id), nombre: a.nombre, instrucciones: a.instrucciones, activo: true }) }),
  },
];

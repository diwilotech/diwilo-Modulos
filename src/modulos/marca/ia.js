// Herramientas de IA del módulo Marca e IA (MCP del negocio). Siempre sobre c.businessId y con las reglas de la API.
import { saveMarca, guia, ENTITIES } from './api.js';
import { crud } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { TONOS, CANALES, kitOf } from '../../lib/marca.js';

const plantillas = crud({ get() {}, post() {}, patch() {}, delete() {} }, { base: '/ia/marca', modulo: 'marca', entities: ENTITIES });
const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });

export default [
  {
    name: 'marca.guia_de_marca', modulo: 'marca', rol: 'staff', tipo: 'lectura',
    description: 'La guía de marca del negocio: su tono de conversación, su color y tipografía y las plantillas activas para asistentes externos. Léela ANTES de redactar mensajes, correos o publicaciones para sus clientes y síguela.',
    inputSchema: S({}),
    run: (c) => guia(c),
  },
  {
    name: 'marca.kit_de_marca', modulo: 'marca', rol: 'staff', tipo: 'lectura',
    description: 'El kit de marca completo para construir algo que se vea y hable como el negocio (una página web, otra app, un chat o un agente): color, CSS con variables, tipografía (con su link de Google Fonts), tono y los prompts listos para el chat, el asistente externo y los agentes. Úsalo ANTES de crear una web, una landing o una automatización.',
    inputSchema: S({}),
    run: (c) => kitOf(c.env, c.businessId, c.ctx?.business?.name || null),
  },
  {
    name: 'marca.cambiar_tono', modulo: 'marca', rol: 'admin', tipo: 'escritura',
    description: 'Cambia el tono de conversación del negocio y, si se pide, sus indicaciones propias (máx. 500 letras).',
    inputSchema: S({ tono: { type: 'string', enum: Object.keys(TONOS) }, notas: { type: 'string', description: 'Indicaciones propias, p. ej. «Siempre despídete con “Un abrazo”»' } }, ['tono']),
    run: async (c, a) => {
      const m = await saveMarca(c, { tono: a.tono, ...(a.notas !== undefined ? { tono_notas: a.notas } : {}) });
      return { tono: m.tono, notas: m.tono_notas || null };
    },
  },
  {
    name: 'marca.cambiar_identidad', modulo: 'marca', rol: 'admin', tipo: 'escritura',
    description: 'Cambia la descripción de lo que hace el negocio (máx. 600 letras) y/o su lema (máx. 80). La lee el chat y los asistentes al hablar con los clientes.',
    inputSchema: S({ descripcion: { type: 'string', description: 'Qué hace el negocio, en pocas frases' }, lema: { type: 'string', description: 'Frase corta de la marca' } }),
    run: async (c, a) => {
      const m = await saveMarca(c, { ...(a.descripcion !== undefined ? { descripcion: a.descripcion } : {}), ...(a.lema !== undefined ? { lema: a.lema } : {}) });
      return { descripcion: m.descripcion || null, lema: m.lema || null };
    },
  },
  {
    name: 'marca.crear_plantilla', modulo: 'marca', rol: 'admin', tipo: 'escritura',
    description: 'Crea una plantilla de instrucciones para la IA del negocio: canal «chat» (el asistente de la app), «mcp» (asistentes externos) o «agente» (automatizaciones y agentes de IA).',
    inputSchema: S({ nombre: { type: 'string' }, canal: { type: 'string', enum: CANALES }, instrucciones: { type: 'string', description: 'Máx. 2000 letras' } }, ['nombre', 'canal', 'instrucciones']),
    run: async (c, a) => {
      const r = await plantillas.create(c, 'plantillas', { nombre: a.nombre, canal: a.canal, instrucciones: a.instrucciones, activa: true });
      await audit(c, `Creó la plantilla de IA «${String(a.nombre).slice(0, 60)}»`, { modulo: 'marca', origen: c.origin });
      return r;
    },
  },
];

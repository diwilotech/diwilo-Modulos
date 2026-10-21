// Herramientas de IA del módulo Marketing (MCP del negocio): las mismas de IA Diwilo para Marketing.
// Siempre trabajan sobre c.businessId y con las reglas de la API (validación, referencias del mismo negocio y bitácora).
import { marketingSummary, ENTITIES, checkList, reportData, saveReport } from './api.js';
import { crud, today, all, one } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { Router } from '../../router.js';
import control from './control.js';

const api = crud(new Router(), { base: '/ia/marketing', modulo: 'marketing', entities: ENTITIES });
const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });
const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });

async function findList(c, ref) {
  const l = /^\d+$/.test(String(ref)) ? await one(c.env, 'SELECT * FROM mk_lists WHERE id = ? AND business_id = ?', Number(ref), c.businessId)
    : await one(c.env, 'SELECT * FROM mk_lists WHERE business_id = ? AND lower(name) LIKE ? ORDER BY length(name) LIMIT 1', c.businessId, `%${String(ref || '').toLowerCase()}%`);
  if (!l) throw new Error('No encontré esa lista (mira marketing_ver_listas)');
  return l;
}

export default [
  /* ---------- lectura ---------- */
  {
    name: 'marketing.resumen', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Resumen de marketing de los últimos 30 días (o del periodo): leads, clientes, embudo, campañas con gasto, clics, costo por lead y retorno, tareas.',
    inputSchema: S({ desde: str('AAAA-MM-DD'), hasta: str('AAAA-MM-DD') }),
    run: (c, a) => marketingSummary(c, a.desde, a.hasta),
  },
  {
    name: 'marketing.buscar_contactos', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Busca clientes y leads por nombre, correo, empresa o teléfono (y opcionalmente por etapa).',
    inputSchema: S({ texto: str(), etapa: { type: 'string', enum: ['lead', 'cliente', 'perdido'] } }),
    run: async (c, a) => ({ contactos: await api.list(c, 'contacts', new URLSearchParams({ q: a.texto || '', ...(a.etapa ? { f_stage: a.etapa } : {}), limit: '50' })) }),
  },
  {
    name: 'marketing.tareas_pendientes', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Tareas de marketing pendientes, de la más urgente a la menos.',
    inputSchema: S({}),
    run: async (c) => ({ tareas: await api.list(c, 'tasks', new URLSearchParams({ f_done: '0', limit: '50' })) }),
  },
  {
    name: 'marketing.ver_listas', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Listas de Marketing (competidores, fuentes, temas, tendencias, prospectos…) con cuántos elementos tiene cada una.',
    inputSchema: S({}),
    run: async (c) => ({ listas: await all(c.env, `SELECT l.id, l.name nombre, l.kind tipo, l.description descripcion, COUNT(i.id) elementos FROM mk_lists l
      LEFT JOIN mk_list_items i ON i.list_id = l.id AND i.business_id = l.business_id AND i.status <> 'descartado' WHERE l.business_id = ? GROUP BY l.id ORDER BY l.name`, c.businessId) }),
  },
  {
    name: 'marketing.leer_lista', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Elementos de una lista (por id o nombre): título, sitio, feed, notas y, si se revisó, sus últimas publicaciones.',
    inputSchema: S({ lista: str('Id o nombre de la lista') }, ['lista']),
    run: async (c, a) => {
      const l = await findList(c, a.lista);
      const items = await all(c.env, "SELECT id, title, url, feed_url, notes, status, score, data, last_checked_at FROM mk_list_items WHERE business_id = ? AND list_id = ? AND status <> 'descartado' ORDER BY updated_at DESC LIMIT 60", c.businessId, l.id);
      return { lista: l.name, tipo: l.kind, elementos: items.map(({ data, ...i }) => ({ ...i, ultimas: data ? JSON.parse(data).ultimas : undefined })) };
    },
  },
  {
    name: 'marketing.ver_automatizaciones', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Automatizaciones de marketing (reglas sin IA: cuando pasa X, crear tareas u oportunidades) con sus pasos.',
    inputSchema: S({}),
    run: async (c) => ({ automatizaciones: await all(c.env, 'SELECT id, name nombre, trigger cuando, action entonces, days dias, percent porcentaje, task_title pasos, active activa, runs ejecuciones FROM mk_automations WHERE business_id = ? ORDER BY created_at DESC', c.businessId) }),
  },
  {
    name: 'marketing.datos_informe', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Datos del periodo y la instrucción del analista para escribir el informe de marketing. Escríbelo con esto y guárdalo con marketing_guardar_informe.',
    inputSchema: S({ desde: str('AAAA-MM-DD'), hasta: str('AAAA-MM-DD') }),
    run: (c, a) => reportData(c, a.desde, a.hasta),
  },
  {
    name: 'marketing.ver_informes', modulo: 'marketing', rol: 'staff', tipo: 'lectura',
    description: 'Informes de marketing guardados (los más recientes primero).',
    inputSchema: S({}),
    run: async (c) => ({ informes: await all(c.env, 'SELECT id, title titulo, content contenido, origen, created_at FROM mk_reports WHERE business_id = ? ORDER BY created_at DESC LIMIT 10', c.businessId) }),
  },
  /* ---------- acciones ---------- */
  {
    name: 'marketing.revisar_lista', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Revisa los sitios o blogs de una lista (por ejemplo «Competidores»): lee sus feeds y trae sus últimas publicaciones. Guarda lo encontrado en la lista.',
    inputSchema: S({ lista: str('Id o nombre de la lista') }, ['lista']),
    run: async (c, a) => checkList(c, (await findList(c, a.lista)).id),
  },
  {
    name: 'marketing.crear_lista', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Crea una lista (por ejemplo «Competidores», «Fuentes de tendencias», «Temas para redes»). No crea una que ya exista con ese nombre.',
    inputSchema: S({ nombre: str(), tipo: { type: 'string', enum: ['competidores', 'fuentes', 'temas', 'tendencias', 'prospectos', 'otra'] }, descripcion: str() }, ['nombre']),
    run: async (c, a) => {
      const dup = await one(c.env, 'SELECT id FROM mk_lists WHERE business_id = ? AND lower(trim(name)) = lower(trim(?))', c.businessId, String(a.nombre));
      if (dup) return { ya_existia: dup.id };
      return api.create(c, 'lists', { name: a.nombre, kind: a.tipo || 'otra', description: a.descripcion });
    },
  },
  {
    name: 'marketing.agregar_a_lista', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Agrega un elemento a una lista (un competidor con su sitio, una fuente, un tema). No repite elementos con la misma dirección o título.',
    inputSchema: S({ lista: str('Id o nombre'), titulo: str(), url: str('https://…'), feed: str('https://… (RSS)'), notas: str(), puntaje: { type: 'number' } }, ['lista', 'titulo']),
    run: async (c, a) => {
      const l = await findList(c, a.lista);
      const dup = await one(c.env, 'SELECT id FROM mk_list_items WHERE business_id = ? AND list_id = ? AND (lower(title) = lower(?) OR (url IS NOT NULL AND url = ?))', c.businessId, l.id, String(a.titulo), a.url || '');
      if (dup) return { ya_existia: dup.id, nota: 'Ese elemento ya estaba en la lista.' };
      return api.create(c, 'list_items', { list_id: l.id, title: a.titulo, url: a.url, feed_url: a.feed, notes: a.notas, score: a.puntaje });
    },
  },
  {
    name: 'marketing.crear_contacto', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Crea un cliente o lead. Si es un lead nuevo, se disparan las automatizaciones de «lead nuevo».',
    inputSchema: S({ nombre: str(), telefono: str(), correo: str(), empresa: str(), etapa: { type: 'string', enum: ['lead', 'cliente', 'perdido'] }, origen: str(), notas: str() }, ['nombre']),
    run: async (c, a) => ({ creado: await api.create(c, 'contacts', { name: a.nombre, phone: a.telefono, email: a.correo, company: a.empresa, stage: a.etapa || 'lead', source: a.origen, notes: a.notas }) }),
  },
  {
    name: 'marketing.cambiar_etapa_contacto', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Cambia la etapa de un contacto (lead, cliente o perdido) y/o registra que se contactó hoy.',
    inputSchema: S({ id: { type: 'number' }, etapa: { type: 'string', enum: ['lead', 'cliente', 'perdido'] }, contactado_hoy: { type: 'boolean' } }, ['id']),
    run: (c, a) => api.update(c, 'contacts', Number(a.id), { ...(a.etapa ? { stage: a.etapa } : {}), ...(a.contactado_hoy ? { last_contact_at: today() } : {}) }),
  },
  {
    name: 'marketing.crear_tarea', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Crea una tarea de marketing (por ejemplo, llamar a un lead). No crea otra si ya hay una pendiente igual.',
    inputSchema: S({ titulo: str(), para: str('AAAA-MM-DD (por defecto hoy)'), responsable: str(), contacto_id: { type: 'number' } }, ['titulo']),
    run: async (c, a) => {
      const dup = await one(c.env, 'SELECT id FROM mk_tasks WHERE business_id = ? AND done = 0 AND lower(trim(title)) = lower(trim(?))', c.businessId, String(a.titulo));
      if (dup) return { ya_existia: dup.id, nota: 'Ya había una tarea pendiente igual.' };
      return { creada: await api.create(c, 'tasks', { title: a.titulo, due_date: a.para || today(), assignee: a.responsable, contact_id: a.contacto_id }) };
    },
  },
  {
    name: 'marketing.marcar_tarea_hecha', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Marca una tarea como hecha.',
    inputSchema: S({ id: { type: 'number' } }, ['id']),
    run: (c, a) => api.update(c, 'tasks', Number(a.id), { done: true }),
  },
  {
    name: 'marketing.crear_campana', modulo: 'marketing', rol: 'admin', tipo: 'escritura',
    description: 'Crea una campaña de marketing.',
    inputSchema: S({ nombre: str(), canal: { type: 'string', enum: ['meta_ads', 'google_ads', 'whatsapp', 'correo', 'organico', 'otro'] }, presupuesto: { type: 'number' }, inicio: str('AAAA-MM-DD'), fin: str('AAAA-MM-DD') }, ['nombre']),
    run: (c, a) => api.create(c, 'campaigns', { name: a.nombre, channel: a.canal, budget: a.presupuesto, start_date: a.inicio || today(), end_date: a.fin }),
  },
  {
    name: 'marketing.crear_automatizacion', modulo: 'marketing', rol: 'admin', tipo: 'escritura',
    description: 'Crea una automatización (regla sin IA). Cuando: lead_nuevo, sin_contacto (N días), presupuesto_campana (X%), factura_vencida o semanal. Entonces: crear_tarea (con varios pasos), crear_oportunidad o informe_ia.',
    inputSchema: S({ nombre: str(), cuando: { type: 'string', enum: ['lead_nuevo', 'sin_contacto', 'presupuesto_campana', 'factura_vencida', 'semanal'] },
      entonces: { type: 'string', enum: ['crear_tarea', 'crear_oportunidad', 'informe_ia'] },
      pasos: { type: 'array', items: { type: 'object', properties: { t: str('Título; puede usar {nombre}'), d: { type: 'number', description: 'Días después' } }, required: ['t'] } },
      dias: { type: 'number' }, porcentaje: { type: 'number' } }, ['nombre', 'cuando', 'entonces']),
    run: (c, a) => api.create(c, 'automations', { name: a.nombre, trigger: a.cuando, action: a.entonces, days: a.dias, percent: a.porcentaje,
      task_title: Array.isArray(a.pasos) && a.pasos.length ? JSON.stringify(a.pasos.map((x) => ({ t: String(x.t || ''), d: Number(x.d) || 0 })).filter((x) => x.t)) : '', active: true }),
  },
  {
    name: 'marketing.guardar_informe', modulo: 'marketing', rol: 'staff', tipo: 'escritura',
    description: 'Guarda en Marketing → Informes el informe que escribiste con marketing_datos_informe.',
    inputSchema: S({ titulo: str(), contenido: str('Texto del informe (puede tener viñetas)') }, ['contenido']),
    run: async (c, a) => {
      const r = await saveReport(c.env, c.businessId, { title: a.titulo || `Marketing · ${today()}`, content: a.contenido, origen: 'ia', by: c.session?.user_id });
      await audit(c, 'Guardó un informe de marketing', { modulo: 'marketing', origen: c.origin });
      return r;
    },
  },
  ...control,
];

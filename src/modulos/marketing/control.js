// Control total de Marketing por IA: editar y borrar, oportunidades, gasto de campañas, links de rastreo, herramientas, listas y tarjetas.
// Llaman a las MISMAS rutas de la API (src/lib/interno.js): mismas reglas, roles y bitácora.
import { herramienta as H, crudHerramientas as CRUD } from '../../lib/interno.js';

const id = (d) => ({ type: 'integer', ...(d ? { description: d } : {}) });
const txt = (d) => ({ type: 'string', ...(d ? { description: d } : {}) });
const num = (d) => ({ type: 'number', ...(d ? { description: d } : {}) });
const bool = (d) => ({ type: 'boolean', ...(d ? { description: d } : {}) });
const fecha = (d = 'AAAA-MM-DD') => txt(d);
const ETAPA = { type: 'string', enum: ['lead', 'cliente', 'perdido'] };

export default [
  // Contactos, tareas, listas y automatizaciones: editar y borrar (crear y buscar ya existen en ia.js)
  ...CRUD({ modulo: 'marketing', entidad: 'contacts', singular: 'contacto', plural: 'contactos', sin: ['listar', 'crear'],
    props: { name: txt(), email: txt(), phone: txt(), company: txt(), stage: ETAPA, source: txt(), campaign_id: id(), owner: txt(), tags: txt(), notes: txt(), last_contact_at: fecha() } }),
  ...CRUD({ modulo: 'marketing', entidad: 'tasks', singular: 'tarea', plural: 'tareas', borra: 'staff', sin: ['listar', 'crear'],
    props: { title: txt(), due_date: fecha(), done: bool(), contact_id: id(), deal_id: id(), assignee: txt(), notes: txt() } }),
  ...CRUD({ modulo: 'marketing', entidad: 'lists', singular: 'lista', plural: 'listas', sin: ['listar', 'crear'],
    props: { name: txt(), kind: { type: 'string', enum: ['otra', 'competidores', 'fuentes', 'temas', 'tendencias', 'prospectos'] }, description: txt() } }),
  ...CRUD({ modulo: 'marketing', entidad: 'list_items', singular: 'elemento_lista', plural: 'elementos_lista', borra: 'staff', sin: ['crear'], filtros: { list_id: 'Id de la lista' },
    props: { list_id: id(), title: txt(), url: txt('https://…'), feed_url: txt('https://… (RSS)'), notes: txt(), status: { type: 'string', enum: ['activo', 'revisado', 'descartado'] }, score: id() } }),
  ...CRUD({ modulo: 'marketing', entidad: 'automations', singular: 'automatizacion', plural: 'automatizaciones', escribe: 'admin', sin: ['listar', 'crear'],
    props: { name: txt(), trigger: { type: 'string', enum: ['lead_nuevo', 'sin_contacto', 'presupuesto_campana', 'factura_vencida', 'semanal'] }, action: { type: 'string', enum: ['crear_tarea', 'crear_oportunidad', 'informe_ia'] }, days: id(), percent: id(), task_title: txt('JSON de pasos [{t,d}]'), active: bool() } }),

  // Campañas y su gasto
  ...CRUD({ modulo: 'marketing', entidad: 'campaigns', singular: 'campana', plural: 'campanas', escribe: 'admin', sin: ['crear'], filtros: { status: 'activa, pausada o terminada' },
    props: { name: txt(), channel: { type: 'string', enum: ['meta_ads', 'google_ads', 'whatsapp', 'correo', 'organico', 'otro'] }, status: { type: 'string', enum: ['activa', 'pausada', 'terminada'] }, start_date: fecha(), end_date: fecha(), budget: num(), goal_leads: id(), utm_campaign: txt(), notes: txt() } }),
  ...CRUD({ modulo: 'marketing', entidad: 'spend', singular: 'gasto_campana', plural: 'gastos_campana', escribe: 'admin', required: ['campaign_id', 'date', 'amount'], filtros: { campaign_id: 'Id de la campaña' },
    props: { campaign_id: id(), date: fecha(), amount: num('Pesos'), leads: id(), clicks: id(), impressions: id(), note: txt() } }),
  H({ name: 'marketing.ver_links_campana', modulo: 'marketing', tipo: 'lectura', description: 'Links de rastreo (UTM) de una campaña con sus clics.', props: { campana_id: id() }, required: ['campana_id'], ruta: ['GET', '/api/marketing/campaigns/:campana_id/links'] }),
  H({ name: 'marketing.crear_link_campana', modulo: 'marketing', tipo: 'escritura', description: 'Crea un link de rastreo corto para una campaña y una plataforma (cuenta los clics).', props: { campana_id: id(), platform: txt('instagram, facebook, tiktok, whatsapp, google, correo, otro'), target: txt('https://… destino') }, required: ['campana_id', 'target'], ruta: ['POST', '/api/marketing/campaigns/:campana_id/links'] }),
  H({ name: 'marketing.borrar_link_campana', modulo: 'marketing', rol: 'admin', tipo: 'escritura', description: 'Borra un link de rastreo.', props: { link_id: id() }, required: ['link_id'], ruta: ['DELETE', '/api/marketing/links/:link_id'] }),

  // Oportunidades del embudo
  ...CRUD({ modulo: 'marketing', entidad: 'deals', singular: 'oportunidad', plural: 'oportunidades', required: ['title'], filtros: { stage: 'nuevo, calificado, propuesta, negociacion, ganado o perdido' },
    props: { title: txt(), contact_id: id(), campaign_id: id(), value: num('Pesos'), stage: { type: 'string', enum: ['nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'] }, expected_close: fecha(), notes: txt() } }),

  // Herramientas y servicios de marketing
  ...CRUD({ modulo: 'marketing', entidad: 'tools', singular: 'herramienta', plural: 'herramientas', escribe: 'admin', required: ['name'],
    props: { name: txt(), category: { type: 'string', enum: ['marketing', 'crm', 'infraestructura', 'software', 'api', 'ia', 'otro'] }, vendor: txt(), plan: txt(), cost: num(), cycle: { type: 'string', enum: ['mensual', 'anual', 'por uso'] }, renews_on: fecha(), url: txt(), account_email: txt(), status: { type: 'string', enum: ['activa', 'prueba', 'cancelada'] }, cost_center_id: id(), notes: txt() } }),

  // Listas: revisar y tarjetas
  H({ name: 'marketing.revisar_elementos_lista_ahora', modulo: 'marketing', tipo: 'escritura', description: 'Revisa ahora los sitios o feeds de una lista (por ejemplo blogs de competidores) y guarda sus últimas publicaciones.', props: { lista_id: id() }, required: ['lista_id'], ruta: ['POST', '/api/marketing/lists/:lista_id/check'] }),
  H({ name: 'marketing.listar_tarjetas', modulo: 'marketing', tipo: 'lectura', description: 'Tarjetas de presentación del negocio (la predeterminada y las demás) con su enlace público.', ruta: ['GET', '/api/marketing/cards'] }),
];

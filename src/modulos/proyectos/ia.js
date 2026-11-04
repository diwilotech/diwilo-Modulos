// Herramientas de IA del módulo Proyectos (MCP, IA Diwilo, agentes y el chat de administrador). Mismas reglas de la API: validaciones, negocio y bitácora.
import { api, cobrarCotizacion, resumen, borradorCorreo, enviarPorCorreo, documentosDe, DOCS } from './api.js';
import { today, addDays, all, one } from '../../lib/crud.js';
import { HttpError } from '../../lib/http.js';

const S = (props, required = []) => ({ type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false });
const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
const num = (description) => ({ type: 'number', ...(description ? { description } : {}) });
const LINEAS = { type: 'array', description: 'Líneas de la cotización', items: { type: 'object', properties: { concepto: str(), detalle: str(), cantidad: num(), valor: num('Valor unitario en pesos'), dolares: num('Valor unitario en dólares (usa la TRM)') }, required: ['concepto'] } };
const lineasDe = (a) => ((a.lineas || []).length ? a.lineas : [{ concepto: String(a.concepto || a.titulo || 'Servicios').slice(0, 200), valor: Number(a.valor) }])
  .map((l) => ({ concepto: l.concepto, detalle: l.detalle, cantidad: l.cantidad || 1, moneda: l.dolares ? 'USD' : 'COP', valor: l.dolares || l.valor }));
const mal = (a) => (!(a.lineas || []).length && !(Number(a.valor) > 0) ? 'Falta el valor: pasa `valor` (total) o `lineas` con concepto y valor.' : (a.lineas || []).some((l) => !l.concepto || !(Number(l.valor || l.dolares) > 0)) ? 'Cada línea necesita concepto y valor.' : null);
const proyectoId = async (c, v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const r = /^\d+$/.test(String(v)) ? await one(c.env, 'SELECT id FROM pr_projects WHERE id = ? AND business_id = ?', Number(v), c.businessId)
    : await one(c.env, 'SELECT id FROM pr_projects WHERE business_id = ? AND lower(name || \' \' || client) LIKE ? ORDER BY length(name) LIMIT 1', c.businessId, `%${String(v).toLowerCase()}%`);
  if (!r) throw new HttpError(404, `No encontré el proyecto «${v}» (mira proyectos.listar_proyectos)`);
  return r.id;
};
const pdf = (c, id) => `${c.url?.origin || ''}/api/proyectos/quotes/${id}/pdf`;

export default [
  { name: 'proyectos.resumen', modulo: 'proyectos', rol: 'staff', tipo: 'lectura',
    description: 'Resumen de Proyectos: proyectos abiertos, cotizaciones por estado y por aprobar, y cuentas de cobro pendientes ligadas a proyectos.',
    inputSchema: S({}), run: (c) => resumen(c) },
  { name: 'proyectos.listar_proyectos', modulo: 'proyectos', rol: 'staff', tipo: 'lectura',
    description: 'Proyectos/clientes con su id, estado, lo cotizado y lo cobrado. Úsalo antes de crear una cotización para ligarla al proyecto, o para no duplicar uno.',
    inputSchema: S({ texto: str('Nombre o cliente'), estado: { type: 'string', enum: ['propuesta', 'activo', 'terminado', 'cancelado'] } }),
    run: async (c, a) => ({ proyectos: await api.list(c, 'projects', new URLSearchParams({ q: a.texto || '', f_status: a.estado || '', limit: '100' })) }) },
  { name: 'proyectos.crear_proyecto', modulo: 'proyectos', rol: 'staff', tipo: 'escritura',
    description: 'Crea una EMPRESA/cliente en Proyectos (el nombre es solo el de la empresa). Se enlaza o crea su contacto en Marketing (con el correo). Después le cuelgas cotizaciones, que son sus trabajos.',
    inputSchema: S({ nombre: str('Nombre de la empresa, como la llamas'), razon_social: str('Razón social con S.A.S. o su tipo; sale en los PDF'), nit: str(), correo: str('Correo para enviarle cotizaciones y cuentas de cobro'), ciudad: str(), estado: { type: 'string', enum: ['propuesta', 'activo', 'terminado', 'cancelado'] }, notas: str() }, ['nombre']),
    run: async (c, a) => ({ ...(await api.create(c, 'projects', { name: a.nombre, legal_name: a.razon_social, tax_id: a.nit, client_email: a.correo, client_city: a.ciudad, status: a.estado, notes: a.notas })), creado: true }) },
  { name: 'proyectos.editar_proyecto', modulo: 'proyectos', rol: 'staff', tipo: 'escritura',
    description: 'Cambia el nombre, NIT, correo, ciudad, estado o notas de una empresa (id de listar_proyectos). Los datos nuevos se copian solos a todas sus cotizaciones y cuentas de cobro.',
    inputSchema: S({ id: num(), nombre: str(), razon_social: str(), nit: str(), correo: str(), ciudad: str(), estado: { type: 'string', enum: ['propuesta', 'activo', 'terminado', 'cancelado'] }, notas: str() }, ['id']),
    run: async (c, a) => { const m = { name: a.nombre, legal_name: a.razon_social, tax_id: a.nit, client_email: a.correo, client_city: a.ciudad, status: a.estado, notes: a.notas }; await api.update(c, 'projects', Number(a.id), Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined))); return { id: a.id, editado: true }; } },
  { name: 'proyectos.listar_cotizaciones', modulo: 'proyectos', rol: 'staff', tipo: 'lectura',
    description: 'Cotizaciones con su id, número, cliente, total, estado, vigencia y si ya tienen cuenta de cobro.',
    inputSchema: S({ texto: str('Número, cliente o título'), estado: { type: 'string', enum: ['borrador', 'enviada', 'aprobada', 'rechazada'] }, proyecto_id: num() }),
    run: async (c, a) => ({ cotizaciones: (await api.list(c, 'quotes', new URLSearchParams({ q: a.texto || '', f_status: a.estado || '', f_project_id: a.proyecto_id || '', limit: '100' }))).map(({ id, number, counterparty, title, issue_date, valid_until, total, status, invoice_id, vencida }) => ({ id, numero: number, cliente: counterparty, titulo: title, fecha: issue_date, vence: valid_until, total, estado: status, vencida: !!vencida, cuenta_de_cobro_id: invoice_id })) }) },
  { name: 'proyectos.crear_cotizacion', modulo: 'proyectos', rol: 'staff', tipo: 'escritura',
    description: 'Crea una cotización (queda en borrador) con consecutivo COT-0001 y PDF con tu firma. Si la persona da un solo valor, pásalo en `valor` (y `titulo`/`concepto`) sin pedir más detalle. Vigencia por defecto: 15 días.',
    inputSchema: S({ cliente: str(), nit: str(), correo: str(), ciudad: str(), titulo: str('Nombre del trabajo, p. ej. «Landing de campaña»'), concepto: str('Resumen del alcance'), valor: num('Valor total en pesos si no hay líneas'), lineas: LINEAS,
      fecha: str('AAAA-MM-DD'), vigencia_dias: num(), condiciones: str('Forma de pago, tiempos, qué no incluye'), proyecto: str('Id o nombre de un proyecto existente'),
      incluye: { type: 'array', items: { type: 'string' }, description: 'Qué incluye la propuesta (una frase por ítem): sale como lista en el PDF' }, necesitamos: { type: 'array', items: { type: 'string' }, description: 'Lo que se necesita del cliente (accesos, textos, logos…)' }, plazo: str('Tiempo de entrega, p. ej. «3 semanas»'), sugerencias: { type: 'array', items: { type: 'string' }, description: 'Ideas opcionales que NO suman al total; salen aparte en el recuadro «Sugerencias» del PDF' } }, ['cliente']),
    validar: mal,
    run: async (c, a) => {
      const fecha = a.fecha || today(), pid = await proyectoId(c, a.proyecto);
      const r = await api.create(c, 'quotes', { project_id: pid, counterparty: a.cliente, tax_id: a.nit, client_email: a.correo, client_city: a.ciudad, title: a.titulo, concept: a.concepto, issue_date: fecha, valid_until: addDays(fecha, Number(a.vigencia_dias) || 15), items: lineasDe(a), conditions: a.condiciones,
        extra: (a.incluye?.length || a.necesitamos?.length || a.plazo || a.sugerencias?.length) ? JSON.stringify({ sugerencias: a.sugerencias || [], secciones: a.incluye?.length ? [{ titulo: 'Qué incluye', bloques: [...(a.concepto ? [{ tipo: 'texto', texto: a.concepto }] : []), { tipo: 'lista', items: a.incluye }] }] : [], necesitamos: a.necesitamos || [], plazo: a.plazo || '' }) : undefined });
      const q = await api.get(c, 'quotes', r.id);
      return { id: r.id, numero: q.number, total: q.total, pdf: pdf(c, r.id) };
    } },
  { name: 'proyectos.cambiar_estado_cotizacion', modulo: 'proyectos', rol: 'staff', tipo: 'escritura',
    description: 'Marca una cotización como enviada o rechazada (id de listar_cotizaciones). Para aprobarla usa cotizacion_a_cuenta_de_cobro.',
    inputSchema: S({ id: num(), estado: { type: 'string', enum: ['borrador', 'enviada', 'rechazada'] } }, ['id', 'estado']),
    run: async (c, a) => { await api.update(c, 'quotes', Number(a.id), { status: a.estado }); return { id: a.id, estado: a.estado }; } },
  { name: 'proyectos.cotizacion_a_cuenta_de_cobro', modulo: 'proyectos', rol: 'admin', tipo: 'escritura',
    description: 'Aprueba una cotización y crea una cuenta de cobro (sin pagar) en Finanzas, ligada a la empresa. Una cotización puede tener varias cuentas (p. ej. anticipo y saldo) hasta cubrir su total: cobra líneas concretas o un `valor`.',
    inputSchema: S({ id: num('Id de la cotización'), fecha: str('AAAA-MM-DD, por defecto hoy'), vence: str('AAAA-MM-DD'), lineas: { type: 'array', items: { type: 'number' }, description: 'Posiciones (desde 0) de las líneas a cobrar; sin esto se cobran todas las que faltan' }, valor: num('En vez de líneas: un valor en pesos (anticipo o abono) que no supere lo pendiente'), concepto: str('Texto de la línea cuando cobras un valor') }, ['id']),
    run: async (c, a) => { const r = await cobrarCotizacion(c, Number(a.id), { fecha: a.fecha, vence: a.vence, lineas: a.lineas, valor: a.valor, concepto: a.concepto }); return { ...r, pdf: `${c.url?.origin || ''}/api/finanzas/invoices/${r.id}/pdf` }; } },
  { name: 'proyectos.enlace_pdf', modulo: 'proyectos', rol: 'staff', tipo: 'lectura',
    description: 'Enlace del PDF de una cotización (id de listar_cotizaciones); se abre en la app y se guarda como PDF con la firma.',
    inputSchema: S({ id: num() }, ['id']),
    run: async (c, a) => { const q = await api.get(c, 'quotes', Number(a.id)); return { numero: q.number, pdf: pdf(c, q.id) }; } },
  { name: 'proyectos.editar_cotizacion', modulo: 'proyectos', rol: 'staff', tipo: 'escritura',
    description: 'Cambia el título, alcance, condiciones, vigencia o el contenido extra de una cotización que aún no tiene cuenta de cobro. Las `sugerencias` salen aparte en el PDF y no suman al total.',
    inputSchema: S({ id: num(), titulo: str(), concepto: str(), condiciones: str(), valida_hasta: str('AAAA-MM-DD'), sugerencias: { type: 'array', items: { type: 'string' } }, necesitamos: { type: 'array', items: { type: 'string' } }, plazo: str() }, ['id']),
    run: async (c, a) => {
      const q = await api.get(c, 'quotes', Number(a.id));
      let x = {}; try { x = JSON.parse(q.extra || '{}') || {}; } catch { /* vacío */ }
      if (a.sugerencias) x.sugerencias = a.sugerencias; if (a.necesitamos) x.necesitamos = a.necesitamos; if (a.plazo !== undefined) x.plazo = a.plazo;
      const m = { title: a.titulo, concept: a.concepto, conditions: a.condiciones, valid_until: a.valida_hasta, ...(a.sugerencias || a.necesitamos || a.plazo !== undefined ? { extra: JSON.stringify(x) } : {}) };
      await api.update(c, 'quotes', Number(a.id), Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined)));
      return { id: a.id, editada: true, pdf: pdf(c, a.id) };
    } },
  { name: 'proyectos.preparar_correo', modulo: 'proyectos', rol: 'staff', tipo: 'lectura',
    description: 'Prepara el correo para enviar una cotización (tipo «cotizacion») o una cuenta de cobro (tipo «cuenta») a la empresa: destinatario, asunto, redacción y enlace público al PDF. No envía nada.',
    inputSchema: S({ tipo: { type: 'string', enum: ['cotizacion', 'cuenta'] }, id: num('Id de la cotización, o de la cuenta de cobro si el tipo es cuenta') }, ['tipo', 'id']),
    run: (c, a) => borradorCorreo(c, a.tipo === 'cuenta' ? 'cuenta' : 'cotizacion', Number(a.id)) },
  { name: 'proyectos.enviar_por_correo', modulo: 'proyectos', rol: 'staff', tipo: 'escritura',
    description: 'Envía por correo (desde Mensajes) una cotización o cuenta de cobro con el enlace al PDF y una redacción. Si no pasas asunto o mensaje usa el borrador de preparar_correo. La cotización pasa a «enviada».',
    inputSchema: S({ tipo: { type: 'string', enum: ['cotizacion', 'cuenta'] }, id: num(), para: str('Correo; por defecto el de la empresa'), asunto: str(), mensaje: str() }, ['tipo', 'id']),
    run: (c, a) => enviarPorCorreo(c, { tipo: a.tipo === 'cuenta' ? 'cuenta' : 'cotizacion', id: Number(a.id), para: a.para, asunto: a.asunto, mensaje: a.mensaje }) },
  { name: 'proyectos.ver_documentos', modulo: 'proyectos', rol: 'staff', tipo: 'lectura',
    description: 'Dice si ya están subidos el RUT y la certificación bancaria del negocio (se suben desde Proyectos → «RUT y certificado bancario»; la IA no sube archivos). Cuando existen, los correos de cotizaciones y cuentas de cobro los enlazan solos.',
    inputSchema: S({}),
    run: async (c) => { const f = await documentosDe(c.env, c.businessId); return { rut: f.some((x) => x.kind === 'rut'), certificacion_bancaria: f.some((x) => x.kind === 'banco'), faltan: Object.keys(DOCS).filter((k) => !f.some((x) => x.kind === k)).map((k) => DOCS[k]) }; } },
];

// IA (módulo general de IA del negocio). Ver: todo el equipo; configurar: propietario y administrador.
//   CRUD  /api/ai/chats                       chats de clientes (cada uno con su dirección /chat/<slug>)
//   POST  /api/ai/chats/:id/webhook-prueba    manda un evento de prueba al webhook del chat
//   GET   /api/ai/conversaciones?chat=&limite=  conversaciones de los chats · GET /:id mensajes · DELETE /:id
//   CRUD  /api/ai/agentes · POST /:id/ejecutar · GET /api/ai/ejecuciones?agente= · POST /ejecuciones/:id/aprobar { indice, aprobar }
//   GET   /api/ai/herramientas                herramientas de IA de los módulos activos del negocio
//   POST  /api/ai/asistente { mensajes }      asistente del negocio (consulta y propone) · POST /asistente/aprobar { herramienta, args }
//   GET   /api/ai/uso                         consumo de IA (hoy y últimos 30 días) y tope diario
//   GET|POST /api/ai/claves · DELETE /:id     claves de la API pública del negocio (/v1/…)
// Públicos (en el dominio de cada app): /chat/<slug> (chat.js) y /v1/… (publica.js).
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { motor, usoDelDia, TOPE_DIA, dayCo, ajustesDe, AJUSTES_BASE, costoUsd, neuronas, NEURONAS_GRATIS } from '../../lib/ia.js';
import { REG, ejecutarHerramienta } from '../../lib/registro.js';
import { ctxDeOrg } from '../../lib/contexto.js';
import { guiasDe } from '../../lib/guias.js';
import { flujosEntre } from '../../lib/flujos.js';
import { agentesDelDia, correrAgente, resolverPropuesta, asistente, herramientasDe } from './agentes.js';
import { webhookValido, dispararWebhook } from './chat.js';

const MOD = 'ai', B = '/api/ai';
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const RESERVADO = new Set(['widget', 'mensaje']);
async function slugUnico(env, nombre) {
  const base = slugify(nombre) || 'chat';
  for (let i = 0; i < 40; i++) {
    const s = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!RESERVADO.has(s) && !(await one(env, 'SELECT 1 FROM ia_chats WHERE slug = ?', s))) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}
const MAX_CHATS = 10, MAX_AGENTES = 20;

/* ---------- entidades ---------- */
const revisarChat = (row) => {
  if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre del chat es muy largo (máximo 80 letras)');
  if (row.saludo && row.saludo.length > 300) throw new HttpError(400, 'El saludo es muy largo (máximo 300 letras)');
  if (row.instrucciones && row.instrucciones.length > 4000) throw new HttpError(400, 'Las instrucciones son muy largas (máximo 4000 letras)');
  if (row.webhook_url && !webhookValido(row.webhook_url)) throw new HttpError(400, 'El webhook debe ser una dirección https pública');
  if (row.limite_dia != null && (row.limite_dia < 1 || row.limite_dia > TOPE_DIA)) throw new HttpError(400, `El tope diario debe estar entre 1 y ${TOPE_DIA}`);
};
export const ENTITIES = {
  chats: {
    table: 'ia_chats', label: 'el chat', title: 'nombre', search: ['nombre', 'slug'], order: 'created_at',
    fields: { nombre: 'text!', activo: 'bool+', saludo: 'long', instrucciones: 'long', usar_marca: 'bool+', capturar_leads: 'bool+', whatsapp: 'text', webhook_url: 'url', limite_dia: 'int' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row) {
      revisarChat(row);
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ia_chats WHERE business_id = ?', c.businessId)).n >= MAX_CHATS) throw new HttpError(400, `Ya tienes ${MAX_CHATS} chats`);
      row.slug = await slugUnico(c.env, row.nombre);
    },
    beforeUpdate(c, row) { revisarChat(row); },
    async afterDelete(c, before) {
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM ia_mensajes WHERE conversacion_id IN (SELECT id FROM ia_conversaciones WHERE chat_id = ? AND business_id = ?)').bind(before.id, c.businessId),
        c.env.DB.prepare('DELETE FROM ia_conversaciones WHERE chat_id = ? AND business_id = ?').bind(before.id, c.businessId),
        c.env.DB.prepare('UPDATE mk_cards SET chat_slug = NULL WHERE chat_slug = ? AND business_id = ?').bind(before.slug, c.businessId),
      ]);
    },
    async decorate(c, rows) {
      const n = Object.fromEntries((await all(c.env, 'SELECT chat_id, COUNT(*) n, MAX(last_at) ultima FROM ia_conversaciones WHERE business_id = ? GROUP BY chat_id', c.businessId)).map((r) => [r.chat_id, r]));
      return rows.map((r) => ({ ...r, conversaciones: n[r.id]?.n || 0, ultima: n[r.id]?.ultima || null, ruta: `/chat/${r.slug}` }));
    },
  },
  agentes: {
    table: 'ia_agentes', label: 'el agente', title: 'nombre', search: ['nombre'], order: 'created_at',
    fields: { nombre: 'text!', instrucciones: 'long!', herramientas: 'long', programacion: ['manual', 'diario', 'semanal'], autonomia: ['proponer', 'ejecutar'], activo: 'bool+' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    prepareBody(b) { return { ...b, herramientas: Array.isArray(b.herramientas) ? JSON.stringify(b.herramientas) : b.herramientas }; },
    async beforeCreate(c, row) {
      await revisarAgente(c, row);
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ia_agentes WHERE business_id = ?', c.businessId)).n >= MAX_AGENTES) throw new HttpError(400, `Ya tienes ${MAX_AGENTES} agentes`);
    },
    beforeUpdate(c, row) { return revisarAgente(c, row); },
    async afterDelete(c, before) { await c.env.DB.prepare('DELETE FROM ia_ejecuciones WHERE agente_id = ? AND business_id = ?').bind(before.id, c.businessId).run(); },
    async decorate(c, rows) {
      const ult = Object.fromEntries((await all(c.env, `SELECT agente_id, estado, resumen, pendientes, created_at FROM ia_ejecuciones e WHERE business_id = ? AND id = (SELECT MAX(id) FROM ia_ejecuciones WHERE agente_id = e.agente_id)`, c.businessId)).map((r) => [r.agente_id, r]));
      return rows.map((r) => ({ ...r, herramientas: lista(r.herramientas), ultima: ult[r.id] || null }));
    },
  },
};
const lista = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
async function revisarAgente(c, row) {
  if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre es muy largo (máximo 80 letras)');
  if (row.instrucciones && row.instrucciones.length > 4000) throw new HttpError(400, 'Las instrucciones son muy largas (máximo 4000 letras)');
  if ('herramientas' in row) {
    const h = row.herramientas == null ? [] : lista(row.herramientas);
    const validas = new Set(herramientasDe(await ctxDeRequest(c)).map((t) => t.name));
    if (h.some((x) => !validas.has(x))) throw new HttpError(400, 'Hay una herramienta que no existe o que este negocio no puede usar');
    row.herramientas = JSON.stringify([...new Set(h)]);
  }
}
const ctxDeRequest = async (c) => c.ctx;
const api = crud({ get() {}, post() {}, patch() {}, delete() {} }, { base: '/ia/ai', modulo: MOD, entities: ENTITIES });
export const listar = (c, e, p) => api.list(c, e, p);

/* ---------- claves de la API ---------- */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const huella = async (k) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)));

/* ---------- rutas ---------- */
export function routes(r) {
  crud(r, { base: B, modulo: MOD, entities: ENTITIES });

  r.post(`${B}/chats/:id/webhook-prueba`, `manager:${MOD}`, async (c) => {
    const chat = await one(c.env, 'SELECT * FROM ia_chats WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!chat) throw new HttpError(404, 'Chat no encontrado');
    if (!chat.webhook_url) throw new HttpError(400, 'Este chat no tiene webhook');
    return json(await dispararWebhook(chat, 'prueba', { mensaje: 'Evento de prueba de Diwilo' }));
  });

  /* conversaciones */
  r.get(`${B}/conversaciones`, `tenant:${MOD}`, async (c) => {
    const chat = Number(c.url.searchParams.get('chat')) || null, limite = Math.min(200, Math.max(1, Number(c.url.searchParams.get('limite')) || 100));
    const rows = await all(c.env, `SELECT v.id, v.chat_id, ch.nombre chat, v.started_at, v.last_at, v.msg_count, v.pagina, v.pais, v.dispositivo, v.lead_id,
      (SELECT contenido FROM ia_mensajes m WHERE m.conversacion_id = v.id AND m.rol = 'user' ORDER BY ts LIMIT 1) primero
      FROM ia_conversaciones v JOIN ia_chats ch ON ch.id = v.chat_id WHERE v.business_id = ? ${chat ? 'AND v.chat_id = ?' : ''} ORDER BY v.last_at DESC LIMIT ${limite}`, ...(chat ? [c.businessId, chat] : [c.businessId]));
    return json({ rows });
  });
  r.get(`${B}/conversaciones/:id`, `tenant:${MOD}`, async (c) => {
    const v = await one(c.env, 'SELECT * FROM ia_conversaciones WHERE id = ? AND business_id = ?', c.params.id, c.businessId);
    if (!v) throw new HttpError(404, 'Conversación no encontrada');
    return json({ conversacion: v, mensajes: await all(c.env, 'SELECT rol, contenido, ts FROM ia_mensajes WHERE conversacion_id = ? AND business_id = ? ORDER BY ts, id', c.params.id, c.businessId) });
  });
  r.delete(`${B}/conversaciones/:id`, `manager:${MOD}`, async (c) => {
    const v = await one(c.env, 'SELECT id FROM ia_conversaciones WHERE id = ? AND business_id = ?', c.params.id, c.businessId);
    if (!v) throw new HttpError(404, 'Conversación no encontrada');
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM ia_mensajes WHERE conversacion_id = ? AND business_id = ?').bind(v.id, c.businessId), c.env.DB.prepare('DELETE FROM ia_conversaciones WHERE id = ? AND business_id = ?').bind(v.id, c.businessId)]);
    await audit(c, 'Borró una conversación del chat', { modulo: MOD });
    return json({ ok: true });
  });

  /* herramientas, agentes y asistente */
  r.get(`${B}/herramientas`, `tenant:${MOD}`, async (c) => json({ herramientas: herramientasDe(c.ctx).filter((t) => t.modulo !== 'ai' || t.tipo === 'lectura') }));
  // Las guías de uso de los módulos (el mismo estándar del MCP): para crear agentes desde un flujo y para el asistente
  r.get(`${B}/guias`, `tenant:${MOD}`, async (c) => json({ modulos: guiasDe(c.ctx).filter((g) => g.modulo !== 'ai').map(({ markdown, ...g }) => g), entre: flujosEntre(herramientasDe(c.ctx).filter((t) => t.modulo !== 'ai' || t.tipo === 'lectura')) }));
  r.post(`${B}/agentes/:id/ejecutar`, `manager:${MOD}`, async (c) => {
    const a = await one(c.env, 'SELECT * FROM ia_agentes WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!a) throw new HttpError(404, 'Agente no encontrado');
    const res = await correrAgente(c.env, { org: c.businessId, agente: a, disparador: 'manual', ctx: { ...c.ctx, role: c.role === 'owner' ? 'owner' : 'admin', readOnly: false }, por: c.session?.email || null });
    await audit(c, `Ejecutó el agente «${a.nombre}»`, { modulo: MOD });
    return json(res);
  });
  r.get(`${B}/ejecuciones`, `tenant:${MOD}`, async (c) => {
    const ag = Number(c.url.searchParams.get('agente')) || null;
    const rows = await all(c.env, `SELECT e.*, a.nombre agente FROM ia_ejecuciones e JOIN ia_agentes a ON a.id = e.agente_id WHERE e.business_id = ? ${ag ? 'AND e.agente_id = ?' : ''} ORDER BY e.id DESC LIMIT 50`, ...(ag ? [c.businessId, ag] : [c.businessId]));
    return json({ rows: rows.map((e) => ({ ...e, pasos: JSON.parse(e.pasos || '[]') })) });
  });
  r.post(`${B}/ejecuciones/:id/aprobar`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const res = await resolverPropuesta(c.env, { org: c.businessId, ejecucionId: Number(c.params.id), indice: Number(b.indice), aprobar: b.aprobar !== false, ctx: c.ctx });
    if (res.status !== 200) throw new HttpError(res.status, res.error);
    for (const a of res.audit || []) (c.auditLog ||= []).push(a);
    await audit(c, `${b.aprobar === false ? 'Rechazó' : 'Aprobó'} una propuesta de un agente`, { modulo: MOD, detalle: { herramienta: res.paso.herramienta } });
    return json({ paso: res.paso, pendientes: res.pendientes });
  });
  r.post(`${B}/asistente`, `tenant:${MOD}`, async (c) => {
    const b = await readJson(c.req), progresoId = /^[\w-]{8,40}$/.test(b.progreso || '') ? b.progreso : null;
    const res = await asistente(c.env, { org: c.businessId, ctx: { ...c.ctx, readOnly: c.readOnly }, mensajes: b.mensajes, progresoId });
    if (res.status !== 200) throw new HttpError(res.status, res.error);
    return json({ respuesta: res.respuesta, pasos: res.pasos });
  });
  // El paso a paso del asistente mientras trabaja (la pantalla lo consulta cada segundo). GET /api/ai/asistente/progreso?id=<el mismo que mandó en POST /asistente>
  r.get(`${B}/asistente/progreso`, `tenant:${MOD}`, async (c) => {
    const p = await one(c.env, 'SELECT estado, actual, pasos FROM ia_progreso WHERE id = ? AND business_id = ?', String(c.url.searchParams.get('id') || ''), c.businessId);
    return json(p ? { estado: p.estado, actual: p.actual, pasos: JSON.parse(p.pasos || '[]') } : { estado: 'trabajando', actual: null, pasos: [] });
  });
  r.post(`${B}/asistente/aprobar`, `tenant:${MOD}`, async (c) => {
    const b = await readJson(c.req), t = herramientasDe(c.ctx).find((x) => x.name === b.herramienta);
    if (!t || t.tipo !== 'escritura') throw new HttpError(400, 'Herramienta no válida');
    const res = await ejecutarHerramienta(c.env, c.ctx, t.name, b.args && typeof b.args === 'object' ? b.args : {});
    for (const a of res.audit || []) (c.auditLog ||= []).push(a);
    if (!res.ok) throw new HttpError(res.status || 500, res.error);
    return json({ ok: true, resultado: res.result });
  });

  /* consumo */
  r.get(`${B}/uso`, `tenant:${MOD}`, async (c) => {
    const hoy = await usoDelDia(c.env, c.businessId), aj = await ajustesDe(c.env, c.businessId), dia = dayCo(), mes = dia.slice(0, 7);
    const desde = new Date(Date.now() - 5 * 3600000 - 29 * 86400000).toISOString().slice(0, 10);
    const filas = await all(c.env, 'SELECT day, fuente, proveedor, calls, tin, tout FROM ia_uso WHERE business_id = ? AND (day >= ? OR day LIKE ?)', c.businessId, desde, `${mes}%`);
    const suma = (l) => ({ calls: l.reduce((a, r) => a + r.calls, 0), tin: l.reduce((a, r) => a + r.tin, 0), tout: l.reduce((a, r) => a + r.tout, 0), usd: costoUsd(l) });
    const delMes = filas.filter((r) => r.day.startsWith(mes)), delDia = filas.filter((r) => r.day === dia);
    const dias = [...new Set(filas.filter((r) => r.day >= desde).map((r) => r.day))].sort().map((d) => ({ day: d, ...suma(filas.filter((r) => r.day === d)) }));
    const porFuente = {}; for (const r of delMes) (porFuente[r.fuente] ||= []).push(r);
    const m = suma(delMes), diaDelMes = Number(dia.slice(8)), diasMes = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate();
    return json({ motor: motor(c.env), tope_dia: TOPE_DIA, hoy: { calls: hoy.n, tin: hoy.tin, tout: hoy.tout, usd: costoUsd(delDia), neuronas: neuronas(delDia) }, dia, dias,
      mes: { ...m, proyeccion_usd: m.usd / diaDelMes * diasMes }, neuronas_gratis: c.env.GEMINI_API_KEY ? null : NEURONAS_GRATIS, ajustes: aj,
      fuentes: Object.entries(porFuente).map(([fuente, l]) => ({ fuente, ...suma(l) })).sort((a, b) => b.usd - a.usd || b.calls - a.calls) });
  });
  // Topes del negocio: tokens por día, tokens por ejecución de un agente y dólar en pesos. PATCH /api/ai/uso { tope_tokens?, tope_ejecucion?, usd_cop? }
  r.patch(`${B}/uso`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), rangos = { tope_tokens: [0, 1e9, 'El tope diario debe ser de 0 (sin tope) a 1.000 millones de tokens'], tope_ejecucion: [5000, 1e8, 'El tope por ejecución debe ser de al menos 5.000 tokens'], usd_cop: [1000, 20000, 'El dólar debe estar entre 1.000 y 20.000 pesos'] };
    const put = [];
    for (const [k, [min, max, msg]] of Object.entries(rangos)) if (b[k] !== undefined) { const n = Math.round(Number(b[k])); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, msg); put.push([k, n]); }
    for (const [k, v] of put) await c.env.DB.prepare('INSERT INTO ia_ajustes (business_id, k, v) VALUES (?, ?, ?) ON CONFLICT(business_id, k) DO UPDATE SET v = excluded.v').bind(c.businessId, k, String(v)).run();
    if (put.length) await audit(c, `Cambió los topes de IA (${put.map(([k, v]) => `${k}: ${v}`).join(', ')})`, { modulo: MOD });
    return json({ ok: true, ajustes: await ajustesDe(c.env, c.businessId) });
  });

  /* claves de la API */
  r.get(`${B}/claves`, `manager:${MOD}`, async (c) => json({ rows: await all(c.env, 'SELECT id, nombre, prefijo, created_at, last_used, revocada FROM ia_claves WHERE business_id = ? ORDER BY id DESC', c.businessId) }));
  r.post(`${B}/claves`, `manager:${MOD}`, async (c) => {
    const nombre = String((await readJson(c.req)).nombre || '').trim().slice(0, 60);
    if (!nombre) throw new HttpError(400, 'Ponle un nombre a la clave');
    if ((await one(c.env, 'SELECT COUNT(*) n FROM ia_claves WHERE business_id = ? AND revocada = 0', c.businessId)).n >= 10) throw new HttpError(400, 'Ya tienes 10 claves activas');
    const key = `dwi_${hex(crypto.getRandomValues(new Uint8Array(20)))}`;
    const res = await c.env.DB.prepare('INSERT INTO ia_claves (business_id, nombre, prefijo, hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(c.businessId, nombre, key.slice(0, 10), await huella(key), c.session?.email || null, now()).run();
    await audit(c, `Creó la clave de API «${nombre}»`, { modulo: MOD });
    return json({ id: res.meta.last_row_id, key }, 201);
  });
  r.delete(`${B}/claves/:id`, `manager:${MOD}`, async (c) => {
    const k = await one(c.env, 'SELECT nombre FROM ia_claves WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!k) throw new HttpError(404, 'Clave no encontrada');
    await c.env.DB.prepare('UPDATE ia_claves SET revocada = 1 WHERE id = ? AND business_id = ?').bind(Number(c.params.id), c.businessId).run();
    await audit(c, `Revocó la clave de API «${k.nombre}»`, { modulo: MOD });
    return json({ ok: true });
  });
}

export const daily = agentesDelDia;

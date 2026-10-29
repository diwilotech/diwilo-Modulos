// Historial del asistente «IA Diwilo»: guarda cada turno del equipo en ia_conversaciones (canal 'asistente') y lo analiza a pedido.
// Solo propietario/administrador lo ve (las rutas están en api.js). Un fallo al guardar nunca rompe la respuesta del asistente.
import { all, one, now } from '../../lib/crud.js';
import { llamarIA } from '../../lib/ia.js';

export const ID_ASISTENTE = /^a-[\w-]{8,40}$/;

// Cada paso con lo justo para revisar: qué herramienta, cómo terminó y el error si lo hubo (nunca los resultados completos).
const resumenPasos = (pasos) => JSON.stringify((pasos || []).slice(0, 20).map((p) => ({ herramienta: p.herramienta, estado: p.estado, args: p.estado === 'propuesta' ? p.args : undefined, error: p.error ? String(p.error).slice(0, 300) : undefined })));

async function asegurar(env, org, id, userId) {
  const v = await one(env, 'SELECT business_id FROM ia_conversaciones WHERE id = ?', id);
  if (v) return v.business_id === org;                                   // el id de otro negocio no se toca
  await env.DB.prepare("INSERT INTO ia_conversaciones (id, business_id, chat_id, started_at, last_at, msg_count, canal, user_id) VALUES (?, ?, 0, ?, ?, 0, 'asistente', ?)").bind(id, org, now(), now(), userId || null).run();
  return true;
}
async function agregar(env, org, id, filas) {
  const t = now();
  await env.DB.batch([
    ...filas.map((f, i) => env.DB.prepare('INSERT INTO ia_mensajes (business_id, conversacion_id, ts, rol, contenido, meta) VALUES (?, ?, ?, ?, ?, ?)').bind(org, id, t + i, f.rol, String(f.contenido || '').slice(0, 6000), f.meta || null)),
    env.DB.prepare('UPDATE ia_conversaciones SET last_at = ?, msg_count = msg_count + ?, analisis = NULL, analizado_at = NULL WHERE id = ? AND business_id = ?').bind(t, filas.length, id, org),
  ]);
}

export async function guardarTurno(env, { org, id, userId, pregunta, respuesta, pasos }) {
  try {
    if (!ID_ASISTENTE.test(id || '') || !(await asegurar(env, org, id, userId))) return;
    await agregar(env, org, id, [{ rol: 'user', contenido: pregunta }, { rol: 'assistant', contenido: respuesta, meta: resumenPasos(pasos) }]);
  } catch (e) { console.error('historial', e.message); }
}
// Lo que la persona hizo con una propuesta: «Aprobó … (hecho | falló: …)» o «Descartó …».
export async function guardarEvento(env, { org, id, texto }) {
  try { if (ID_ASISTENTE.test(id || '') && (await one(env, "SELECT 1 AS x FROM ia_conversaciones WHERE id = ? AND business_id = ? AND canal = 'asistente'", id, org))) await agregar(env, org, id, [{ rol: 'sistema', contenido: texto }]); } catch (e) { console.error('historial', e.message); }
}

export const listar = (env, org) => all(env, `SELECT v.id, v.started_at, v.last_at, v.msg_count, v.user_id, v.analizado_at, v.analisis IS NOT NULL AS analizada,
  (SELECT contenido FROM ia_mensajes m WHERE m.conversacion_id = v.id AND m.rol = 'user' ORDER BY ts LIMIT 1) primero
  FROM ia_conversaciones v WHERE v.business_id = ? AND v.canal = 'asistente' ORDER BY v.last_at DESC LIMIT 100`, org);

const SISTEMA = `Eres un revisor de calidad de un asistente de IA de un negocio. Te paso una conversación entre una persona del equipo y el asistente (con las herramientas que usó y lo que la persona aprobó o descartó). Busca problemas reales y responde en español, corto y concreto, con estas secciones (omite las que no apliquen):
**Cifras o datos dudosos**: respuestas con números o hechos que no vienen de una herramienta.
**Herramientas con error**: pasos que fallaron o que se usaron mal.
**Propuestas rechazadas o fallidas**: qué se descartó o no se pudo ejecutar, y la posible causa.
**Preguntas sin respuesta útil**: cuando el asistente no supo, se desvió o pidió datos de más.
**Qué mejorar**: 1 a 3 cambios concretos (instrucciones, herramientas o datos).
Si no hay problemas, di en una línea que la conversación salió bien. No inventes problemas.`;

export async function analizar(env, { org, id }) {
  const v = await one(env, "SELECT id FROM ia_conversaciones WHERE id = ? AND business_id = ? AND canal = 'asistente'", id, org);
  if (!v) return { status: 404, error: 'Conversación no encontrada' };
  const ms = await all(env, 'SELECT rol, contenido, meta FROM ia_mensajes WHERE conversacion_id = ? AND business_id = ? ORDER BY ts, id LIMIT 60', id, org);
  const texto = ms.map((m) => `${m.rol === 'user' ? 'PERSONA' : m.rol === 'assistant' ? 'ASISTENTE' : 'SISTEMA'}: ${m.contenido}${m.meta && m.meta !== '[]' ? `\n  [herramientas: ${m.meta.slice(0, 1500)}]` : ''}`).join('\n\n').slice(0, 14000);
  const out = await llamarIA(env, org, SISTEMA, [{ role: 'user', content: `Conversación:\n\n${texto}` }], { fuente: 'asistente', maxTokens: 900, temperature: 0.2 });
  await env.DB.prepare('UPDATE ia_conversaciones SET analisis = ?, analizado_at = ? WHERE id = ? AND business_id = ?').bind(out, now(), id, org).run();
  return { status: 200, analisis: out, analizado_at: now() };
}

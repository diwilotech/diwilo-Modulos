// IA proactiva: «lo de hoy» del negocio SIN gastar IA. Junta lo que ya se sabe y lo vuelve algo que se puede atender con un toque:
//   1. las alertas que cada módulo empujó al Inicio (dashboard_estado, ya filtradas por rol y módulos activos),
//   2. los pendientes de los módulos PROPIOS de la app (ctx.propias.pendientes(), opcional: lo calcula la app con la sesión de quien mira),
//   3. las propuestas que los agentes dejaron esperando aprobación.
// Cada aviso lleva una `pregunta`: lo que la persona le pediría a la IA para resolverlo (el botón flotante la manda al tocar el aviso).
//   GET /api/ai/proactivo  { hoy, avisos: [{ id, nivel: mala|aviso|info, icono, texto, ruta, pregunta }], urgentes }
import { one } from '../../lib/crud.js';
import { limpiarAlertas } from '../../lib/tablero.js';
import { tablero } from '../dashboard/api.js';

// Qué pedirle a la IA ante cada alerta de los módulos centrales (por id). Un módulo puede mandar su propia `pregunta` en la alerta.
const PREGUNTAS = {
  cartera: '¿A quién le cobro primero?',
  pagos: '¿Qué pagos tengo vencidos?',
  tareas: '¿Qué tareas tengo vencidas?',
  leads: '¿Qué hago con los contactos nuevos?',
  seguimientos: '¿A qué oportunidades les hago seguimiento hoy y qué les digo?',
  'mensajes-rojo': '¿Qué chats necesitan a una persona?',
  'mensajes-pend': '¿Qué chats están sin responder?',
  propuestas: '¿Qué propusieron mis agentes?',
};
const ORDEN = { mala: 0, aviso: 1, info: 2 };
const conTope = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(null), ms))]);

export async function proactivo(c) {
  const t = await tablero(c);
  // Pendientes de los módulos propios: los calcula la app (llamada de vuelta por RPC). Si falla o tarda, se sigue sin ellos.
  let propios = [];
  if (typeof c.ctx?.propias?.pendientes === 'function') {
    try { propios = limpiarAlertas(await conTope(Promise.resolve(c.ctx.propias.pendientes()), 4000)); } catch (e) { console.error('pendientes de la app', e.message); }
  }
  const avisos = [...t.alertas, ...propios];
  // Propuestas de los agentes sin resolver (las aprueba el propietario o un administrador)
  if (['owner', 'admin'].includes(c.role)) {
    const p = await one(c.env, 'SELECT COALESCE(SUM(pendientes), 0) AS n FROM ia_ejecuciones WHERE business_id = ? AND pendientes > 0 AND created_at > ?', c.businessId, Date.now() - 14 * 86400000).catch(() => null);
    if (p?.n) avisos.push({ id: 'propuestas', nivel: 'aviso', icono: 'bi-robot', texto: `${p.n} ${p.n === 1 ? 'propuesta de tus agentes espera' : 'propuestas de tus agentes esperan'} tu aprobación`, ruta: t.ia_ruta });
  }
  const vistos = new Set();
  const lista = avisos.filter((a) => a?.id && a.texto && !vistos.has(a.id) && vistos.add(a.id))
    .map((a) => ({ id: a.id, nivel: a.nivel || 'info', icono: a.icono || null, texto: a.texto, ruta: a.ruta || null, pregunta: a.pregunta || PREGUNTAS[a.id] || null }))
    .sort((a, b) => (ORDEN[a.nivel] ?? 2) - (ORDEN[b.nivel] ?? 2)).slice(0, 12);
  return { hoy: t.hoy, avisos: lista, urgentes: lista.filter((a) => a.nivel !== 'info').length };
}

// Los avisos en texto, para que el asistente los tenga presentes (pocas líneas: se pagan en cada paso)
export const avisosEnTexto = (avisos) => ((avisos || []).length
  ? `\nLO QUE NECESITA ATENCIÓN HOY (avisos reales del negocio; úsalos si te preguntan qué hay pendiente o si vienen al caso, sin repetirlos todos):\n${avisos.slice(0, 6).map((a) => `- ${a.texto}`).join('\n')}\n`
  : '');

// Agentes y asistente del negocio: la IA trabaja con las herramientas de los módulos activos (las mismas del MCP).
// Un bucle de pasos: el modelo responde SIEMPRE con un JSON, o usa una herramienta o termina. Las herramientas de lectura corren;
// las de escritura se PROPONEN (la persona las aprueba) o se ejecutan, según la autonomía.
import { llamarIA } from '../../lib/ia.js';
import { REG, ejecutarHerramienta, herramientasDe } from '../../lib/registro.js';
import { guiasDe } from '../../lib/guias.js';
import { ctxDeOrg } from '../../lib/contexto.js';
import { all, one, now, today } from '../../lib/crud.js';

const MAX_PASOS = 8;
export { herramientasDe };

const resumenArgs = (schema) => Object.entries(schema?.properties || {}).map(([k, v]) => `${k}${(schema.required || []).includes(k) ? '*' : ''}: ${v.enum ? v.enum.join('|') : v.type || 'texto'}`).join(', ');

const wire = (n) => String(n).replace(/\./g, '_');
// Resumen de las guías de los módulos que usa (el estándar de src/lib/guias.js): qué hace cada uno y sus flujos; la guía completa se pide con la acción «guia»
const guiasResumen = (guias) => (guias.length ? `\nMÓDULOS (cada uno tiene su guía de uso; léela con {"accion":"guia","modulo":"<id>"} antes de usarlo si no lo conoces bien):\n${guias.map((g) => `- ${g.modulo} (${g.nombre}): ${g.guia.slice(0, 220)}${g.guia.length > 220 ? '…' : ''}${g.flujos.length ? ` · flujos: ${g.flujos.map((f) => f.id).join(', ')}` : ''}`).join('\n')}\n` : '');

export function sistemaDeHerramientas({ rol, instrucciones, negocio, herramientas, autonomia, extra = '', guias = [] }) {
  return `${rol}

Trabajas para el negocio «${negocio}». Hoy es ${today()}.
${instrucciones ? `\nINSTRUCCIONES\n${instrucciones}\n` : ''}${extra}${guiasResumen(guias)}
HERRAMIENTAS (usa solo estas; * = obligatorio):
${herramientas.map((t) => `- ${t.name} [${t.tipo}] ${t.description} · args: { ${resumenArgs(t.inputSchema)} }`).join('\n') || '(ninguna)'}

CÓMO RESPONDER: siempre con UN solo objeto JSON, sin texto fuera de él:
{"accion":"usar","herramienta":"<nombre>","args":{...}}   para usar una herramienta
{"accion":"guia","modulo":"<id>"}   para leer la guía de uso de un módulo
{"accion":"fin","respuesta":"<lo que le dices a la persona>"}   cuando ya terminaste
Reglas: no inventes datos ni cifras: si no los tienes, consúltalos con una herramienta. No repitas una herramienta con los mismos argumentos. Máximo ${MAX_PASOS} pasos.
${autonomia === 'ejecutar' ? 'Las herramientas de escritura se ejecutan al instante: úsalas solo cuando estés seguro.' : 'Las herramientas de escritura quedan como PROPUESTA hasta que una persona las apruebe: propónlas y explica por qué en tu respuesta final.'}`;
}

function leerJson(texto) {
  const t = String(texto || '').replace(/```(?:json)?/g, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
}
const corto = (v, n = 5000) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? `${s.slice(0, n)}…` : s; };

// El bucle. Devuelve { respuesta, pasos }. `pasos` guarda lo que se usó y el estado de cada escritura.
export async function bucle(env, { org, ctx, system, historial, herramientas, autonomia, fuente, limite, guias = [] }) {
  const hist = [...historial], pasos = [], usadas = new Set();
  let respuesta = null, invalidos = 0;
  for (let n = 1; n <= MAX_PASOS && respuesta === null; n++) {
    const texto = await llamarIA(env, org, system, hist, { fuente, maxTokens: 900, temperature: 0.3, limite });
    const o = leerJson(texto);
    hist.push({ role: 'assistant', content: texto });
    if (!o || !['usar', 'fin', 'guia'].includes(o.accion)) {
      if (++invalidos >= 2) { respuesta = texto.slice(0, 1500); break; }
      hist.push({ role: 'user', content: 'Respuesta no válida. Responde con UN objeto JSON: {"accion":"usar",...}, {"accion":"guia","modulo":"..."} o {"accion":"fin","respuesta":"..."}.' });
      continue;
    }
    if (o.accion === 'guia') {
      const g = guias.find((d) => d.modulo === o.modulo);
      pasos.push({ n, herramienta: `guía de ${String(o.modulo || '?').slice(0, 40)}`, args: {}, tipo: 'lectura', estado: g ? 'consultada' : 'error', resultado: g ? `${g.nombre}: guía y ${g.flujos.length} flujo(s)` : 'No hay guía de ese módulo' });
      hist.push({ role: 'user', content: g ? `Guía de ${g.nombre}:\n${g.markdown.slice(0, 4000)}` : `No hay guía del módulo «${o.modulo}». Módulos con guía: ${guias.map((d) => d.modulo).join(', ') || 'ninguno'}.` });
      continue;
    }
    if (o.accion === 'fin') { respuesta = String(o.respuesta || 'Listo.').slice(0, 3000); break; }
    const t = herramientas.find((x) => x.name === o.herramienta);
    const args = o.args && typeof o.args === 'object' ? o.args : {};
    const firma = `${o.herramienta}|${JSON.stringify(args)}`;
    if (!t) { pasos.push({ n, herramienta: String(o.herramienta || '?').slice(0, 80), args, estado: 'error', resultado: 'Herramienta no disponible' }); hist.push({ role: 'user', content: `La herramienta «${o.herramienta}» no existe o no está disponible. Usa solo las de la lista.` }); continue; }
    if (usadas.has(firma)) { hist.push({ role: 'user', content: 'Ya usaste esa herramienta con esos argumentos. Usa el resultado que ya tienes o termina.' }); continue; }
    usadas.add(firma);
    if (t.tipo === 'escritura' && autonomia !== 'ejecutar') {
      pasos.push({ n, herramienta: t.name, args, tipo: 'escritura', estado: 'propuesta' });
      hist.push({ role: 'user', content: 'Propuesta registrada: una persona la aprobará. Sigue con lo demás o termina.' });
      continue;
    }
    const r = await ejecutarHerramienta(env, ctx, t.name, args);
    pasos.push({ n, herramienta: t.name, args, tipo: t.tipo, estado: r.ok ? (t.tipo === 'escritura' ? 'hecha' : 'consultada') : 'error', resultado: r.ok ? corto(r.result, 1200) : r.error });
    hist.push({ role: 'user', content: r.ok ? `Resultado de ${t.name}: ${corto(r.result)}` : `Error de ${t.name}: ${r.error}` });
  }
  return { respuesta: respuesta ?? 'No alcancé a terminar en los pasos permitidos.', pasos };
}

/* ---------- agentes ---------- */
const parseList = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };

export async function correrAgente(env, { org, agente, disparador = 'manual', ctx = null, por = null }) {
  ctx ||= await ctxDeOrg(env, org, { role: 'admin' });
  if (!ctx) throw new Error('El negocio aún no usa los módulos');
  const t0 = now();
  const ej = (await env.DB.prepare("INSERT INTO ia_ejecuciones (business_id, agente_id, disparador, estado, por, created_at) VALUES (?, ?, ?, 'en_curso', ?, ?)").bind(org, agente.id, disparador, por, t0).run()).meta.last_row_id;
  let estado = 'ok', resumen = '', pasos = [];
  try {
    const disp = herramientasDe(ctx), elegidas = parseList(agente.herramientas);
    const herr = disp.filter((t) => elegidas.includes(t.name));
    const guias = guiasDe(ctx).filter((g) => herr.some((t) => t.modulo === g.modulo));
    const system = sistemaDeHerramientas({ rol: `Eres «${agente.nombre}», un agente de IA que trabaja solo para el negocio.`, instrucciones: agente.instrucciones, negocio: ctx.business.name || 'el negocio', herramientas: herr, autonomia: agente.autonomia, guias });
    const r = await bucle(env, { org, ctx, system, historial: [{ role: 'user', content: 'Empieza tu trabajo de hoy.' }], herramientas: herr, autonomia: agente.autonomia, fuente: 'agente', guias });
    resumen = r.respuesta; pasos = r.pasos;
  } catch (e) { estado = 'error'; resumen = String(e.message || e).slice(0, 500); }
  const pend = pasos.filter((p) => p.estado === 'propuesta').length;
  await env.DB.prepare('UPDATE ia_ejecuciones SET estado = ?, resumen = ?, pasos = ?, pendientes = ?, terminada_at = ? WHERE id = ?').bind(estado, resumen, JSON.stringify(pasos), pend, now(), ej).run();
  await env.DB.prepare('UPDATE ia_agentes SET ultima_ejecucion = ?, ejecuciones = ejecuciones + 1 WHERE id = ? AND business_id = ?').bind(now(), agente.id, org).run();
  return { id: ej, estado, resumen, pasos, pendientes: pend };
}

// Cada día (3:00 a. m. Colombia): los agentes diarios y, los lunes, los semanales. Sin tocar negocios con la suscripción vencida.
export async function agentesDelDia(env) {
  const lunes = new Date(Date.now() - 5 * 3600000).getUTCDay() === 1;
  const desde = Date.parse(`${today()}T05:00:00Z`);
  const due = await all(env, `SELECT a.* FROM ia_agentes a JOIN orgs o ON o.id = a.business_id WHERE a.activo = 1 AND COALESCE(o.solo_lectura, 0) = 0
    AND (a.programacion = 'diario' ${lunes ? "OR a.programacion = 'semanal'" : ''}) AND COALESCE(a.ultima_ejecucion, 0) < ? ORDER BY a.id LIMIT 25`, desde);
  for (const a of due) { try { await correrAgente(env, { org: a.business_id, agente: a, disparador: 'programado' }); } catch (e) { console.error('agente', a.id, e.message); } }
}

// Aprobar o rechazar una propuesta de una ejecución. `ctx` es el de la persona que aprueba (su rol manda).
export async function resolverPropuesta(env, { org, ejecucionId, indice, aprobar, ctx }) {
  const e = await one(env, 'SELECT * FROM ia_ejecuciones WHERE id = ? AND business_id = ?', ejecucionId, org);
  if (!e) return { status: 404, error: 'No encontrada' };
  const pasos = JSON.parse(e.pasos || '[]'), p = pasos[indice];
  if (!p || p.estado !== 'propuesta') return { status: 409, error: 'Esa propuesta ya se resolvió' };
  if (aprobar) {
    const r = await ejecutarHerramienta(env, ctx, p.herramienta, p.args);
    p.estado = r.ok ? 'hecha' : 'error'; p.resultado = r.ok ? corto(r.result, 1200) : r.error;
    var audit = r.audit;
  } else p.estado = 'rechazada';
  const pend = pasos.filter((x) => x.estado === 'propuesta').length;
  await env.DB.prepare('UPDATE ia_ejecuciones SET pasos = ?, pendientes = ? WHERE id = ?').bind(JSON.stringify(pasos), pend, e.id).run();
  return { status: 200, paso: p, pendientes: pend, audit: audit || [] };
}

/* ---------- asistente interactivo del negocio ---------- */
export async function asistente(env, { org, ctx, mensajes }) {
  const hist = (Array.isArray(mensajes) ? mensajes : []).filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!hist.length || hist[hist.length - 1].role !== 'user') return { status: 400, error: 'Escribe tu pregunta' };
  const herr = herramientasDe(ctx).filter((t) => t.modulo !== 'ai');
  const guias = guiasDe(ctx).filter((g) => g.modulo !== 'ai');
  const system = sistemaDeHerramientas({ guias, rol: 'Eres el asistente de IA del negocio: ayudas al equipo a consultar sus datos y a hacer cosas con las herramientas de sus módulos.', instrucciones: 'Responde en español, claro y breve. Para preguntas sobre el negocio consulta con herramientas antes de contestar.', negocio: ctx.business.name || 'el negocio', herramientas: herr, autonomia: 'proponer' });
  const r = await bucle(env, { org, ctx, system, historial: hist, herramientas: herr, autonomia: 'proponer', fuente: 'asistente', guias });
  return { status: 200, respuesta: r.respuesta, pasos: r.pasos };
}

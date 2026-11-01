// Agentes y asistente del negocio: la IA trabaja con las herramientas de los módulos activos (las mismas del MCP).
// Un bucle de pasos: el modelo responde SIEMPRE con un JSON, o usa una herramienta o termina. Las herramientas de lectura corren;
// las de escritura se PROPONEN (la persona las aprueba) o se ejecutan, según la autonomía.
import { HttpError } from '../../lib/http.js';
import { llamarIA, ajustesDe } from '../../lib/ia.js';
import { REG, ejecutarHerramienta, herramientasDe } from '../../lib/registro.js';
import { guiasDe } from '../../lib/guias.js';
import { flujosEntre, flujosEnTexto } from '../../lib/flujos.js';
import { ctxDeOrg } from '../../lib/contexto.js';
import { all, one, now, today } from '../../lib/crud.js';

const MAX_PASOS = 8, MAX_PASOS_AGENTE = 16, STALE = 15 * 60000;   // el asistente da 8 pasos; un agente, 16
export { herramientasDe };

const resumenArgs = (schema) => Object.entries(schema?.properties || {}).map(([k, v]) => `${k}${(schema.required || []).includes(k) ? '*' : ''}: ${v.enum ? v.enum.join('|') : v.type || 'texto'}`).join(', ');

const wire = (n) => String(n).replace(/\./g, '_');
// Resumen de las guías de los módulos que usa (el estándar de src/lib/guias.js): qué hace cada uno y sus flujos; la guía completa se pide con la acción «guia»
const guiasResumen = (guias) => (guias.length ? `\nMÓDULOS (cada uno tiene su guía de uso; léela con {"accion":"guia","modulo":"<id>"} antes de usarlo si no lo conoces bien):\n${guias.map((g) => `- ${g.modulo} (${g.nombre}): ${g.guia.slice(0, 220)}${g.guia.length > 220 ? '…' : ''}${g.flujos.length ? ` · flujos: ${g.flujos.map((f) => f.id).join(', ')}` : ''}`).join('\n')}\n` : '');

// Las «Estrategias»: lo que la persona dejó dicho en el agente de cada módulo. El asistente las respeta cuando trabaja en ese módulo.
const estrategiasResumen = (est) => (est.length ? `\nESTRATEGIAS DEL NEGOCIO (lo que la persona pidió para cada módulo; respétalo cuando trabajes en él):\n${est.map((e) => `- ${e.modulo}: ${String(e.instrucciones).replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')}\n` : '');

export function sistemaDeHerramientas({ maxPasos = MAX_PASOS, flujos = [], rol, instrucciones, negocio, herramientas, autonomia, extra = '', guias = [], estrategias = [] }) {
  return `${rol}

Trabajas para el negocio «${negocio}». Hoy es ${today()}.
${instrucciones ? `\nINSTRUCCIONES\n${instrucciones}\n` : ''}${extra}${estrategiasResumen(estrategias)}${guiasResumen(guias)}${flujosEnTexto(flujos)}
HERRAMIENTAS (usa solo estas; * = obligatorio):
${herramientas.map((t) => `- ${t.name} [${t.tipo}] ${t.description} · args: { ${resumenArgs(t.inputSchema)} }`).join('\n') || '(ninguna)'}

CÓMO RESPONDER: siempre con UN solo objeto JSON, sin texto fuera de él:
{"accion":"usar","herramienta":"<nombre>","args":{...}}   para usar una herramienta
{"accion":"guia","modulo":"<id>"}   para leer la guía de uso de un módulo
{"accion":"fin","respuesta":"<lo que le dices a la persona>","siguientes":["<pregunta corta>","<otra>"]}   cuando ya terminaste (siguientes es opcional: 2 o 3 preguntas de seguimiento MUY cortas, de máximo 40 caracteres, que la persona probablemente quiera hacer después)
Reglas: no inventes datos ni cifras: si no los tienes, consúltalos con una herramienta. No repitas una herramienta con los mismos argumentos. Máximo ${maxPasos} pasos.
${autonomia === 'ejecutar' ? 'Las herramientas de escritura se ejecutan al instante: úsalas solo cuando estés seguro.' : 'Las herramientas de escritura quedan como PROPUESTA hasta que una persona las apruebe: propónlas y explica por qué en tu respuesta final.'}`;
}

function leerJson(texto) {
  const t = String(texto || '').replace(/```(?:json)?/g, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  const crudo = t.slice(i, j + 1);
  try { return JSON.parse(crudo); } catch { /* sigue: los modelos suelen dejar saltos de línea sin escapar dentro del texto */ }
  // Reparación: dentro de un texto entre comillas, los saltos de línea y tabulaciones se escapan
  let fix = '', dentro = false, esc = false;
  for (const ch of crudo) {
    if (esc) { fix += ch; esc = false; continue; }
    if (ch === '\\') { fix += ch; esc = true; continue; }
    if (ch === '"') dentro = !dentro;
    fix += dentro && ch === '\n' ? '\\n' : dentro && ch === '\r' ? '' : dentro && ch === '\t' ? '\\t' : ch;
  }
  try { return JSON.parse(fix); } catch { /* último recurso: sacar la respuesta a mano */ }
  const m = /"accion"\s*:\s*"fin"[\s\S]*?"respuesta"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"siguientes"[\s\S]*)?\}\s*$/.exec(crudo);
  return m ? { accion: 'fin', respuesta: m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') } : null;
}
// Un agente trabaja solo: sin esto, algunos modelos se presentan y cierran tras leer la marca sin hacer el trabajo
const TRABAJO_COMPLETO = '\nIMPORTANTE: eres un agente que trabaja solo. No te presentes ni saludes: haz el trabajo completo de tus INSTRUCCIONES, paso a paso, con las herramientas, y usa "fin" solo cuando hayas entregado el resultado final (ideas, textos, borradores o propuestas de acción). La respuesta final puede ser larga y detallada.\n';
const corto = (v, n = 4000) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? `${s.slice(0, n)}…` : s; };

// El bucle. Devuelve { respuesta, pasos }. `pasos` guarda lo que se usó y el estado de cada escritura.
export async function bucle(env, { org, ctx, system, historial, herramientas, autonomia, fuente, limite, guias = [], maxPasos = MAX_PASOS, topeTokens = 0, progreso = null, maxTokens = 900 }) {
  const hist = [...historial], pasos = [], usadas = new Set();
  let respuesta = null, invalidos = 0, gastados = 0, siguientes = [];
  const est = (t) => Math.ceil(String(t || '').length / 4);
  const avisar = async (actual) => { try { await progreso?.({ pasos, actual }); } catch (_) {} };   // paso a paso visible
  for (let n = 1; n <= maxPasos && respuesta === null; n++) {
    // Memoria recortada: los resultados viejos se resumen para no pagarlos una y otra vez en cada paso
    if (hist.length > 6) for (let i = 1; i < hist.length - 4; i++) if (hist[i].role === 'user' && /^(Resultado de|Guía de)/.test(hist[i].content) && hist[i].content.length > 500) hist[i] = { role: 'user', content: `${hist[i].content.slice(0, 400)}… (recortado)` };
    gastados += est(system) + hist.reduce((a, m) => a + est(m.content), 0);
    if (topeTokens && gastados >= topeTokens) { respuesta = `Paré al llegar al tope de ${topeTokens.toLocaleString('es-CO')} tokens por ejecución. Esto es lo que alcancé a hacer.`; break; }
    await avisar(n === 1 ? 'Entendiendo tu pedido…' : 'Pensando el siguiente paso…');
    const texto = await llamarIA(env, org, system, hist, { fuente, maxTokens, temperature: 0.3, limite });
    const o = leerJson(texto);
    hist.push({ role: 'assistant', content: texto });
    if (!o || !['usar', 'fin', 'guia'].includes(o.accion)) {
      if (++invalidos >= 2) { respuesta = texto.slice(0, 6000); break; }
      hist.push({ role: 'user', content: 'Respuesta no válida. Responde con UN objeto JSON: {"accion":"usar",...}, {"accion":"guia","modulo":"..."} o {"accion":"fin","respuesta":"..."}.' });
      continue;
    }
    if (o.accion === 'guia') {
      const g = guias.find((d) => d.modulo === o.modulo);
      pasos.push({ n, herramienta: `guía de ${String(o.modulo || '?').slice(0, 40)}`, args: {}, tipo: 'lectura', estado: g ? 'consultada' : 'error', resultado: g ? `${g.nombre}: guía y ${g.flujos.length} flujo(s)` : 'No hay guía de ese módulo' });
      hist.push({ role: 'user', content: g ? `Guía de ${g.nombre}:\n${g.markdown.slice(0, 4000)}` : `No hay guía del módulo «${o.modulo}». Módulos con guía: ${guias.map((d) => d.modulo).join(', ') || 'ninguno'}.` });
      continue;
    }
    if (o.accion === 'fin') { respuesta = String(o.respuesta || 'Listo.').slice(0, 8000); siguientes = (Array.isArray(o.siguientes) ? o.siguientes : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 48).slice(0, 3); break; }
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
    await avisar(`${t.tipo === 'escritura' ? 'Haciendo' : 'Consultando'}: ${t.name}`);
    const r = await ejecutarHerramienta(env, ctx, t.name, args);
    pasos.push({ n, herramienta: t.name, args, tipo: t.tipo, estado: r.ok ? (t.tipo === 'escritura' ? 'hecha' : 'consultada') : 'error', resultado: r.ok ? corto(r.result, 1200) : r.error });
    hist.push({ role: 'user', content: r.ok ? `Resultado de ${t.name}: ${corto(r.result)}` : `Error de ${t.name}: ${r.error}` });
  }
  return { respuesta: respuesta ?? 'No alcancé a terminar en los pasos permitidos.', pasos, siguientes };
}

/* ---------- agentes ---------- */
const parseList = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };

export async function correrAgente(env, { org, agente, disparador = 'manual', ctx = null, por = null, pedido = '', progresoId = null }) {
  ctx ||= await ctxDeOrg(env, org, { role: 'admin' });
  if (!ctx) throw new Error('El negocio aún no usa los módulos');
  // Uno a la vez: si ya está trabajando no arranca otro; las ejecuciones cortadas hace más de 15 minutos se cierran solas
  await env.DB.prepare("UPDATE ia_ejecuciones SET estado = 'error', resumen = 'Se interrumpió antes de terminar', terminada_at = ? WHERE agente_id = ? AND business_id = ? AND estado = 'en_curso' AND created_at < ?").bind(now(), agente.id, org, now() - STALE).run();
  if (await one(env, "SELECT 1 FROM ia_ejecuciones WHERE agente_id = ? AND business_id = ? AND estado = 'en_curso'", agente.id, org)) throw new HttpError(409, 'Este agente ya está trabajando. Espera a que termine.');
  const aj = await ajustesDe(env, org), t0 = now();
  const ej = (await env.DB.prepare("INSERT INTO ia_ejecuciones (business_id, agente_id, disparador, estado, por, created_at) VALUES (?, ?, ?, 'en_curso', ?, ?)").bind(org, agente.id, disparador, por, t0).run()).meta.last_row_id;
  let estado = 'ok', resumen = '', pasos = [];
  const escribir = escritor(env, org, progresoId);
  try {
    const disp = herramientasDe(ctx), elegidas = parseList(agente.herramientas);
    const herr = disp.filter((t) => elegidas.includes(t.name));
    const guias = guiasDe(ctx).filter((g) => herr.some((t) => t.modulo === g.modulo));
    const system = sistemaDeHerramientas({ maxPasos: MAX_PASOS_AGENTE, flujos: flujosEntre(herr), rol: `Eres «${agente.nombre}», un agente de IA que trabaja solo para el negocio.`, instrucciones: agente.instrucciones || (agente.auto ? 'Revisa cómo va este módulo con las herramientas de consulta y propón lo más útil que se pueda mejorar o atender hoy.' : ''), negocio: ctx.business.name || 'el negocio', herramientas: herr, autonomia: agente.autonomia, guias, extra: TRABAJO_COMPLETO });
    const r = await bucle(env, { org, ctx, system, historial: [{ role: 'user', content: pedido ? `Empieza tu trabajo. Pedido puntual para esta vez: ${String(pedido).slice(0, 500)}` : 'Empieza tu trabajo de hoy.' }], herramientas: herr, autonomia: agente.autonomia, fuente: 'agente', guias, maxPasos: MAX_PASOS_AGENTE, topeTokens: aj.tope_ejecucion, maxTokens: 3000,
      progreso: escribir ? (info) => escribir('trabajando', info) : null });
    resumen = r.respuesta; pasos = r.pasos;
  } catch (e) { estado = 'error'; resumen = String(e.message || e).slice(0, 500); }
  await escribir?.(estado === 'error' ? 'error' : 'listo', { pasos, actual: estado === 'error' ? resumen.slice(0, 200) : null }).catch(() => {});
  const pend = pasos.filter((p) => p.estado === 'propuesta').length;
  await env.DB.prepare('UPDATE ia_ejecuciones SET estado = ?, resumen = ?, pasos = ?, pendientes = ?, terminada_at = ? WHERE id = ?').bind(estado, resumen, JSON.stringify(pasos), pend, now(), ej).run();
  await env.DB.prepare('UPDATE ia_agentes SET ultima_ejecucion = ?, ejecuciones = ejecuciones + 1 WHERE id = ? AND business_id = ?').bind(now(), agente.id, org).run();
  return { id: ej, estado, resumen, pasos, pendientes: pend };
}

// Cada día (3:00 a. m. Colombia): los agentes diarios y, los lunes, los semanales. Sin tocar negocios con la suscripción vencida.
// Los de Diwilo (diwilo:diwilo) los dispara Diwilo Web Admin en su cron, porque sus herramientas propias (blog, videos) viven allá.
export async function agentesDelDia(env) {
  const lunes = new Date(Date.now() - 5 * 3600000).getUTCDay() === 1;
  const desde = Date.parse(`${today()}T05:00:00Z`);
  const due = await all(env, `SELECT a.* FROM ia_agentes a JOIN orgs o ON o.id = a.business_id WHERE a.activo = 1 AND a.business_id != 'diwilo:diwilo' AND COALESCE(o.solo_lectura, 0) = 0
    AND (a.programacion = 'diario' ${lunes ? "OR a.programacion = 'semanal'" : ''}) AND COALESCE(a.ultima_ejecucion, 0) < ? ORDER BY a.id LIMIT 25`, desde);
  for (const a of due) { try { await correrAgente(env, { org: a.business_id, agente: a, disparador: 'programado' }); } catch (e) { console.error('agente', a.id, e.message); } }
}


/* ---------- agente automático por módulo ---------- */
// Cada módulo activo (central o propio de la app) con herramientas tiene SIEMPRE su agente (auto = 1): sin crearlo a mano. Lo único que escribe la persona es su «Estrategia»
// (el campo instrucciones). Es autocorrectivo: se llama antes de listar agentes y antes del asistente. Nunca toca la Estrategia de uno que ya existe.
const SIN_AGENTE = new Set(['ai', 'dashboard']);
const nombreDeModulo = (id) => REG.manifests?.find((m) => m.id === id)?.nombre || id.charAt(0).toUpperCase() + id.slice(1);
export async function asegurarAgentesDeModulo(env, ctx, org) {
  const porModulo = new Map();
  for (const t of herramientasDe({ ...ctx, role: 'owner' })) if (t.modulo && !SIN_AGENTE.has(t.modulo)) (porModulo.get(t.modulo) || porModulo.set(t.modulo, []).get(t.modulo)).push(t.name);
  if (!porModulo.size) return;
  const hay = new Map((await all(env, 'SELECT modulo, herramientas FROM ia_agentes WHERE business_id = ? AND modulo IS NOT NULL', org)).map((r) => [r.modulo, r.herramientas]));
  const t = now(), lote = [];
  for (const [modulo, nombres] of porModulo) {
    const herr = JSON.stringify(nombres);
    if (!hay.has(modulo)) lote.push(env.DB.prepare("INSERT OR IGNORE INTO ia_agentes (business_id, nombre, instrucciones, herramientas, programacion, autonomia, activo, modulo, auto, created_at, updated_at) VALUES (?, ?, '', ?, 'manual', 'proponer', 1, ?, 1, ?, ?)").bind(org, `Agente de ${nombreDeModulo(modulo)}`, herr, modulo, t, t));
    else if (hay.get(modulo) !== herr) lote.push(env.DB.prepare('UPDATE ia_agentes SET herramientas = ?, updated_at = ? WHERE business_id = ? AND modulo = ? AND auto = 1').bind(herr, t, org, modulo));
  }
  if (lote.length) await env.DB.batch(lote);
}

export const estrategiasDe = (env, org) => all(env, "SELECT modulo, instrucciones FROM ia_agentes WHERE business_id = ? AND activo = 1 AND modulo IS NOT NULL AND TRIM(instrucciones) != '' ORDER BY modulo", org);

// Lo usa la herramienta ai.gestionar_agente_modulo: IA Diwilo cambia la Estrategia, si está activo, cuándo corre y si propone o actúa solo. Solo toca los campos que lleguen.
export async function editarAgenteDeModulo(env, ctx, org, { modulo, instrucciones, activo, programacion, autonomia }) {
  await asegurarAgentesDeModulo(env, ctx, org);
  const a = await one(env, 'SELECT * FROM ia_agentes WHERE business_id = ? AND modulo = ?', org, String(modulo || ''));
  if (!a) throw new HttpError(404, `No hay agente para el módulo «${modulo}». Usa el id de un módulo activo.`);
  const set = [], val = [];
  if (instrucciones !== undefined) { const v = String(instrucciones).trim(); if (v.length > 4000) throw new HttpError(400, 'La Estrategia es muy larga (máximo 4000 letras)'); set.push('instrucciones = ?'); val.push(v); }
  if (activo !== undefined) { set.push('activo = ?'); val.push(activo === true || activo === 1 || activo === 'true' ? 1 : 0); }
  if (programacion !== undefined) { if (!['manual', 'diario', 'semanal'].includes(programacion)) throw new HttpError(400, 'programacion: manual, diario o semanal'); set.push('programacion = ?'); val.push(programacion); }
  if (autonomia !== undefined) { if (!['proponer', 'ejecutar'].includes(autonomia)) throw new HttpError(400, 'autonomia: proponer o ejecutar'); set.push('autonomia = ?'); val.push(autonomia); }
  if (!set.length) throw new HttpError(400, 'No hay nada que cambiar');
  await env.DB.prepare(`UPDATE ia_agentes SET ${set.join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...val, now(), a.id, org).run();
  const n = await one(env, 'SELECT id, nombre, modulo, instrucciones, activo, programacion, autonomia FROM ia_agentes WHERE id = ?', a.id);
  return { agente: { ...n, estrategia: n.instrucciones, activo: !!n.activo } };
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

// El paso a paso se guarda en ia_progreso para que la pantalla lo muestre mientras la IA trabaja (asistente y agentes)
export const escritor = (env, org, id) => (id ? async (estado, { pasos = [], actual = null }) => {
  await env.DB.prepare(`INSERT INTO ia_progreso (id, business_id, estado, actual, pasos, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET estado = excluded.estado, actual = excluded.actual, pasos = excluded.pasos, updated_at = excluded.updated_at WHERE business_id = excluded.business_id`).bind(id, org, estado, actual, JSON.stringify(pasos.map(({ n, herramienta, tipo, estado: e }) => ({ n, herramienta, tipo, estado: e }))), now()).run();
} : null);


// Cómo debe hablar el asistente: simple, corto y útil (lo ve una persona con prisa, muchas veces desde el celular).
const ESTILO = `ESTILO DE RESPUESTA
- Empieza por lo que importa: la respuesta o la cifra, en la primera línea. Después, solo el detalle necesario.
- Corto: máximo unas 6 líneas. Usa viñetas cortas ("- ") para listas y no más de 5 elementos; si hay más, di cuántos hay y ofrece verlos.
- Lenguaje simple y cercano, sin jerga técnica. Nunca muestres nombres de herramientas, ids, JSON ni códigos internos: habla de personas, cursos, cuentas, fechas y valores.
- Dinero en pesos colombianos con puntos: $1.250.000. Fechas en español: 22 de octubre. Porcentajes redondeados.
- Si falta un dato para actuar, haz UNA sola pregunta corta; si hay una opción razonable, elígela y dilo en una frase.
- Si no encuentras algo, dilo claro ("No encontré a Laura") y propón el siguiente paso en una línea.
- Para cambiar datos: di en una frase qué vas a hacer y propón la acción; nunca la des por hecha antes de la confirmación.
- No repitas la pregunta ni te disculpes de más. No inventes: si no lo consultaste, no lo afirmes.
- Al final, ofrece 2 o 3 "siguientes" (preguntas de menos de 40 caracteres) que la persona probablemente quiera hacer después.`;

/* ---------- asistente interactivo del negocio ---------- */
// Con `agente`: conversa como EL agente de un módulo (solo sus herramientas, su Estrategia y lo que ha hecho); sin él, es IA Diwilo (todos los módulos).
export async function asistente(env, { org, ctx, mensajes, progresoId = null, agente = null }) {
  const hist = (Array.isArray(mensajes) ? mensajes : []).filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!hist.length || hist[hist.length - 1].role !== 'user') return { status: 400, error: 'Escribe tu pregunta' };
  await asegurarAgentesDeModulo(env, ctx, org).catch((e) => console.error('agentes de módulo', e.message));
  let herr = herramientasDe(ctx).filter((t) => t.modulo !== 'ai' || t.tipo === 'lectura' || t.name === 'ai.gestionar_agente_modulo');   // IA Diwilo SÍ puede gestionar los agentes de módulo (siempre como propuesta)
  let guias = guiasDe(ctx).filter((g) => g.modulo !== 'ai'), estrategias = await estrategiasDe(env, org).catch(() => []);
  let rol = 'Eres el asistente de IA del negocio: ayudas al equipo a consultar sus datos y a hacer cosas con las herramientas de sus módulos.', instrucciones = `Responde en español. Para preguntas sobre el negocio consulta con herramientas antes de contestar.\n\n${ESTILO}`;
  if (agente) {
    const mias = new Set(parseList(agente.herramientas));
    herr = herr.filter((t) => mias.has(t.name) && t.modulo !== 'ai');
    guias = guias.filter((g) => g.modulo === agente.modulo); estrategias = [];
    const ult = await all(env, 'SELECT estado, resumen, created_at FROM ia_ejecuciones WHERE agente_id = ? AND business_id = ? ORDER BY id DESC LIMIT 5', agente.id, org);
    rol = `Eres «${agente.nombre}», el agente de IA del módulo ${nombreDeModulo(agente.modulo || '')} de este negocio. Conversas con el equipo: cuentas qué has hecho, qué hay pendiente y haces o propones lo que te piden, solo con las herramientas de tu módulo.`;
    instrucciones = `Responde en español.${agente.instrucciones ? `\n\nTU ESTRATEGIA (lo que la persona dejó dicho para ti; respétala):\n${agente.instrucciones}` : ''}
\nLO ÚLTIMO QUE HICISTE (tus ejecuciones, de la más reciente a la más antigua; si te preguntan qué has hecho, respóndelo con esto y con herramientas de lectura):\n${ult.length ? ult.map((u) => `- ${new Date(u.created_at - 5 * 3600000).toISOString().slice(0, 16).replace('T', ' ')} · ${u.estado}: ${String(u.resumen || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n') : '(aún no has trabajado)'}\n\n${ESTILO}`;
  }
  const system = sistemaDeHerramientas({ guias, estrategias, flujos: flujosEntre(herr), rol, instrucciones, negocio: ctx.business.name || 'el negocio', herramientas: herr, autonomia: 'proponer' });
  const escribir = escritor(env, org, progresoId);
  if (escribir) await env.DB.prepare('DELETE FROM ia_progreso WHERE updated_at < ?').bind(now() - 86400000).run().catch(() => {});
  try {
    const r = await bucle(env, { org, ctx, system, historial: hist, herramientas: herr, autonomia: 'proponer', fuente: 'asistente', guias, progreso: escribir ? (info) => escribir('trabajando', info) : null });
    await escribir?.('listo', { pasos: r.pasos });
    return { status: 200, respuesta: r.respuesta, pasos: r.pasos, siguientes: r.siguientes || [] };
  } catch (e) { await escribir?.('error', { actual: String(e.message || e).slice(0, 200) }).catch(() => {}); throw e; }
}

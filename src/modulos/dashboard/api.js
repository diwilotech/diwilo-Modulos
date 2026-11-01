// Dashboard (módulo base de todas las apps): el inicio del negocio. Muestra los indicadores (widgets) y alertas que cada módulo EMPUJÓ (src/lib/tablero.js,
// tabla dashboard_estado) y arma los accesos directos. Ver: todo el equipo. No llama en vivo a los demás módulos.
//   GET /api/dashboard   { negocio, widgets: [{ modulo, titulo, valor, detalle, icono, ruta }], alertas: [{ id, nivel, icono, texto, ruta }], atajos: [{ nombre, icono, ruta }], agentes: [{ modulo, nombre, icono, ruta }], ia_ruta }
// Las apps suman a esto sus propios indicadores (módulos propios) en su pantalla; el módulo solo conoce los centrales.
import { json } from '../../lib/http.js';
import { all } from '../../lib/crud.js';
import { limpiarInicio } from '../../lib/inicio.js';
import { REG } from '../../lib/registro.js';
import { leerTablero, refrescarTablero } from '../../lib/tablero.js';
import { ctxDeOrg } from '../../lib/contexto.js';
import { asegurarAgentesDeModulo } from '../ai/agentes.js';

const MOD = 'dashboard', B = '/api/dashboard', RANK = { staff: 1, admin: 2, owner: 3 };

// Los módulos centrales activos con su manifiesto (el dashboard y los base no aportan indicadores)
const activos = (c) => (REG.manifests || []).filter((m) => m.id !== MOD && (!c.ctx?.modulos || c.ctx.modulos.includes(m.id) || m.base) && (RANK[c.role] || 0) >= (RANK[m.permisos?.ver || 'staff'] || 1));

export async function tablero(c) {
  const mods = activos(c);
  // Inicio ya no busca: lee lo último que cada módulo empujó (dashboard_estado). Un módulo central que aún no empujó nada se calcula una vez y queda guardado.
  let estado = await leerTablero(c.env, c.businessId);
  const faltan = mods.filter((m) => !estado[m.id]);
  if (faltan.length) { await Promise.all(faltan.map((m) => refrescarTablero(c.env, c.ctx, m.id))); estado = await leerTablero(c.env, c.businessId); }
  const propios = Object.keys(estado).filter((id) => !REG.manifests?.some((m) => m.id === id) && (!c.ctx?.modulos || c.ctx.modulos.includes(id)));   // módulos propios de la app que empujan por RPC
  const widgets = [...mods.map((m) => m.id), ...propios].flatMap((id) => estado[id]?.widgets || []);
  const alertas = [...mods.map((m) => m.id), ...propios].flatMap((id) => estado[id]?.alertas || []);
  if (c.readOnly) alertas.unshift({ id: 'vencida', nivel: 'mala', icono: 'bi-lock', texto: 'La suscripción está vencida: la app está en solo lectura', ruta: null });
  const orden = { mala: 0, aviso: 1, info: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

  // Módulos centrales que pueden tener agente propio (los de la app salen de me.modules en la pantalla)
  const agentes = mods.filter((m) => !m.base && m.menu?.ruta && !m.menu.oculto).map((m) => ({ modulo: m.id, nombre: m.nombre, icono: m.icono, ruta: m.menu.ruta }));
  const atajos = mods.filter((m) => m.menu?.ruta && !m.menu.oculto).map((m) => ({ nombre: m.nombre, icono: m.icono, ruta: m.menu.ruta }));
  return { negocio: { nombre: c.ctx?.business?.name || null, tema: c.ctx?.business?.tema || null, sede: c.ctx?.sede || null }, hoy: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10), widgets, alertas, atajos, agentes, ia_ruta: REG.manifests?.find((m) => m.id === 'ai')?.menu?.ruta || null };
}

// Línea de negocio de cada app (figura de «Así funciona tu negocio»). Sin línea, el Inicio no muestra el bloque.
const LINEA_DE = { cdacademia: 'educacion', cdresidentes: 'propiedad', diwilo: 'servicios' };
export async function figura(c) {
  const linea = LINEA_DE[c.ctx?.app] || null;
  const desde = Number(c.url.searchParams.get('desde')) || 0;
  const filas = linea ? await all(c.env, 'SELECT id, tipo, creado_en FROM inicio_eventos WHERE business_id = ? AND id > ? ORDER BY id DESC LIMIT 20', c.businessId, desde) : [];
  const ultimo = filas.length ? filas[0].id : desde;
  return { linea, movimientos: filas.reverse(), ultimo };
}

// Agentes del negocio con su actividad real de los últimos 7 días (ia_ejecuciones). Cada agente de módulo trae su `modulo` exacto (auto = lo creó el sistema); los libres (modulo null) se emparejan por el prefijo de sus herramientas.
export async function agentesInicio(c) {
  await asegurarAgentesDeModulo(c.env, { ...c.ctx, role: 'owner' }, c.businessId).catch((e) => console.error('agentes de módulo', e.message));   // cada módulo activo ya tiene su agente
  const DIA = 86400000, col = (t) => new Date(t - 5 * 3600000).toISOString().slice(0, 10);
  const hoy = Date.now(), dias = Array.from({ length: 7 }, (_, i) => col(hoy - (6 - i) * DIA));
  const ags = await all(c.env, 'SELECT id, nombre, herramientas, autonomia, programacion, modulo, auto FROM ia_agentes WHERE business_id = ? AND activo = 1 ORDER BY id', c.businessId);
  const ej = await all(c.env, 'SELECT id, agente_id, estado, resumen, pendientes, pasos, created_at FROM ia_ejecuciones WHERE business_id = ? AND created_at > ? ORDER BY id DESC LIMIT 300', c.businessId, hoy - 7 * DIA);
  const lista = (x) => { try { const a = JSON.parse(x); return Array.isArray(a) ? a.filter((n) => typeof n === 'string') : []; } catch { return []; } };
  return {
    ia_ruta: REG.manifests?.find((m) => m.id === 'ai')?.menu?.ruta || null,
    agentes: ags.map((a) => {
      const mias = ej.filter((e) => e.agente_id === a.id), semana = dias.map(() => 0);
      let hechas = 0;
      for (const e of mias) {
        const i = dias.indexOf(col(e.created_at)); if (i >= 0) semana[i]++;
        try { hechas += JSON.parse(e.pasos || '[]').filter((p) => p.estado === 'hecha').length; } catch { /* paso ilegible */ }
      }
      return { id: a.id, nombre: a.nombre, modulo: a.modulo || null, auto: !!a.auto, herramientas: lista(a.herramientas), autonomia: a.autonomia, programacion: a.programacion, estado: mias[0]?.estado || null,
        pendientes: mias.reduce((n, e) => n + (e.pendientes || 0), 0), total: mias.length, hechas, errores: mias.filter((e) => e.estado === 'error').length, semana, dias,
        recientes: mias.slice(0, 4).map((e) => ({ estado: e.estado, texto: String(e.resumen || '').slice(0, 160), cuando: e.created_at })) };
    }),
  };
}

// Cada día: los movimientos de la figura se guardan 30 días y cada módulo recalcula su estado (las alertas por fechas, como «vencido», no se quedan viejas sin una escritura nueva)
export async function daily(env) {
  await limpiarInicio(env);
  const orgs = await all(env, "SELECT id FROM orgs WHERE COALESCE(solo_lectura, 0) = 0 ORDER BY id LIMIT 300");
  for (const o of orgs) {
    const ctx = await ctxDeOrg(env, o.id, { role: 'admin' });
    if (!ctx) continue;
    for (const m of (REG.manifests || []).filter((x) => x.id !== MOD && (!ctx.modulos || ctx.modulos.includes(x.id) || x.base))) await refrescarTablero(env, ctx, m.id);
  }
}

export function routes(r) {
  r.get(`${B}/agentes`, `tenant:${MOD}`, async (c) => json(await agentesInicio(c)));
  r.get(`${B}/figura`, `tenant:${MOD}`, async (c) => json(await figura(c)));
  r.get(B, `tenant:${MOD}`, async (c) => json(await tablero(c)));
}

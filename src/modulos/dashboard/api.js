// Dashboard (módulo base de todas las apps): el inicio del negocio. Junta los indicadores (widgets) de los módulos centrales activos,
// calcula las alertas que necesitan atención y arma los accesos directos. Ver: todo el equipo. No guarda datos propios.
//   GET /api/dashboard   { negocio, widgets: [{ modulo, titulo, valor, detalle, icono, ruta }], alertas: [{ id, nivel, icono, texto, ruta }], atajos: [{ nombre, icono, ruta }], agentes: [{ modulo, nombre, icono, ruta }], ia_ruta }
// Las apps suman a esto sus propios indicadores (módulos propios) en su pantalla; el módulo solo conoce los centrales.
import { json } from '../../lib/http.js';
import { all } from '../../lib/crud.js';
import { limpiarInicio } from '../../lib/inicio.js';
import { REG } from '../../lib/registro.js';
import { llamar } from '../../lib/interno.js';
import { brandOf } from '../../lib/marca.js';
import { ajustesDe, usoDelDia } from '../../lib/ia.js';

const MOD = 'dashboard', B = '/api/dashboard', RANK = { staff: 1, admin: 2, owner: 3 };
const peso = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;

// Los módulos centrales activos con su manifiesto (el dashboard y los base no aportan indicadores)
const activos = (c) => (REG.manifests || []).filter((m) => m.id !== MOD && (!c.ctx?.modulos || c.ctx.modulos.includes(m.id) || m.base) && (RANK[c.role] || 0) >= (RANK[m.permisos?.ver || 'staff'] || 1));

export async function tablero(c) {
  const mods = activos(c), alertas = [];
  const ok = async (f) => { try { return await f(); } catch { return null; } };
  // Indicadores: la misma API que ya usan las apps para sus widgets
  const widgets = (await Promise.all(mods.flatMap((m) => (m.widgets || []).map(async (w) => {
    const d = await ok(() => llamar(c, 'GET', w.api));
    return d ? { modulo: m.id, nombre: m.nombre, titulo: d.titulo || m.nombre, valor: d.valor ?? '—', detalle: d.detalle || '', icono: d.icono || m.icono, ruta: d.ruta || m.menu?.ruta || null } : null;
  })))).filter(Boolean);

  // Alertas con datos del negocio (cada una lleva a la pantalla donde se resuelve)
  const ids = new Set(mods.map((m) => m.id));
  if (ids.has('marketing')) {
    const s = await ok(() => llamar(c, 'GET', '/api/marketing/summary'));
    if (s?.tasks?.overdue) alertas.push({ id: 'tareas', nivel: 'mala', icono: 'bi-alarm', texto: `${s.tasks.overdue} tarea${s.tasks.overdue === 1 ? '' : 's'} vencida${s.tasks.overdue === 1 ? '' : 's'} en Marketing`, ruta: '/staff/marketing.html' });
    const nuevos = s?.contacts?.new ?? 0;
    if (nuevos) alertas.push({ id: 'leads', nivel: 'info', icono: 'bi-person-plus', texto: `${nuevos} contacto${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'} en los últimos 30 días`, ruta: '/staff/marketing.html' });
  }
  if (ids.has('finanzas')) {
    const s = await ok(() => llamar(c, 'GET', '/api/finanzas/summary'));
    if (s?.receivable?.overdue) alertas.push({ id: 'cartera', nivel: 'mala', icono: 'bi-cash-coin', texto: `${peso(s.receivable.overdue)} vencidos por cobrar`, ruta: '/staff/finanzas.html' });
    if (s?.payable?.overdue) alertas.push({ id: 'pagos', nivel: 'aviso', icono: 'bi-receipt', texto: `${peso(s.payable.overdue)} vencidos por pagar`, ruta: '/staff/finanzas.html' });
  }
  if (ids.has('whatsapp')) {
    const s = await ok(() => llamar(c, 'GET', '/api/whatsapp/resumen'));
    if (s?.rojos) alertas.push({ id: 'mensajes-rojo', nivel: 'mala', icono: 'bi-chat-dots', texto: `${s.rojos} chat${s.rojos === 1 ? '' : 's'} en Mensajes necesita${s.rojos === 1 ? '' : 'n'} a una persona`, ruta: '/staff/whatsapp.html' });
    else if (s?.sin_responder) alertas.push({ id: 'mensajes-pend', nivel: 'info', icono: 'bi-chat-left-text', texto: `${s.sin_responder} chat${s.sin_responder === 1 ? '' : 's'} sin responder hoy en Mensajes`, ruta: '/staff/whatsapp.html' });
  }
  const marca = await ok(() => brandOf(c.env, c.businessId));
  if (marca && (!marca.tiene_logo || !marca.descripcion)) alertas.push({ id: 'marca', nivel: 'info', icono: 'bi-palette', texto: !marca.tiene_logo ? 'Sube el logo de tu marca: sale en el menú, en la bienvenida y en el kit' : 'Cuenta en una frase qué hace tu negocio: la IA la usa para hablar de él', ruta: '/staff/marca.html' });
  const ia = await ok(async () => { const [aj, hoy] = await Promise.all([ajustesDe(c.env, c.businessId), usoDelDia(c.env, c.businessId)]); return { tope: aj.tope_tokens, usados: (hoy.tin || 0) + (hoy.tout || 0) }; });
  if (ia?.tope && ia.usados / ia.tope >= 0.8) alertas.push({ id: 'ia', nivel: ia.usados >= ia.tope ? 'mala' : 'aviso', icono: 'bi-robot', texto: ia.usados >= ia.tope ? 'La IA está en pausa hasta mañana: se llegó al tope diario' : `La IA lleva el ${Math.round((ia.usados / ia.tope) * 100)}% del tope de hoy`, ruta: '/staff/ai.html' });
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

// Agentes del negocio con su actividad real de los últimos 7 días (ia_ejecuciones). La pantalla los empareja con cada módulo por el prefijo de sus herramientas.
export async function agentesInicio(c) {
  const DIA = 86400000, col = (t) => new Date(t - 5 * 3600000).toISOString().slice(0, 10);
  const hoy = Date.now(), dias = Array.from({ length: 7 }, (_, i) => col(hoy - (6 - i) * DIA));
  const ags = await all(c.env, 'SELECT id, nombre, herramientas, autonomia, programacion FROM ia_agentes WHERE business_id = ? AND activo = 1 ORDER BY id', c.businessId);
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
      return { id: a.id, nombre: a.nombre, herramientas: lista(a.herramientas), autonomia: a.autonomia, programacion: a.programacion, estado: mias[0]?.estado || null,
        pendientes: mias.reduce((n, e) => n + (e.pendientes || 0), 0), total: mias.length, hechas, errores: mias.filter((e) => e.estado === 'error').length, semana, dias,
        recientes: mias.slice(0, 4).map((e) => ({ estado: e.estado, texto: String(e.resumen || '').slice(0, 160), cuando: e.created_at })) };
    }),
  };
}

export const daily = (env) => limpiarInicio(env);   // los movimientos de la figura se guardan 30 días

export function routes(r) {
  r.get(`${B}/agentes`, `tenant:${MOD}`, async (c) => json(await agentesInicio(c)));
  r.get(`${B}/figura`, `tenant:${MOD}`, async (c) => json(await figura(c)));
  r.get(B, `tenant:${MOD}`, async (c) => json(await tablero(c)));
}

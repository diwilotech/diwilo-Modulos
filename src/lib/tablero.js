// Estado del Inicio que cada módulo EMPUJA (tabla dashboard_estado). Inicio ya no llama en vivo a los módulos: solo lee lo último que le dejaron.
//   empujarTablero(env, businessId, modulo, { widgets, alertas })   guarda el estado de un módulo (central o propio de una app)
//   refrescarTablero(env, ctx, modulo)                              recalcula y empuja el de un módulo CENTRAL (se llama tras cada escritura y en el cron diario)
// Los cálculos usan las mismas rutas de la API que ya usaban las apps (llamar), con rol admin: el filtro por rol se hace al leer.
import { llamar } from './interno.js';
import { authorize } from './contexto.js';
import { REG } from './registro.js';
import { brandOf } from './marca.js';
import { ajustesDe, usoDelDia } from './ia.js';

const peso = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const plural = (n, a, b) => (n === 1 ? a : b);
const SEG = /^[a-z][a-z0-9_]{1,30}$/;

const cortar = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v == null ? null : String(v).slice(0, n));
export const limpiarWidgets = (a) => (Array.isArray(a) ? a : []).slice(0, 12).map((w) => ({ modulo: cortar(w.modulo, 30), nombre: cortar(w.nombre, 80), titulo: cortar(w.titulo, 80), valor: w.valor == null ? '—' : typeof w.valor === 'number' ? w.valor : cortar(w.valor, 40), detalle: cortar(w.detalle, 160) || '', icono: cortar(w.icono, 40), ruta: cortar(w.ruta, 200) }));
export const limpiarAlertas = (a) => (Array.isArray(a) ? a : []).slice(0, 12).map((x) => ({ id: cortar(x.id, 40), nivel: ['mala', 'aviso', 'info'].includes(x.nivel) ? x.nivel : 'info', icono: cortar(x.icono, 40), texto: cortar(x.texto, 200), ruta: cortar(x.ruta, 200) })).filter((x) => x.id && x.texto);

export async function empujarTablero(env, businessId, modulo, { widgets = [], alertas = [] } = {}) {
  if (!SEG.test(modulo || '')) return;
  await env.DB.prepare(`INSERT INTO dashboard_estado (business_id, modulo, widgets, alertas, actualizado_en) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (business_id, modulo) DO UPDATE SET widgets = excluded.widgets, alertas = excluded.alertas, actualizado_en = excluded.actualizado_en`)
    .bind(businessId, modulo, JSON.stringify(limpiarWidgets(widgets)), JSON.stringify(limpiarAlertas(alertas)), Date.now()).run();
}

export async function leerTablero(env, businessId) {
  const { results } = await env.DB.prepare('SELECT modulo, widgets, alertas, actualizado_en FROM dashboard_estado WHERE business_id = ?').bind(businessId).all();
  const j = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };
  return Object.fromEntries(results.map((r) => [r.modulo, { widgets: j(r.widgets), alertas: j(r.alertas), actualizado_en: r.actualizado_en }]));
}

// Alertas propias de cada módulo central (las mismas que antes calculaba Inicio al abrirse)
const ALERTAS = {
  async marketing(c) {
    const s = await llamar(c, 'GET', '/api/marketing/summary'), out = [];
    if (s?.tasks?.overdue) out.push({ id: 'tareas', nivel: 'mala', icono: 'bi-alarm', texto: `${s.tasks.overdue} ${plural(s.tasks.overdue, 'tarea vencida', 'tareas vencidas')} en Marketing`, ruta: '/staff/marketing.html' });
    const nuevos = s?.contacts?.new ?? 0;
    if (nuevos) out.push({ id: 'leads', nivel: 'info', icono: 'bi-person-plus', texto: `${nuevos} ${plural(nuevos, 'contacto nuevo', 'contactos nuevos')} en los últimos 30 días`, ruta: '/staff/marketing.html' });
    return out;
  },
  async finanzas(c) {
    const s = await llamar(c, 'GET', '/api/finanzas/summary'), out = [];
    if (s?.receivable?.overdue) out.push({ id: 'cartera', nivel: 'mala', icono: 'bi-cash-coin', texto: `${peso(s.receivable.overdue)} vencidos por cobrar`, ruta: '/staff/finanzas.html' });
    if (s?.payable?.overdue) out.push({ id: 'pagos', nivel: 'aviso', icono: 'bi-receipt', texto: `${peso(s.payable.overdue)} vencidos por pagar`, ruta: '/staff/finanzas.html' });
    return out;
  },
  async whatsapp(c) {
    const s = await llamar(c, 'GET', '/api/whatsapp/resumen');
    if (s?.rojos) return [{ id: 'mensajes-rojo', nivel: 'mala', icono: 'bi-chat-dots', texto: `${s.rojos} ${plural(s.rojos, 'chat en Mensajes necesita', 'chats en Mensajes necesitan')} a una persona`, ruta: '/staff/whatsapp.html' }];
    if (s?.sin_responder) return [{ id: 'mensajes-pend', nivel: 'info', icono: 'bi-chat-left-text', texto: `${s.sin_responder} ${plural(s.sin_responder, 'chat sin responder', 'chats sin responder')} hoy en Mensajes`, ruta: '/staff/whatsapp.html' }];
    return [];
  },
  async marca(c) {
    const m = await brandOf(c.env, c.businessId);
    if (m && (!m.tiene_logo || !m.descripcion)) return [{ id: 'marca', nivel: 'info', icono: 'bi-palette', texto: !m.tiene_logo ? 'Sube el logo de tu marca: sale en el menú, en la bienvenida y en el kit' : 'Cuenta en una frase qué hace tu negocio: la IA la usa para hablar de él', ruta: '/staff/marca.html' }];
    return [];
  },
  async ai(c) {
    const [aj, hoy] = await Promise.all([ajustesDe(c.env, c.businessId), usoDelDia(c.env, c.businessId)]);
    const tope = aj.tope_tokens, usados = (hoy.tin || 0) + (hoy.tout || 0);
    if (tope && usados / tope >= 0.8) return [{ id: 'ia', nivel: usados >= tope ? 'mala' : 'aviso', icono: 'bi-robot', texto: usados >= tope ? 'La IA está en pausa hasta mañana: se llegó al tope diario' : `La IA lleva el ${Math.round((usados / tope) * 100)}% del tope de hoy`, ruta: '/staff/ai.html' }];
    return [];
  },
};

// Contexto de trabajo (rol admin: ve todo; el filtro por rol del lector se aplica al leer)
const contexto = (env, ctx) => {
  const c = { env, ctx: { ...ctx, role: 'admin', readOnly: false }, req: new Request('https://x/'), url: new URL(ctx.origin || 'https://app.diwilo.com') };
  authorize(c, 'tenant:dashboard');
  return c;
};

export async function refrescarTablero(env, ctx, modulo) {
  try {
    const m = (REG.manifests || []).find((x) => x.id === modulo);
    if (!m || modulo === 'dashboard') return;
    const c = contexto(env, ctx), ok = async (f) => { try { return await f(); } catch { return null; } };
    const widgets = (await Promise.all((m.widgets || []).map(async (w) => {
      const d = await ok(() => llamar(c, 'GET', w.api));
      return d ? { modulo: m.id, nombre: m.nombre, titulo: d.titulo || m.nombre, valor: d.valor ?? '—', detalle: d.detalle || '', icono: d.icono || m.icono, ruta: d.ruta || m.menu?.ruta || null } : null;
    }))).filter(Boolean);
    const alertas = (await ok(() => ALERTAS[modulo]?.(c))) || [];
    await empujarTablero(env, c.businessId, modulo, { widgets, alertas });
  } catch (e) { console.error('tablero', modulo, e.message); }
}

// Lo que cambia una escritura en /api/<modulo>/… : ese módulo recalcula su estado (la IA y la marca se recalculan junto con cualquier cambio de ellas)
export const moduloDeRuta = (path) => /^\/api\/([a-z]+)(\/|$)/.exec(path || '')?.[1] || null;

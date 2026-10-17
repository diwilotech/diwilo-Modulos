// Contexto de cada llamada: lo arma la app (ya verificó sesión, negocio, rol y que el módulo esté activo) y llega por RPC.
//   { app, business: { id, name }, user: { id, email, name }, role, readOnly, origin, via: 'app'|'mcp', modulos: [ids activos] }
// Aquí el negocio es «<app>:<id>»: dos apps nunca comparten datos aunque sus ids coincidan.
import { HttpError } from './http.js';

const APP = /^[a-z][a-z0-9]{1,30}$/, ID = /^[A-Za-z0-9_-]{1,64}$/;
const ROLES = ['owner', 'admin', 'staff'];
export const orgId = (app, businessId) => `${app}:${businessId}`;

export function checkCtx(ctx) {
  if (!ctx || !APP.test(ctx.app || '') || !ID.test(ctx.business?.id || '') || !ROLES.includes(ctx.role)) throw new HttpError(400, 'Contexto de la app no válido');
  return ctx;
}

// Guarda el nombre del negocio y sus módulos activos (solo si cambiaron; se recuerda en memoria del isolate).
const seen = new Map();
export async function syncOrg(env, ctx) {
  const id = orgId(ctx.app, ctx.business.id);
  const sig = JSON.stringify([ctx.business.name || null, ctx.modulos || null, ctx.business.tema || null, ctx.business.modo || null]);
  if (seen.get(id) === sig) return;
  await env.DB.prepare(`INSERT INTO orgs (id, app, business_id, name, modulos, tema, modo, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = COALESCE(excluded.name, orgs.name), modulos = COALESCE(excluded.modulos, orgs.modulos), tema = COALESCE(excluded.tema, orgs.tema), modo = COALESCE(excluded.modo, orgs.modo), updated_at = excluded.updated_at`)
    .bind(id, ctx.app, ctx.business.id, ctx.business.name ? String(ctx.business.name).slice(0, 120) : null, ctx.modulos ? JSON.stringify(ctx.modulos) : null, /^[a-z]{3,12}$/.test(ctx.business.tema || '') ? ctx.business.tema : null, ['light', 'dark'].includes(ctx.business.modo) ? ctx.business.modo : null, Date.now()).run();
  seen.set(id, sig);
}

// ¿El negocio tiene activo ese módulo? (para las tareas diarias que cruzan módulos, p. ej. «factura vencida»)
export async function orgUsa(env, org, modulo) {
  const r = await env.DB.prepare('SELECT modulos FROM orgs WHERE id = ?').bind(org).first();
  try { return JSON.parse(r?.modulos || '[]').includes(modulo); } catch { return false; }
}

// Nivel de la ruta: 'public' | 'tenant[:modulo]' | 'manager[:modulo]'. Igual que en las apps.
export function authorize(c, spec) {
  const [level, modulo] = String(spec).split(':');
  if (level === 'public') return;
  const ctx = checkCtx(c.ctx);
  Object.assign(c, {
    businessId: orgId(ctx.app, ctx.business.id), app: ctx.app, role: ctx.role, readOnly: !!ctx.readOnly,
    origin: ctx.via === 'mcp' ? 'mcp' : 'app', module: modulo || null,
    session: { user_id: ctx.user?.id || null, email: ctx.user?.email || null, name: ctx.user?.name || null },
  });
  if (c.readOnly && c.req.method !== 'GET') throw new HttpError(402, 'La suscripción del negocio está vencida: solo lectura.', 'READ_ONLY');
  if (level === 'manager' && !['owner', 'admin'].includes(c.role)) throw new HttpError(403, 'Solo el propietario o un administrador');
}

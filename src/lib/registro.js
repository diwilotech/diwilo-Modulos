// Registro compartido entre los módulos: las herramientas de IA de todos (las llena src/index.js) y cómo ejecutar una.
// Lo usan el módulo IA (agentes, asistente y chats) para llamar herramientas de los demás módulos sin importarlos entre sí.
import { HttpError } from './http.js';
import { authorize, checkCtx, syncOrg } from './contexto.js';

export const REG = { tools: [], manifests: [] };
const BASE = ['marca', 'ai'], RANK = { staff: 1, admin: 2, owner: 3 };

// Herramientas que este negocio puede usar con este contexto: las centrales de sus módulos activos y las PROPIAS de la app (ctx.propias.catalogo),
// con un rol que el contexto alcance. Es el catálogo único que usan el MCP, el asistente y los agentes.
export function herramientasDe(ctx) {
  const centrales = REG.tools.filter((t) => !ctx.modulos || ctx.modulos.includes(t.modulo) || BASE.includes(t.modulo));
  const propias = (ctx.propias?.catalogo || []).map((t) => ({ ...t, propia: true }));
  return [...centrales, ...propias].filter((t) => (RANK[ctx.role] || 0) >= (RANK[t.rol || 'staff'] || 1))
    .map(({ name, description, inputSchema, rol, tipo, modulo, propia }) => ({ name, description, inputSchema, rol, tipo, modulo, ...(propia ? { propia: true } : {}) }));
}

// Ejecuta una herramienta con el contexto de un negocio, con las mismas reglas que el MCP (módulo activo, rol, solo lectura).
export async function ejecutarHerramienta(env, ctx, name, args = {}) {
  // Herramienta propia de la app: la ejecuta la app (con la sesión de quien hizo la llamada), no este Worker
  const propia = ctx?.propias?.catalogo?.find((x) => x.name === name);
  if (propia && typeof ctx.propias.ejecutar === 'function') {
    try { const r = await ctx.propias.ejecutar(name, args || {}); return r?.ok ? { ok: true, result: r.result, audit: r.audit || [] } : { ok: false, error: r?.error || 'Error', status: r?.status || 500, audit: r?.audit || [] }; }
    catch (e) { return { ok: false, error: e.message || 'Error al llamar a la app', status: 502, audit: [] }; }
  }
  const t = REG.tools.find((x) => x.name === name);
  const c = { env, ctx, req: new Request('https://x/', { method: t?.tipo === 'escritura' ? 'POST' : 'GET' }), url: new URL(ctx?.origin || 'https://app.diwilo.com') };
  try {
    if (!t) throw new HttpError(404, 'Herramienta no encontrada');
    checkCtx(ctx);
    await syncOrg(env, ctx);
    authorize(c, `tenant:${t.modulo}`); // escritura con suscripción vencida = 402
    if (ctx.modulos && !ctx.modulos.includes(t.modulo) && !['marca', 'ai'].includes(t.modulo)) throw new HttpError(403, `El módulo ${t.modulo} no está activo para este negocio`);
    if (t.rol === 'admin' && !['owner', 'admin'].includes(c.role)) throw new HttpError(403, 'Tu rol no puede usar esta herramienta');
    return { ok: true, result: await t.run(c, args || {}), audit: c.auditLog || [] };
  } catch (e) { return { ok: false, error: e.message || 'Error', status: e.status || 500, audit: c.auditLog || [] }; }
}

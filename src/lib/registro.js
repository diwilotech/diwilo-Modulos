// Registro compartido entre los módulos: las herramientas de IA de todos (las llena src/index.js) y cómo ejecutar una.
// Lo usan el módulo IA (agentes, asistente y chats) para llamar herramientas de los demás módulos sin importarlos entre sí.
import { HttpError } from './http.js';
import { authorize, checkCtx, syncOrg } from './contexto.js';

export const REG = { tools: [] };

// Ejecuta una herramienta con el contexto de un negocio, con las mismas reglas que el MCP (módulo activo, rol, solo lectura).
export async function ejecutarHerramienta(env, ctx, name, args = {}) {
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

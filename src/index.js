// Diwilo Modulos — Worker central de los módulos horizontales (Finanzas, Marketing…) para todas las apps de Diwilo.
// No tiene dominio ni ruta pública: cada app lo llama por service binding con "entrypoint": "Modulos" (RPC).
// La app pone las pantallas (su shell, su tema, su login) y verifica sesión, negocio, rol y que el módulo esté activo;
// aquí viven los datos (D1, por «<app>:<negocio>»), la lógica, las herramientas de IA y el código de las páginas.
//
//   catalog()                         manifiestos de los módulos (la app arma su menú y Diwilo su catálogo)
//   call(ctx, { method, path, query, body })  API de un módulo (/api/<modulo>/…) -> { status, headers, body, audit }
//   tools() · tool(ctx, name, args)   herramientas de IA (las publica el MCP de cada app)
//   asset(path)                       código de las páginas (/m/<modulo>.js y .html) -> { status, type, body }
//   link(app, slug) · click(app, id)  links de rastreo públicos (/l/:slug en el dominio de la app)
//   validar(app, code, origin)        validación pública de documentos (/validar/:código en el dominio de la app)
//   tarjeta(app, rest, origin, opts)  tarjetas de presentación públicas (/c/… en el dominio de la app)
//   marca(app, businessId)            kit de marca de un negocio (color, CSS, tipografía, tono y prompts de IA) para otro Worker
//   chat(app, rest, opts)             chats de clientes públicos (/chat/<slug>… en el dominio de la app): página, widget.js y mensajes
//   apiPublica(app, clave, path, query)  API pública del negocio con clave (/v1/… en el dominio de la app)
//   uso(app, businessId)              registros por módulo (Diwilo avisa antes de quitar un módulo)
//   purge(app, businessIds)           borra los datos de negocios que la app ya borró
// Tareas diarias (cron): gastos recurrentes de Finanzas y automatizaciones de Marketing de todos los negocios.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Router } from './router.js';
import { HttpError } from './lib/http.js';
import { authorize, checkCtx, syncOrg, orgId } from './lib/contexto.js';
import { MODULOS } from './modulos/index.js';
import { linkBySlug, countClick } from './modulos/marketing/api.js';
import { publicCard } from './modulos/marketing/tarjetas.js';
import { validatePage } from './modulos/finanzas/api.js';
import { kitOf } from './lib/marca.js';
import { REG, ejecutarHerramienta } from './lib/registro.js';
import { guiasDe } from './lib/guias.js';
import { manejarChat } from './modulos/ai/chat.js';
import { apiPublica } from './modulos/ai/publica.js';

const router = new Router();
for (const m of MODULOS) m.api.routes(router);
const TOOLS = MODULOS.flatMap((m) => m.tools);
REG.tools = TOOLS;
REG.manifests = MODULOS.map((m) => m.manifest);
const TABLA = /^[a-z][a-z0-9_]{1,40}$/;

const asText = async (res) => ({ status: res.status, headers: Object.fromEntries([...res.headers].filter(([k]) => ['content-type', 'content-disposition', 'cache-control', 'location'].includes(k))), body: await res.text() });
function fail(err) {
  if (err instanceof HttpError) return { status: err.status, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: err.message, code: err.code }) };
  if (/UNIQUE/i.test(String(err?.message))) return { status: 409, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'Ya existe un registro con ese mismo código o referencia' }) };
  console.error(err);
  return { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'Error interno de los módulos' }) };
}

export default {
  // Sin acceso desde internet: todo llega por RPC.
  fetch: () => new Response('Diwilo Modulos solo atiende a las apps de Diwilo por service binding.', { status: 404 }),
  async scheduled(event, env, ctx) {
    for (const m of MODULOS) if (typeof m.api.daily === 'function') ctx.waitUntil(m.api.daily(env).catch((e) => console.error(`tarea diaria ${m.manifest.id}`, e.message)));
  },
};

export class Modulos extends WorkerEntrypoint {
  catalog() {
    return MODULOS.map(({ manifest }) => manifest);
  }

  async call(ctx, { method = 'GET', path, query = '', body = null } = {}) {
    try {
      checkCtx(ctx);
      if (!/^\/api\/[a-z]+(\/|$)/.test(path || '')) throw new HttpError(404, 'Ruta no encontrada');
      await syncOrg(this.env, ctx);
      const url = new URL(path + (query ? (query.startsWith('?') ? query : `?${query}`) : ''), ctx.origin || 'https://app.diwilo.com');
      const req = new Request(url, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' || method === 'HEAD' || body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
      const { route, params } = router.match(method, url.pathname);
      const c = { req, env: this.env, ctx, url, params };
      authorize(c, route.auth);
      const res = await route.handler(c);
      return { ...(await asText(res)), audit: c.auditLog || [] };
    } catch (err) { return { ...fail(err), audit: [] }; }
  }

  // Guías de uso de los módulos (estándar «guía de módulo v1») para el MCP de la app: las centrales y las propias que mande en ctx.propias
  guias(ctx) {
    checkCtx(ctx);
    return guiasDe(ctx, ctx.origin || '');
  }

  tools() {
    return TOOLS.map(({ name, description, inputSchema, rol, tipo, modulo }) => ({ name, description, inputSchema, rol, tipo, modulo }));
  }

  async tool(ctx, name, args = {}) {
    return ejecutarHerramienta(this.env, ctx, name, args);
  }

  async asset(path) {
    if (!/^\/m\/[a-z]+\.(js|html)$/.test(path || '')) return { status: 404, type: 'text/plain', body: 'No encontrado' };
    const res = await this.env.ASSETS.fetch(new Request(`https://modulos${path}`));
    return { status: res.status, type: path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', body: res.ok ? await res.text() : 'No encontrado' };
  }

  link(app, slug) { return linkBySlug(this.env, app, slug); }
  async click(app, id) { await countClick(this.env, app, id); return { ok: true }; }

  async validar(app, code, origin) {
    const res = await validatePage(new Request(`${origin}/validar/${encodeURIComponent(code || '')}`), this.env, app);
    return asText(res);
  }

  tarjeta(app, rest, origin, opts = {}) {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '')) return { status: 404, headers: {}, body: 'No encontrado' };
    return publicCard(this.env, app, rest, origin, opts);
  }

  // Chat público de un negocio: la app lo llama desde /chat/<slug>… y entrega la respuesta tal cual. opts: { method, query, body, meta: { country, ua }, origin }
  chat(app, rest, opts = {}) {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '')) return { status: 404, headers: {}, body: 'No encontrado' };
    return manejarChat(this.env, { app, rest, ...opts, waitUntil: (p) => this.ctx.waitUntil(p) });
  }

  apiPublica(app, clave, path, query = '') {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '')) return { status: 404, headers: {}, body: 'No encontrado' };
    return apiPublica(this.env, { app, clave, path, query });
  }

  // Kit de marca de un negocio para otra pieza de Diwilo (un generador de webs o apps, un agente…): se llama por service binding.
  async marca(app, businessId) {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '') || !/^[A-Za-z0-9_-]{1,64}$/.test(businessId || '')) throw new HttpError(400, 'App o negocio no válido');
    const org = orgId(app, businessId);
    const o = await this.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first();
    return kitOf(this.env, org, o?.name || null, { logo: true });
  }

  async uso(app, businessId) {
    const org = orgId(app, businessId), out = {};
    for (const { manifest } of MODULOS) {
      let n = 0;
      for (const t of (manifest.tablas || []).filter((x) => TABLA.test(x))) n += (await this.env.DB.prepare(`SELECT COUNT(*) n FROM ${t} WHERE business_id = ?`).bind(org).first().catch(() => ({ n: 0 }))).n;
      out[manifest.id] = n;
    }
    return out;
  }

  async purge(app, businessIds = []) {
    let borrados = 0;
    for (const id of businessIds) {
      const org = orgId(app, id);
      for (const { manifest } of MODULOS) for (const t of (manifest.tablas || []).filter((x) => TABLA.test(x))) {
        await this.env.DB.prepare(`DELETE FROM ${t} WHERE business_id = ?`).bind(org).run().catch(() => {});
      }
      await this.env.DB.prepare('DELETE FROM orgs WHERE id = ?').bind(org).run();
      borrados++;
    }
    return { borrados };
  }
}

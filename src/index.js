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
//   whatsapp(app, rest, opts)         webhook de una bandeja de WhatsApp (/wa/<slug> en el dominio de la app): verificación de Meta y mensajes
//   mensajesRegistrar(app, negocio, datos)  deja en Mensajes un chat web atendido por otro sistema (chat del sitio de Diwilo)
//   mensajesResponder(app, negocio, datos)  un chat web le pasa el mensaje al agente de su bandeja en Mensajes y recibe la respuesta
//   whatsappNegocio(app, slug)        negocio dueño del webhook (la app verifica que esté activo con WhatsApp antes de llamar a whatsapp())
//   apiPublica(app, clave, path, query)  API pública del negocio con clave (/v1/… en el dominio de la app)
//   uso(app, businessId)              registros por módulo (Diwilo avisa antes de quitar un módulo)
//   purge(app, businessIds)           borra los datos de negocios que la app ya borró
// Tareas diarias (cron): gastos recurrentes de Finanzas y automatizaciones de Marketing de todos los negocios.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Router } from './router.js';
import { HttpError } from './lib/http.js';
import { authorize, checkCtx, syncOrg, orgId } from './lib/contexto.js';
import { MODULOS } from './modulos/index.js';
import { importarEquipo } from './modulos/nomina/api.js';
import { linkBySlug, countClick, registrarLead, marcarMatriculado } from './modulos/marketing/api.js';
import { publicCard } from './modulos/marketing/tarjetas.js';
import { validatePage } from './modulos/finanzas/api.js';
import { kitOf } from './lib/marca.js';
import { REG, ejecutarHerramienta } from './lib/registro.js';
import { guiasDe } from './lib/guias.js';
import { manejarChat } from './modulos/ai/chat.js';
import { apiPublica } from './modulos/ai/publica.js';
import { manejarWhatsapp, registrarWeb, responder } from './modulos/whatsapp/webhook.js';
import { servirMedia } from './modulos/whatsapp/media.js';
import { recibirCorreo, sincronizarCorreos } from './modulos/whatsapp/correo.js';
import { completarConexion, GoogleError } from './modulos/whatsapp/google.js';

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
  // Correo (Mensajes): Cloudflare Email Routing entrega aquí los correos de las direcciones cuya regla apunta a este Worker
  async email(message, env, ctx) { await recibirCorreo(message, env, ctx); },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sincronizarCorreos(env).catch((e) => console.error('correos gmail', e.message)));   // correos nuevos de Gmail (también se leen al abrir Mensajes)
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
      const c = { req, env: this.env, ctx, url, params, waitUntil: (p) => this.ctx.waitUntil(p) };
      authorize(c, route.auth);
      const res = await route.handler(c);
      return { ...(await asText(res)), audit: c.auditLog || [] };
    } catch (err) { return { ...fail(err), audit: [] }; }
  }

  // Foto, video, audio o documento de un chat de Mensajes (la app ya comprobó sesión y módulo). Devuelve una Response con soporte de Range.
  async media(ctx, id, rango = null) {
    checkCtx(ctx);
    return servirMedia(this.env, { businessId: orgId(ctx.app, ctx.business.id) }, id, rango);
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
  // Embudo de matrícula: la página pública de la app registra el interesado (lead del link) y, al matricular, lo pasa a cliente
  // Nómina: la app trae su equipo (empleados y honorarios del mes) sin duplicar
  nominaImportar(app, negocio, datos) { return importarEquipo(this.env, app, negocio, datos || {}); }
  lead(app, negocio, datos) { return registrarLead(this.env, app, negocio, datos || {}); }
  matriculado(app, negocio, datos) { return marcarMatriculado(this.env, app, negocio, datos || {}); }

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

  // Webhook de WhatsApp: la app lo llama desde /wa/<slug> con { method, query, body (texto crudo), sig (X-Hub-Signature-256) } y entrega la respuesta tal cual
  whatsapp(app, rest, opts = {}) {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '')) return { status: 404, headers: {}, body: 'No encontrado' };
    return manejarWhatsapp(this.env, { app, rest, ...opts, waitUntil: (p) => this.ctx.waitUntil(p) });
  }

  // Un sistema de confianza (el chat del sitio de Diwilo, otra app) deja en Mensajes lo que pasó en un chat web: { ref, nombre, contacto, nombreContacto?, mensajes: [{ id, rol, contenido, ts }], pais?, dispositivo?, pagina? }
  async mensajesRegistrar(app, negocio, datos = {}) {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '') || !/^[A-Za-z0-9_-]{1,64}$/.test(negocio || '')) throw new HttpError(400, 'App o negocio no válido');
    if (!/^[a-z0-9:_-]{1,40}$/.test(datos.ref || '') || !/^[A-Za-z0-9_.:@+-]{1,120}$/.test(datos.contacto || '')) throw new HttpError(400, 'ref o contacto no válido');
    const mensajes = (Array.isArray(datos.mensajes) ? datos.mensajes : []).slice(0, 50).filter((m) => m && typeof m.contenido === 'string' && m.contenido.trim()).map((m) => ({ ...m, contenido: m.contenido.slice(0, 4000) }));
    return registrarWeb(this.env, { ...datos, mensajes, org: orgId(app, negocio) });
  }

  // El chat web de una app (el sitio de Diwilo) le pasa el mensaje de un visitante al agente de su bandeja en Mensajes y recibe la respuesta: { ok, respuesta, chat_id }.
  // Sin Mensajes activo, sin agente o con la IA apagada en ese chat, respuesta es null y quien llama responde como siempre.
  async mensajesResponder(app, negocio, datos = {}) {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '') || !/^[A-Za-z0-9_-]{1,64}$/.test(negocio || '')) throw new HttpError(400, 'App o negocio no válido');
    if (!/^[a-z0-9:_-]{1,40}$/.test(datos.ref || '') || !/^[A-Za-z0-9_.:@+-]{1,120}$/.test(datos.contacto || '')) throw new HttpError(400, 'ref o contacto no válido');
    const texto = String(datos.mensaje || '').trim().slice(0, 4000);
    if (!texto) throw new HttpError(400, 'Falta el mensaje');
    const org = orgId(app, negocio), t = Date.now();
    const reg = await registrarWeb(this.env, { ...datos, org, conAgente: true, mensajes: [{ id: datos.id || `${t}:u`, rol: 'user', contenido: texto, ts: t }] });
    if (!reg.ok) return { ok: false, motivo: reg.motivo };
    if (!reg.nuevo) return { ok: true, duplicado: true, respuesta: null, chat_id: reg.chat_id };
    const bandeja = await this.env.DB.prepare('SELECT * FROM wa_bandejas WHERE id = ?').bind(reg.bandeja_id).first(), conv = await this.env.DB.prepare('SELECT * FROM wa_conversaciones WHERE id = ?').bind(reg.chat_id).first();
    const respuesta = await responder(this.env, { bandeja, conv, entregar: false, contexto: String(datos.contexto || '').slice(0, 8000) });
    return { ok: true, respuesta, chat_id: reg.chat_id };
  }

  // Vuelta de Google tras «Conectar con Google»: la app entrega aquí { query, redirect } y muestra la página que devuelve. { status, html }
  async googleCallback(query = '') {
    const p = new URLSearchParams(String(query).replace(/^\?/, ''));
    const pagina = (ok, texto) => ({ status: ok ? 200 : 400, html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google · Mensajes</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;text-align:center"><h1 style="font-size:22px">${ok ? '✅ Google conectado' : '⚠️ No se pudo conectar'}</h1><p style="color:#555">${String(texto).replace(/[<>&]/g, '')}</p><p style="color:#555">Ya puedes cerrar esta pestaña y volver a Mensajes.</p><script>try{window.opener&&window.opener.postMessage({dw:'google'},'*')}catch(e){}${ok ? 'setTimeout(function(){try{window.close()}catch(e){}},2500)' : ''}</script></body>` });
    if (p.get('error')) return pagina(false, p.get('error') === 'access_denied' ? 'Cancelaste la autorización de Google.' : `Google respondió: ${p.get('error')}`);
    try { const r = await completarConexion(this.env, { code: p.get('code'), state: p.get('state') }); return pagina(true, `Conectaste ${r.email || 'tu cuenta'}. Ya puedes responder correos por Gmail y agendar citas con Meet.`); }
    catch (e) { return pagina(false, e instanceof GoogleError ? e.message : 'Error al conectar con Google'); }
  }

  // A qué negocio pertenece el webhook (la app comprueba que siga activo y con WhatsApp antes de entregarle el mensaje)
  async whatsappNegocio(app, slug) {
    if (!/^[a-z][a-z0-9]{1,30}$/.test(app || '') || !/^[a-f0-9]{24}$/.test(slug || '')) return null;
    const b = await this.env.DB.prepare('SELECT business_id FROM wa_bandejas WHERE slug = ? AND business_id LIKE ?').bind(slug, `${app}:%`).first();
    return b ? b.business_id.slice(app.length + 1) : null;
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

// Canales de la bandeja: WhatsApp (Cloud API), Instagram y Messenger (Graph API de Meta). Envío, plantillas, perfil y verificador.
// Instagram y Messenger usan el token de la página y el id de la página / de la cuenta profesional de Instagram (se guarda en phone_number_id).
import { descifrarClave } from '../../lib/ia.js';
import { one, now } from '../../lib/crud.js';
import { conectado, enviarGmail } from './google.js';

export const GRAPH = 'https://graph.facebook.com/v21.0';
export const CANALES = { whatsapp: { nombre: 'WhatsApp', icono: 'bi-whatsapp' }, instagram: { nombre: 'Instagram', icono: 'bi-instagram' }, messenger: { nombre: 'Messenger', icono: 'bi-messenger' }, webhook: { nombre: 'Web / Webhook', icono: 'bi-globe2' }, correo: { nombre: 'Correo', icono: 'bi-envelope' } };
export const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
export const errMeta = async (r) => { try { const d = await r.json(); return `${d.error?.message || 'Error'}${d.error?.code ? ` (código ${d.error.code})` : ''}`.slice(0, 300); } catch { return `Meta respondió ${r.status}`; } };

// Llamada a Graph con el token de la bandeja (8 s de espera). Lanza Error('sin_clave') si no la tiene.
async function graph(env, bandeja, url, init = {}, ms = 8000, token = null) {
  if (!bandeja.clave_cifrada) throw new Error('sin_clave');
  const clave = token || await descifrarClave(env, bandeja.clave_cifrada), ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal, headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' } }); } finally { clearTimeout(t); }
}
// Instagram y Messenger se envían con el token de la PÁGINA. Si la clave guardada es la de un usuario del sistema (o de otro usuario con la página asignada),
// se le pide a Meta el token de la página vinculada (GET /me/accounts); si la clave ya es la de la página, esa lista viene vacía y se usa tal cual (/me).
const cachePag = new Map();
export async function paginaDe(env, bandeja) {
  const k = `${bandeja.id}:${bandeja.updated_at}`, c = cachePag.get(k);
  if (c && Date.now() - c.at < 3000000) return c.v;
  let v = null;
  try {
    const r = await graph(env, bandeja, `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100`);
    if (r.ok) {
      const p = ((await r.json()).data || []).find((x) => (bandeja.canal === 'messenger' ? x.id === bandeja.phone_number_id : x.instagram_business_account?.id === bandeja.phone_number_id));
      if (p?.access_token) v = { id: p.id, token: p.access_token, nombre: p.name };
    }
  } catch { /* sin página: se prueba con la clave tal cual */ }
  cachePag.set(k, { v, at: v ? Date.now() : Date.now() - 2940000 });   // si no se encontró, se reintenta al minuto
  return v;
}
const post = (env, b, ruta, body) => graph(env, b, `${GRAPH}/${b.phone_number_id}/${ruta}`, { method: 'POST', body: JSON.stringify(body) });
const resultado = async (r, ctx) => { if (!r.ok) console.error(ctx, r.status, (await r.clone().text()).slice(0, 200)); return r.ok ? { estado: 'enviado' } : { estado: 'error', error: await errMeta(r) }; };

// https público (nunca direcciones internas): destino de las respuestas de una bandeja «webhook»
export function webhookValido(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(x.hostname) && x.hostname.includes('.');
  } catch { return false; }
}
// Entrega una respuesta a la URL de salida de una bandeja webhook (4 s de espera). Sin URL, la respuesta solo queda en el chat.
export async function enviarWeb(bandeja, evento, datos) {
  if (!bandeja.url_salida || !webhookValido(bandeja.url_salida)) return { estado: 'sin_destino' };
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(bandeja.url_salida, { method: 'POST', headers: { 'content-type': 'application/json', 'x-diwilo-evento': evento, 'x-diwilo-token': bandeja.verify_token }, body: JSON.stringify({ evento, bandeja: bandeja.nombre, ts: now(), ...datos }), signal: ac.signal });
    return r.ok ? { estado: 'enviado' } : { estado: 'error', error: `Tu URL respondió ${r.status}` };
  } catch (e) { return { estado: 'error', error: e.name === 'AbortError' ? 'Tu URL tardó más de 4 s' : 'No se pudo conectar con tu URL' }; } finally { clearTimeout(t); }
}

const escHtml = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// Responde un correo por Cloudflare Email Sending, en el mismo hilo (Re: asunto, In-Reply-To / References)
export async function enviarCorreo(env, bandeja, para, texto, { asunto, ref } = {}) {
  // Con Google conectado, la respuesta sale por Gmail (queda en «Enviados» y en el mismo hilo); si no, por Cloudflare Email Sending
  if (await conectado(env, bandeja.business_id).catch(() => false)) {
    try { await enviarGmail(env, bandeja, para, texto, { asunto, ref }); return { estado: 'enviado' }; }
    catch (e) { console.error('gmail envío', e.message); return { estado: 'error', error: `Gmail no lo envió: ${String(e.message).slice(0, 200)}` }; }
  }
  if (!env.EMAIL?.send) return { estado: 'error', error: 'El envío de correo no está configurado en Diwilo Modulos' };
  try {
    const t = String(texto).slice(0, 20000), subject = /^\s*re:/i.test(asunto || '') ? asunto : `Re: ${asunto || 'tu mensaje'}`;
    await env.EMAIL.send({ to: para, from: { email: bandeja.phone_number_id, name: bandeja.nombre }, subject: subject.slice(0, 200), text: t, html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escHtml(t)}</div>`,
      ...(ref ? { headers: { 'In-Reply-To': ref, References: ref } } : {}) });
    return { estado: 'enviado' };
  } catch (e) { console.error('correo envío', e.message); return { estado: 'error', error: `${String(e.message || e).slice(0, 220)}. Revisa que el dominio esté activado en Cloudflare Email Sending.` }; }
}

// Texto libre: WhatsApp, Instagram y Messenger solo lo permiten dentro de las 24 h siguientes al último mensaje de la persona.
export async function enviarTexto(env, bandeja, para, texto, extra = {}) {
  if (bandeja.canal === 'correo') return enviarCorreo(env, bandeja, para, texto, extra);
  if (bandeja.canal === 'webhook') return enviarWeb(bandeja, 'mensaje', { chat: para, texto: String(texto).slice(0, 4000), ...extra });
  try {
    const t = String(texto).slice(0, bandeja.canal === 'whatsapp' ? 4000 : 1900);
    if (!bandeja.canal || bandeja.canal === 'whatsapp') return await resultado(await post(env, bandeja, 'messages', { messaging_product: 'whatsapp', to: soloDigitos(para), type: 'text', text: { body: t } }), 'whatsapp envío');
    // «me» = la página (o la cuenta de Instagram) dueña del token: así sirve con el token de la página sin necesitar su id
    const via = await paginaDe(env, bandeja);
    const r = await graph(env, bandeja, `${GRAPH}/${via ? via.id : 'me'}/messages`, { method: 'POST', body: JSON.stringify({ recipient: { id: String(para) }, messaging_type: 'RESPONSE', message: { text: t } }) }, 8000, via?.token);
    const res = await resultado(r, `${bandeja.canal} envío`);
    return res.estado === 'error' ? { ...res, error: `${res.error}${via ? '' : '. No encontré la página vinculada a esta cuenta entre las páginas del token: asígnala al usuario del sistema (control total) y genera el token de nuevo con pages_show_list, pages_messaging e instagram_manage_messages'}` } : res;
  } catch (e) { return e.message === 'sin_clave' ? { estado: 'sin_clave' } : { estado: 'error', error: e.name === 'AbortError' ? 'Meta tardó más de 8 segundos' : e.message }; }
}

// Plantillas aprobadas de la cuenta de WhatsApp. Solo se ofrecen las que se pueden llenar con variables del cuerpo (sin encabezado con archivo ni botones con variables).
export async function plantillasDe(env, bandeja) {
  const r = await graph(env, bandeja, `${GRAPH}/${bandeja.waba_id}/message_templates?status=APPROVED&limit=100&fields=name,language,category,components`);
  if (!r.ok) throw new Error(await errMeta(r));
  return ((await r.json()).data || []).map((p) => {
    const cuerpo = (p.components || []).find((c) => c.type === 'BODY')?.text || '', cab = (p.components || []).find((c) => c.type === 'HEADER');
    const variables = [...new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].length;
    const raras = (cab && (cab.format !== 'TEXT' || /\{\{/.test(cab.text || ''))) || (p.components || []).some((c) => c.type === 'BUTTONS' && /\{\{/.test(JSON.stringify(c.buttons || [])));
    return { nombre: p.name, idioma: p.language, categoria: p.category, cuerpo, variables, soportada: !raras };
  });
}
export async function enviarPlantilla(env, bandeja, para, nombre, idioma, variables = []) {
  try {
    const template = { name: nombre, language: { code: idioma }, ...(variables.length ? { components: [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: String(v).slice(0, 1000) })) }] } : {}) };
    return await resultado(await post(env, bandeja, 'messages', { messaging_product: 'whatsapp', to: soloDigitos(para), type: 'template', template }), 'whatsapp plantilla');
  } catch (e) { return e.message === 'sin_clave' ? { estado: 'sin_clave' } : { estado: 'error', error: e.name === 'AbortError' ? 'Meta tardó más de 8 segundos' : e.message }; }
}

// Nombre de quien escribe por Instagram / Messenger («Nombre (@usuario)»), pedido a Meta con el token de la página. Si Meta no lo da, null.
export async function perfil(env, bandeja, id) {
  try {
    const via = await paginaDe(env, bandeja);
    const r = await graph(env, bandeja, `${GRAPH}/${encodeURIComponent(id)}?fields=${bandeja.canal === 'instagram' ? 'name,username' : 'name'}`, {}, 3500, via?.token);
    if (!r.ok) { console.warn(`perfil ${bandeja.canal}: ${r.status} ${(await r.text()).slice(0, 160)}`); return null; }
    const d = await r.json(), nombre = String(d.name || '').trim(), usuario = String(d.username || '').trim();
    return nombre && usuario ? `${nombre} (@${usuario})` : nombre || (usuario ? `@${usuario}` : null);
  } catch { return null; }
}

async function probarSocial(env, bandeja, pasos, paso) {
  try {
    const r = await graph(env, bandeja, `${GRAPH}/${bandeja.phone_number_id}?fields=id,name${bandeja.canal === 'instagram' ? ',username' : ''}`);
    if (!r.ok) paso('Clave API e ID de la cuenta', false, `Meta no aceptó la clave o el ID: ${await errMeta(r)}. Usa el token de la página y el ID de la ${bandeja.canal === 'instagram' ? 'cuenta profesional de Instagram' : 'página'}.`);
    else {
      const d = await r.json(); paso('Clave API e ID de la cuenta', true, `Conectado a «${d.name || d.username || d.id}».`);
      // Para enviar se usa el token de la PÁGINA vinculada: se busca entre las páginas del token (o el token ya es el de la página)
      const pg = await paginaDe(env, bandeja);
      if (pg) paso('Página vinculada', true, `Encontré la página «${pg.nombre}» (${pg.id}): los mensajes se envían con su token.`);
      else {
        const yo = await graph(env, bandeja, `${GRAPH}/me?fields=id,name`);
        const m = yo.ok ? await yo.json() : null, esPagina = m && bandeja.canal === 'messenger' && m.id === bandeja.phone_number_id;
        paso('Página vinculada', !!esPagina, esPagina ? `El token ya es el de la página «${m.name}».` : `No encontré la página vinculada a esta cuenta entre las que ve el token${m ? ` (el token es de «${m.name}»)` : ''}. En Meta: Usuarios del sistema → Agregar activos → asigna la página con control total y genera el token con pages_show_list, pages_messaging e instagram_manage_messages.`);
      }
    }
  } catch (e) { paso('Conexión con Meta', false, e.name === 'AbortError' ? 'Meta tardó más de 8 segundos en responder.' : 'No se pudo conectar con Meta.'); }
  pasos.push({ nombre: 'Mensajes', ok: true, detalle: `Escríbele a la ${bandeja.canal === 'instagram' ? 'cuenta de Instagram' : 'página'} desde otra cuenta: el mensaje debe aparecer en Chats. Responder solo se puede dentro de las 24 h siguientes.` });
  return { ok: pasos.every((p) => p.ok), pasos };
}

// Verificador de la bandeja (como el de Chatwoot): comprueba la clave API y el ID del número contra Meta y, si se da un destino, manda un mensaje de prueba.
export async function probarBandeja(env, bandeja, para) {
  const pasos = [], paso = (nombre, ok, detalle) => { pasos.push({ nombre, ok, detalle }); return ok; };
  if (bandeja.canal === 'correo') {
    paso('Recepción', true, `Los correos que lleguen a ${bandeja.phone_number_id} aparecen en Chats si en Cloudflare → Email Routing la regla de esa dirección envía a un Worker → diwilo-modulos.`);
    if (!env.EMAIL?.send && !(await conectado(env, bandeja.business_id).catch(() => false))) paso('Envío', false, 'No hay cómo enviar: conecta Google en la pestaña «Google» (respuestas por Gmail) o activa Cloudflare Email Sending.');
    else if (!para || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) paso('Envío', true, 'El envío está configurado. Escribe un correo en «Número que recibe el mensaje de prueba» para mandarle una prueba.');
    else { const r = await enviarCorreo(env, bandeja, para.trim(), 'Prueba de conexión de Diwilo: si lees esto, las respuestas por correo funcionan.', { asunto: 'Prueba de conexión' }); paso('Envío', r.estado === 'enviado', r.estado === 'enviado' ? `Correo de prueba enviado a ${para.trim()}.` : r.error); }
    return { ok: pasos.every((p) => p.ok), pasos };
  }
  if (bandeja.canal === 'webhook') {
    paso('Webhook de entrada', true, 'Tu sistema envía los mensajes a la URL de la bandeja con su token (ver el ejemplo en la tarjeta).');
    if (!bandeja.url_salida) paso('URL de salida', true, 'Sin URL de salida: las respuestas del equipo se guardan en el chat pero no se envían a tu sistema (si quieres recibirlas, agrégala en Ajustes).');
    else { const r = await enviarWeb(bandeja, 'prueba', { texto: 'Prueba de conexión de Diwilo' }); paso('URL de salida', r.estado === 'enviado', r.estado === 'enviado' ? 'Tu URL recibió el evento de prueba.' : `No respondió bien: ${r.error || 'revisa la dirección'}.`); }
    return { ok: pasos.every((p) => p.ok), pasos };
  }
  if (!bandeja.clave_cifrada) { paso('Clave API', false, 'La bandeja no tiene clave API: guárdala en Ajustes.'); return { ok: false, pasos }; }
  if (bandeja.canal && bandeja.canal !== 'whatsapp') return probarSocial(env, bandeja, pasos, paso);
  let clave;
  try { clave = await descifrarClave(env, bandeja.clave_cifrada); } catch { paso('Clave API', false, 'No se pudo leer la clave guardada: vuelve a guardarla en Ajustes.'); return { ok: false, pasos }; }
  const llamar = async (url, init = {}) => {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
    try { return await fetch(url, { ...init, signal: ac.signal, headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' } }); } finally { clearTimeout(t); }
  };
  try {
    const r = await llamar(`${GRAPH}/${bandeja.phone_number_id}?fields=display_phone_number,verified_name,code_verification_status,status,name_status,platform_type,quality_rating,account_mode`);
    if (!r.ok) { paso('Clave API e ID del número', false, `Meta no aceptó la clave o el ID del número: ${await errMeta(r)}`); return { ok: false, pasos }; }
    const d = await r.json(), meta = soloDigitos(d.display_phone_number), mio = soloDigitos(bandeja.telefono);
    paso('Clave API e ID del número', true, `Conectado al número ${d.display_phone_number || '—'}${d.verified_name ? ` · nombre verificado «${d.verified_name}»` : ''}.`);
    // Estado del número en WhatsApp: para que otras personas lo encuentren debe estar CONECTADO (registrado en la Cloud API)
    const est = d.status ? String(d.status).toUpperCase() : null;
    if (est) paso('Estado del número', est === 'CONNECTED', `Estado: ${d.status}${d.platform_type ? ` · plataforma ${d.platform_type}` : ''}${d.name_status ? ` · nombre ${d.name_status}` : ''}${d.quality_rating ? ` · calidad ${d.quality_rating}` : ''}${d.account_mode ? ` · modo ${d.account_mode}` : ''}.${est === 'CONNECTED' ? '' : ' Si no está CONECTADO, el número no recibe mensajes: hay que registrarlo en WhatsApp Manager (o con /register).'}${d.account_mode === 'SANDBOX' ? ' Modo SANDBOX: solo recibe de los números de prueba.' : ''}`);
    if (meta && mio && meta !== mio) paso('Teléfono', false, `El teléfono de la bandeja (${bandeja.telefono}) no coincide con el que Meta reporta para ese ID (${d.display_phone_number}).`);
    else paso('Teléfono', true, 'El teléfono coincide con el de Meta.');
    const w = await llamar(`${GRAPH}/${bandeja.waba_id}/phone_numbers?fields=id&limit=50`);
    if (!w.ok) paso('Cuenta de WhatsApp Business', false, `No se pudo leer la cuenta ${bandeja.waba_id}: ${await errMeta(w)}. Puede ser que ese ID no sea el de la cuenta de WhatsApp Business («Messaging Account ID») o, si ya es el correcto, que el usuario del sistema del token no tenga acceso a esa cuenta (Configuración del negocio → Usuarios del sistema → Agregar activos → Cuentas de WhatsApp → control total) y haya que generar el token de nuevo.`);
    else paso('Cuenta de WhatsApp Business', (await w.json()).data?.some((n) => String(n.id) === bandeja.phone_number_id) ?? false, 'El ID de la cuenta debe ser el dueño de ese número (revisa que no hayas puesto el ID de la app).');
    if (para) {
      const to = soloDigitos(para);
      if (to.length < 8 || to.length > 15) paso('Mensaje de prueba', false, 'El número de destino no es válido (con indicativo, por ejemplo +57 300 123 4567).');
      else {
        // Si la persona escribió en las últimas 24 h se prueba con un texto normal (no usa la facturación de plantillas); si no, con la plantilla hello_world,
        // que existe en toda cuenta nueva y se puede enviar sin que la persona haya escrito antes (Meta la cobra a la cuenta de mensajería)
        const ventana = await one(env, "SELECT 1 FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? AND rol = 'user' AND ts > ?", bandeja.business_id, bandeja.id, to, now() - 86400000);
        if (ventana) {
          const t = await llamar(`${GRAPH}/${bandeja.phone_number_id}/messages`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: 'Prueba de conexión de Diwilo ✅' } }) });
          paso('Mensaje de prueba', t.ok, t.ok ? `Texto enviado a +${to} (esa persona escribió en las últimas 24 h).` : `Meta no lo envió: ${await errMeta(t)}`);
          return { ok: pasos.every((x) => x.ok), pasos };
        }
        // Fuera de la ventana de 24 h solo se puede mandar una plantilla APROBADA de la cuenta, sin variables («hello_world» solo sirve en los números de prueba de Meta)
        const pl = await llamar(`${GRAPH}/${bandeja.waba_id}/message_templates?status=APPROVED&limit=50&fields=name,language,components`);
        const tpl = pl.ok ? ((await pl.json()).data || []).find((x) => !/\{\{/.test(JSON.stringify(x.components || [])) && x.name !== 'hello_world') : null;
        if (!tpl) paso('Mensaje de prueba', false, `${pl.ok ? 'La cuenta no tiene plantillas aprobadas sin variables.' : `No se pudieron leer las plantillas: ${await errMeta(pl)}.`} Escríbele al número desde otro WhatsApp (esa persona abre la ventana de 24 h) y prueba de nuevo con ese número: así se envía un texto normal.`);
        else {
          const e = await llamar(`${GRAPH}/${bandeja.phone_number_id}/messages`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl.name, language: { code: tpl.language } } }) });
          paso('Mensaje de prueba', e.ok, e.ok ? `Plantilla «${tpl.name}» enviada a +${to}. Debe llegarle en unos segundos.` : `Meta no lo envió: ${await errMeta(e)}${e.status === 400 || e.status === 403 ? '. Si dice «cannot access» o «permission», el usuario del sistema del token no tiene acceso a la cuenta (debe ser Admin, con la app y la cuenta de WhatsApp en control total) y hay que generar el token de nuevo.' : ''}`);
        }
      }
    }
  } catch (e) { paso('Conexión con Meta', false, e.name === 'AbortError' ? 'Meta tardó más de 8 segundos en responder.' : 'No se pudo conectar con Meta.'); }
  return { ok: pasos.every((p) => p.ok), pasos };
}

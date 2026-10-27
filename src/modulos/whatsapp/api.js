// WhatsApp (WhatsApp Cloud API de Meta). Ver: todo el equipo; configurar: propietario y administrador.
//   CRUD  /api/whatsapp/bandejas                 bandejas de entrada (nombre, teléfono +57…, id del número, id de la cuenta, clave API)
//   POST  /api/whatsapp/bandejas/:id/credenciales { api_key?, app_secret? }   guarda la clave API / el secreto (cifrados; nunca se devuelven)
//   POST  /api/whatsapp/bandejas/:id/token       genera otro token de verificación del webhook
//   POST  /api/whatsapp/bandejas/:id/probar      { para? } verifica clave, ID del número y cuenta contra Meta; con `para` manda un mensaje de prueba
//   POST  /api/whatsapp/bandejas/:id/enviar      { para, texto } una persona del equipo responde desde la bandeja
//   CRUD  /api/whatsapp/agentes                  agentes de IA por bandeja (activar/desactivar con PATCH { activo })
//   GET   /api/whatsapp/conversaciones?bandeja=  contactos con su último mensaje · GET /:bandeja/:contacto mensajes · DELETE
// Público (en el dominio de cada app): GET|POST /wa/<slug> = el webhook de la bandeja (webhook.js).
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { cifrarClave, descifrarClave } from '../../lib/ia.js';

const MOD = 'whatsapp', B = '/api/whatsapp', MAX_BANDEJAS = 10, MAX_AGENTES = 5;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

/* ---------- Graph API ---------- */
const GRAPH = 'https://graph.facebook.com/v21.0';
// Manda un texto por la bandeja. Devuelve el estado que queda guardado: enviado | error | sin_clave
export async function enviarTexto(env, bandeja, para, texto) {
  if (!bandeja.clave_cifrada) return { estado: 'sin_clave' };
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
  try {
    const clave = await descifrarClave(env, bandeja.clave_cifrada);
    const r = await fetch(`${GRAPH}/${bandeja.phone_number_id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` }, signal: ac.signal,
      body: JSON.stringify({ messaging_product: 'whatsapp', to: soloDigitos(para), type: 'text', text: { body: String(texto).slice(0, 4000) } }),
    });
    if (!r.ok) console.error('whatsapp envío', r.status, (await r.text()).slice(0, 200));
    return { estado: r.ok ? 'enviado' : 'error' };
  } catch (e) { console.error('whatsapp envío', e.message); return { estado: 'error' }; } finally { clearTimeout(t); }
}
// Verificador de la bandeja (como el de Chatwoot): comprueba la clave API y el ID del número contra Meta y, si se da un destino, manda un mensaje de prueba.
const errMeta = async (r) => { try { const d = await r.json(); return `${d.error?.message || 'Error'}${d.error?.code ? ` (código ${d.error.code})` : ''}`.slice(0, 300); } catch { return `Meta respondió ${r.status}`; } };
export async function probarBandeja(env, bandeja, para) {
  const pasos = [], paso = (nombre, ok, detalle) => { pasos.push({ nombre, ok, detalle }); return ok; };
  if (!bandeja.clave_cifrada) { paso('Clave API', false, 'La bandeja no tiene clave API: guárdala en Ajustes.'); return { ok: false, pasos }; }
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
export async function guardarMensaje(env, { org, bandeja, contacto, nombre = null, rol, contenido, wamid = null, estado = null, ts = now() }) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO wa_mensajes (business_id, bandeja_id, contacto, nombre, ts, rol, contenido, wamid, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(org, bandeja, contacto, nombre, ts, rol, String(contenido).slice(0, 4000), wamid, estado).run();
  return r.meta.changes > 0;
}

/* ---------- entidades ---------- */
const revisarBandeja = (row) => {
  if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre de la bandeja es muy largo (máximo 80 letras)');
  if (row.telefono != null && !/^\+\d{8,15}$/.test(String(row.telefono).replace(/[\s-]/g, ''))) throw new HttpError(400, 'El teléfono debe llevar el indicativo, por ejemplo +57 300 123 4567');
  if (row.phone_number_id != null && !/^\d{5,30}$/.test(row.phone_number_id)) throw new HttpError(400, 'El id del número de teléfono son solo dígitos (lo da Meta)');
  if (row.waba_id != null && !/^\d{5,30}$/.test(row.waba_id)) throw new HttpError(400, 'El id de la cuenta de negocio son solo dígitos (lo da Meta)');
  if (row.telefono) row.telefono = String(row.telefono).replace(/[\s-]/g, '');
};
const claveValida = (k, label) => {
  const v = String(k || '').trim();
  if (v.length < 10 || v.length > 600 || /\s/.test(v)) throw new HttpError(400, `${label} no parece válida`);
  return v;
};
const exigirKek = (env) => { if (!env.CLAVES_KEK) throw new HttpError(500, 'Falta configurar CLAVES_KEK en Diwilo Modulos para guardar claves de forma segura'); };

export const ENTITIES = {
  bandejas: {
    table: 'wa_bandejas', label: 'la bandeja', title: 'nombre', search: ['nombre', 'telefono'], order: 'created_at',
    fields: { nombre: 'text!', telefono: 'text!', phone_number_id: 'text!', waba_id: 'text!', activo: 'bool+' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row, body) {
      revisarBandeja(row);
      if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_bandejas WHERE business_id = ?', c.businessId)).n >= MAX_BANDEJAS) throw new HttpError(400, `Ya tienes ${MAX_BANDEJAS} bandejas`);
      if (await one(c.env, 'SELECT 1 FROM wa_bandejas WHERE business_id = ? AND phone_number_id = ?', c.businessId, row.phone_number_id)) throw new HttpError(409, 'Ya tienes una bandeja con ese id de número de teléfono');
      row.slug = hex(12);
      row.verify_token = hex(16);
      if (body.api_key) { exigirKek(c.env); row.clave_cifrada = await cifrarClave(c.env, claveValida(body.api_key, 'La clave API')); }
      if (body.app_secret) { exigirKek(c.env); row.secreto_cifrado = await cifrarClave(c.env, claveValida(body.app_secret, 'El secreto de la app')); }
    },
    beforeUpdate(c, row) { revisarBandeja(row); },
    async afterDelete(c, before) {
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM wa_mensajes WHERE bandeja_id = ? AND business_id = ?').bind(before.id, c.businessId),
        c.env.DB.prepare('DELETE FROM wa_agentes WHERE bandeja_id = ? AND business_id = ?').bind(before.id, c.businessId),
      ]);
    },
    decorate: (c, rows) => rows.map(({ clave_cifrada, secreto_cifrado, ...b }) => ({
      ...b, tiene_clave: !!clave_cifrada, tiene_secreto: !!secreto_cifrado,
      webhook_url: `${c.ctx?.origin || ''}/wa/${b.slug}`,
      ...(c.canManage || ['owner', 'admin'].includes(c.role) ? {} : { verify_token: null }),
    })),
  },
  agentes: {
    table: 'wa_agentes', label: 'el agente', title: 'nombre', search: ['nombre'], order: 'created_at',
    fields: { nombre: 'text!', bandeja_id: 'int!', instrucciones: 'long', usar_marca: 'bool+', activo: 'bool+' },
    refs: { bandeja_id: 'wa_bandejas' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row) {
      if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre del agente es muy largo (máximo 80 letras)');
      if (row.instrucciones && row.instrucciones.length > 4000) throw new HttpError(400, 'Las instrucciones son muy largas (máximo 4000 letras)');
      if ((await one(c.env, 'SELECT COUNT(*) n FROM wa_agentes WHERE business_id = ? AND bandeja_id = ?', c.businessId, row.bandeja_id)).n >= MAX_AGENTES) throw new HttpError(400, `Una bandeja admite hasta ${MAX_AGENTES} agentes`);
    },
    beforeUpdate(c, row) {
      if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre del agente es muy largo (máximo 80 letras)');
      if (row.instrucciones && row.instrucciones.length > 4000) throw new HttpError(400, 'Las instrucciones son muy largas (máximo 4000 letras)');
    },
    // Solo un agente activo por bandeja: al activar uno, los demás de esa bandeja se apagan
    async afterCreate(c, id, row) { if (row.activo !== 0) await solitario(c, id, row.bandeja_id); },
    async afterUpdate(c, id, row, before) { if (row.activo === 1) await solitario(c, id, before.bandeja_id); },
  },
};
const solitario = (c, id, bandeja) => c.env.DB.prepare('UPDATE wa_agentes SET activo = 0 WHERE business_id = ? AND bandeja_id = ? AND id <> ?').bind(c.businessId, bandeja, id).run();
const api = crud({ get() {}, post() {}, patch() {}, delete() {} }, { base: '/ia/whatsapp', modulo: MOD, entities: ENTITIES });
export { api };

const bandejaDe = async (c, id) => {
  const b = await one(c.env, 'SELECT * FROM wa_bandejas WHERE id = ? AND business_id = ?', Number(id), c.businessId);
  if (!b) throw new HttpError(404, 'No encontrado');
  return b;
};

export const conversaciones = (c, bandeja) => all(c.env, `SELECT m.bandeja_id, b.nombre bandeja, m.contacto, MAX(m.nombre) nombre, MAX(m.ts) ultimo, COUNT(*) mensajes,
    (SELECT contenido FROM wa_mensajes x WHERE x.business_id = m.business_id AND x.bandeja_id = m.bandeja_id AND x.contacto = m.contacto ORDER BY x.ts DESC, x.id DESC LIMIT 1) ultimo_texto
  FROM wa_mensajes m JOIN wa_bandejas b ON b.id = m.bandeja_id WHERE m.business_id = ? ${bandeja ? 'AND m.bandeja_id = ?' : ''}
  GROUP BY m.bandeja_id, m.contacto ORDER BY ultimo DESC LIMIT 100`, ...(bandeja ? [c.businessId, Number(bandeja)] : [c.businessId]));
export const mensajesDe = (c, bandeja, contacto) => all(c.env, 'SELECT id, ts, rol, contenido, estado, nombre FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? ORDER BY ts, id LIMIT 300', c.businessId, Number(bandeja), soloDigitos(contacto));

export function routes(r) {
  crud(r, { base: B, modulo: MOD, entities: ENTITIES });
  r.post(`${B}/bandejas/:id/credenciales`, `manager:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.params.id), body = await readJson(c.req), set = [], args = [];
    exigirKek(c.env);
    if (body.api_key !== undefined) { set.push('clave_cifrada = ?'); args.push(body.api_key ? await cifrarClave(c.env, claveValida(body.api_key, 'La clave API')) : null); }
    if (body.app_secret !== undefined) { set.push('secreto_cifrado = ?'); args.push(body.app_secret ? await cifrarClave(c.env, claveValida(body.app_secret, 'El secreto de la app')) : null); }
    if (!set.length) throw new HttpError(400, 'Envía api_key o app_secret');
    await c.env.DB.prepare(`UPDATE wa_bandejas SET ${set.join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...args, now(), b.id, c.businessId).run();
    await audit(c, `Cambió las credenciales de la bandeja «${b.nombre}»`, { modulo: MOD });
    return json({ ok: true });
  });
  r.post(`${B}/bandejas/:id/token`, `manager:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.params.id), token = hex(16);
    await c.env.DB.prepare('UPDATE wa_bandejas SET verify_token = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(token, now(), b.id, c.businessId).run();
    await audit(c, `Generó otro token de verificación para «${b.nombre}»`, { modulo: MOD });
    return json({ verify_token: token });
  });
  r.post(`${B}/bandejas/:id/probar`, `manager:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.params.id), body = await readJson(c.req);
    const r = await probarBandeja(c.env, b, body.para ? String(body.para).slice(0, 30) : null);
    await audit(c, `Probó la conexión de la bandeja «${b.nombre}»${r.ok ? '' : ' (con fallas)'}`, { modulo: MOD });
    return json(r);
  });
  r.post(`${B}/bandejas/:id/enviar`, `tenant:${MOD}`, async (c) => {
    const b = await bandejaDe(c, c.params.id), body = await readJson(c.req);
    const para = soloDigitos(body.para), texto = String(body.texto || '').trim();
    if (para.length < 8 || para.length > 15) throw new HttpError(400, 'El número de destino no es válido');
    if (!texto || texto.length > 4000) throw new HttpError(400, 'Escribe un mensaje (máximo 4000 letras)');
    if (!b.activo) throw new HttpError(400, 'La bandeja está desactivada');
    const { estado } = await enviarTexto(c.env, b, para, texto);
    await guardarMensaje(c.env, { org: c.businessId, bandeja: b.id, contacto: para, rol: 'humano', contenido: texto, estado });
    if (estado !== 'enviado') throw new HttpError(estado === 'sin_clave' ? 400 : 502, estado === 'sin_clave' ? 'La bandeja no tiene clave API: agrégala para poder enviar' : 'WhatsApp no aceptó el mensaje (revisa la clave API y que el número esté activo)');
    return json({ ok: true, estado });
  });
  r.get(`${B}/conversaciones`, `tenant:${MOD}`, async (c) => json({ rows: await conversaciones(c, c.url.searchParams.get('bandeja')) }));
  r.get(`${B}/conversaciones/:bandeja/:contacto`, `tenant:${MOD}`, async (c) => { await bandejaDe(c, c.params.bandeja); return json({ mensajes: await mensajesDe(c, c.params.bandeja, c.params.contacto) }); });
  r.delete(`${B}/conversaciones/:bandeja/:contacto`, `manager:${MOD}`, async (c) => {
    await bandejaDe(c, c.params.bandeja);
    await c.env.DB.prepare('DELETE FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ?').bind(c.businessId, Number(c.params.bandeja), soloDigitos(c.params.contacto)).run();
    await audit(c, `Borró una conversación de WhatsApp (${soloDigitos(c.params.contacto)})`, { modulo: MOD });
    return json({ ok: true });
  });
}

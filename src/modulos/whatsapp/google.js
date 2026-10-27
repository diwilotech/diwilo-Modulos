// Conexión con Google por negocio: Gmail (enviar las respuestas del canal de correo y leer los correos nuevos) y Calendar (agendar citas con Meet).
// El equipo sube el JSON de credenciales del cliente OAuth de Google Cloud, conecta su cuenta y el módulo guarda el token permanente cifrado.
import { all, one, now } from '../../lib/crud.js';
import { cifrarClave, descifrarClave } from '../../lib/ia.js';

export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy'];
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
export class GoogleError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

/* ---------- credenciales y conexión ---------- */
// Acepta el JSON que se descarga de Google Cloud («web» o «installed») o los dos valores sueltos
export function leerCredenciales(entrada) {
  let d = entrada;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { throw new GoogleError('El archivo no es un JSON válido: descarga el JSON del cliente OAuth desde Google Cloud'); } }
  const o = d?.web || d?.installed || d;
  const id = String(o?.client_id || '').trim(), secreto = String(o?.client_secret || '').trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new GoogleError('No encontré el client_id de Google (termina en .apps.googleusercontent.com)');
  if (secreto.length < 10 || /\s/.test(secreto)) throw new GoogleError('No encontré el client_secret en el archivo');
  return { client_id: id, client_secret: secreto };
}
export async function guardarCredenciales(env, org, { client_id, client_secret }) {
  if (!env.CLAVES_KEK) throw new GoogleError('Falta configurar CLAVES_KEK en Diwilo Modulos para guardar claves de forma segura', 500);
  const t = now(), cif = await cifrarClave(env, client_secret);
  await env.DB.prepare(`INSERT INTO wa_google (business_id, client_id, secreto_cifrado, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (business_id) DO UPDATE SET client_id = excluded.client_id, secreto_cifrado = excluded.secreto_cifrado, refresh_cifrado = NULL, email = NULL, scopes = NULL, conectado_at = NULL, cuenta_gmail = NULL, cuenta_calendario = NULL, estado = NULL, estado_exp = NULL, updated_at = excluded.updated_at`).bind(org, client_id, cif, t, t).run();
  await env.DB.prepare('DELETE FROM wa_google_cuentas WHERE business_id = ?').bind(org).run();   // los tokens eran de otro cliente OAuth
  cacheTokens.clear();
}
export const filaGoogle = (env, org) => one(env, 'SELECT * FROM wa_google WHERE business_id = ?', org);
// Cuenta que se usa para un fin: 'gmail' (enviar y leer correo) o 'calendario' (citas con Meet)
export async function cuentaPara(env, org, uso = 'gmail') {
  const g = await filaGoogle(env, org), id = uso === 'calendario' ? g?.cuenta_calendario : g?.cuenta_gmail;
  return id ? one(env, 'SELECT * FROM wa_google_cuentas WHERE id = ? AND business_id = ?', id, org) : null;
}
export async function conectado(env, org, uso = 'gmail') { return !!(await cuentaPara(env, org, uso)); }
export async function estadoGoogle(env, org) {
  const g = await filaGoogle(env, org), cuentas = await all(env, 'SELECT id, email, scopes, conectado_at FROM wa_google_cuentas WHERE business_id = ? ORDER BY id', org);
  let agenda = null; try { agenda = g?.agenda ? JSON.parse(g.agenda) : null; } catch { /* sin horario */ }
  const cg = cuentas.find((c) => c.id === g?.cuenta_gmail), cc = cuentas.find((c) => c.id === g?.cuenta_calendario);
  return { credenciales: !!g?.client_id, client_id: g?.client_id ? `${g.client_id.slice(0, 12)}…${g.client_id.slice(-30)}` : null, conectado: cuentas.length > 0,
    cuentas: cuentas.map((c) => ({ id: c.id, email: c.email, permisos: String(c.scopes || '').split(' ').filter((x) => x.startsWith('https://')).map((x) => x.split('/').pop()), conectado_at: c.conectado_at })),
    cuenta_gmail: cg?.id || null, cuenta_calendario: cc?.id || null, email: cg?.email || cuentas[0]?.email || null, gmail_activo: g ? !!g.gmail_activo : true, agenda: { ...AGENDA_BASE, ...(agenda || {}) } };
}
export async function urlConexion(env, org, redirect, correo = '') {
  const g = await filaGoogle(env, org);
  if (!g?.client_id) throw new GoogleError('Primero sube las credenciales de Google');
  const estado = hex(20);
  await env.DB.prepare('UPDATE wa_google SET estado = ?, estado_exp = ? WHERE business_id = ?').bind(estado, now() + 15 * 60000, org).run();
  const p = new URLSearchParams({ client_id: g.client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: estado, ...(/^[^\s@]+@[^\s@]+$/.test(correo) ? { login_hint: correo } : {}) });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}
const pedirToken = async (env, g, params) => {
  const secreto = await descifrarClave(env, g.secreto_cifrado);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: g.client_id, client_secret: secreto, ...params }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // invalid_grant: el permiso venció (apps en modo «Prueba» de Google: a los 7 días), se revocó o cambió la contraseña
    if (d.error === 'invalid_grant' && params.grant_type === 'refresh_token') throw new GoogleError('El permiso de esa cuenta de Google venció o fue revocado: vuelve a conectarla en Mensajes → Google. (Si tu app de Google está en modo «Prueba», publícala para que no venza cada 7 días.)', 403);
    throw new GoogleError(d.error_description || d.error || `Google respondió ${r.status}`, 502);
  }
  return d;
};
// Vuelta de Google: cambia el código por el token permanente. Devuelve { org, email }
export async function completarConexion(env, { code, state, redirect }) {
  const g = state ? await one(env, 'SELECT * FROM wa_google WHERE estado = ?', String(state)) : null;
  if (!g || !g.estado_exp || g.estado_exp < now()) throw new GoogleError('La conexión expiró o no es válida: vuelve a pulsar «Conectar con Google»');
  const d = await pedirToken(env, g, { code: String(code || ''), grant_type: 'authorization_code', redirect_uri: redirect });
  if (!d.refresh_token) throw new GoogleError('Google no entregó el permiso permanente. Quita el acceso de esta app en myaccount.google.com/permissions y vuelve a conectar.');
  let email = null;
  try { const u = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${d.access_token}` } })).json(); email = String(u.email || '').toLowerCase() || null; } catch { /* sin correo */ }
  if (!email) throw new GoogleError('Google no entregó el correo de la cuenta: vuelve a conectar aceptando el permiso de correo electrónico');
  await env.DB.prepare(`INSERT INTO wa_google_cuentas (business_id, email, refresh_cifrado, scopes, conectado_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (business_id, email) DO UPDATE SET refresh_cifrado = excluded.refresh_cifrado, scopes = excluded.scopes, conectado_at = excluded.conectado_at`).bind(g.business_id, email, await cifrarClave(env, d.refresh_token), d.scope || SCOPES.join(' '), now()).run();
  const cu = await one(env, 'SELECT id FROM wa_google_cuentas WHERE business_id = ? AND email = ?', g.business_id, email);
  // La primera cuenta sirve para todo; las siguientes se asignan a mano (correo o calendario)
  await env.DB.prepare('UPDATE wa_google SET cuenta_gmail = COALESCE(cuenta_gmail, ?), cuenta_calendario = COALESCE(cuenta_calendario, ?), gmail_desde = COALESCE(gmail_desde, ?), estado = NULL, estado_exp = NULL, updated_at = ? WHERE business_id = ?')
    .bind(cu.id, cu.id, Math.floor(now() / 1000) - 600, now(), g.business_id).run();
  cacheTokens.delete(cu.id);
  return { org: g.business_id, email };
}
export async function desconectar(env, org, cuentaId = null) {
  const cuentas = await all(env, `SELECT * FROM wa_google_cuentas WHERE business_id = ?${cuentaId ? ' AND id = ?' : ''}`, ...(cuentaId ? [org, Number(cuentaId)] : [org]));
  for (const c of cuentas) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await descifrarClave(env, c.refresh_cifrado))}`, { method: 'POST' }); } catch { /* ya no sirve igual */ }
    await env.DB.prepare('DELETE FROM wa_google_cuentas WHERE id = ?').bind(c.id).run();
    cacheTokens.delete(c.id);
  }
  // Los usos que apuntaban a una cuenta quitada pasan a otra que quede (o a ninguna)
  const resto = (await all(env, 'SELECT id FROM wa_google_cuentas WHERE business_id = ? ORDER BY id', org)).map((x) => x.id), g = await filaGoogle(env, org);
  const ok = (id) => (resto.includes(id) ? id : resto[0] ?? null);
  await env.DB.prepare('UPDATE wa_google SET cuenta_gmail = ?, cuenta_calendario = ?, estado = NULL, estado_exp = NULL, updated_at = ? WHERE business_id = ?').bind(ok(g?.cuenta_gmail), ok(g?.cuenta_calendario), now(), org).run();
}
// Qué cuenta se usa para el correo y cuál para el calendario
export async function asignarUsos(env, org, { cuenta_gmail, cuenta_calendario }) {
  const existe = async (id) => !id || !!(await one(env, 'SELECT 1 FROM wa_google_cuentas WHERE id = ? AND business_id = ?', Number(id), org));
  if (!(await existe(cuenta_gmail)) || !(await existe(cuenta_calendario))) throw new GoogleError('Esa cuenta no está conectada');
  await env.DB.prepare('UPDATE wa_google SET cuenta_gmail = COALESCE(?, cuenta_gmail), cuenta_calendario = COALESCE(?, cuenta_calendario), gmail_desde = ?, updated_at = ? WHERE business_id = ?').bind(cuenta_gmail ? Number(cuenta_gmail) : null, cuenta_calendario ? Number(cuenta_calendario) : null, Math.floor(now() / 1000) - 600, now(), org).run();
  cacheHuecos.delete(org);
}
const cacheTokens = new Map();
export async function tokenDe(env, org, uso = 'gmail') {
  const cu = await cuentaPara(env, org, uso);
  if (!cu) throw new GoogleError(uso === 'calendario' ? 'No hay una cuenta de Google conectada para el calendario' : 'Google no está conectado');
  const c = cacheTokens.get(cu.id);
  if (c && c.exp > Date.now() + 60000) return c.t;
  const g = await filaGoogle(env, org);
  const d = await pedirToken(env, g, { grant_type: 'refresh_token', refresh_token: await descifrarClave(env, cu.refresh_cifrado) });
  cacheTokens.set(cu.id, { t: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 });
  return d.access_token;
}
export async function gapi(env, org, url, init = {}, uso = 'gmail') {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${await tokenDe(env, org, uso)}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const txt = await r.text(); let d = null; try { d = txt ? JSON.parse(txt) : null; } catch { /* no JSON */ }
  if (!r.ok) throw new GoogleError(d?.error?.message || `Google respondió ${r.status}`, r.status === 401 || r.status === 403 ? 403 : 502);
  return d;
}

/* ---------- Gmail ---------- */
const utf8b64 = (s) => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin); };
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s) => { const b = atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))); };
const encCab = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`);
// Correo listo para la API de Gmail (texto plano UTF-8)
export function armarCorreo({ de, nombre, para, copia, responderA, asunto, texto, enReplyA, referencias }) {
  const cab = [`From: ${nombre ? `${encCab(nombre)} <${de}>` : de}`, `To: ${para}`, ...(copia ? [`Cc: ${copia}`] : []), ...(responderA ? [`Reply-To: ${responderA}`] : []), `Subject: ${encCab(asunto)}`, ...(enReplyA ? [`In-Reply-To: ${enReplyA}`] : []), ...(referencias ? [`References: ${referencias}`] : []), 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  return `${cab.join('\r\n')}\r\n\r\n${(utf8b64(texto).match(/.{1,76}/g) || []).join('\r\n')}`;
}
// Responde por Gmail en el mismo hilo (si encuentra el correo original en Gmail) y queda en «Enviados». Desde la dirección de la bandeja si es un alias «Enviar como»; si no, desde la cuenta conectada con Reply-To a la bandeja.
export async function enviarGmail(env, bandeja, para, texto, { asunto, ref } = {}) {
  const org = bandeja.business_id, cu = await cuentaPara(env, org, 'gmail');
  let de = cu?.email, nombre = bandeja.nombre;
  try { const alias = (await gapi(env, org, 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs'))?.sendAs?.find((a) => String(a.sendAsEmail).toLowerCase() === String(bandeja.phone_number_id).toLowerCase() && (!a.verificationStatus || a.verificationStatus === 'accepted')); if (alias) { de = alias.sendAsEmail; nombre = alias.displayName || nombre; } } catch { /* sin permiso de alias: se envía desde la cuenta */ }
  if (!de) throw new GoogleError('No sé desde qué cuenta enviar: vuelve a conectar Google');
  let threadId = null;
  if (ref) { try { const id = String(ref).replace(/^<|>$/g, ''); threadId = (await gapi(env, org, `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`rfc822msgid:${id}`)}&maxResults=1`))?.messages?.[0]?.threadId || null; } catch { /* sin hilo: sale como correo nuevo con Re: */ } }
  const subject = /^\s*re:/i.test(asunto || '') ? asunto : `Re: ${asunto || 'tu mensaje'}`;
  const cc = (await agendaDe(env, org)).copia;   // copia de cada respuesta (p. ej. hola@): si responden a todos, también llega a la bandeja
  const raw = b64url(armarCorreo({ de, nombre, para, copia: cc && cc !== String(para).toLowerCase() && cc !== String(de).toLowerCase() ? cc : null, responderA: String(de).toLowerCase() === String(bandeja.phone_number_id).toLowerCase() ? null : bandeja.phone_number_id, asunto: subject.slice(0, 200), texto: String(texto).slice(0, 20000), enReplyA: ref || null, referencias: ref || null }));
  await gapi(env, org, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
  return { de, cuenta: cu.email, alias: String(de).toLowerCase() !== String(cu.email).toLowerCase() };
}
const cab = (m, n) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === n)?.value || '';
function textoDe(p) {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return deB64url(p.body.data);
  for (const x of p.parts || []) { const t = textoDe(x); if (t) return t; }
  if (p.mimeType === 'text/html' && p.body?.data) return deB64url(p.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return '';
}
// Lee los correos nuevos de Gmail dirigidos a cada bandeja de correo (al abrir Mensajes, cada 90 s como máximo, y en la tarea diaria). `registrar(bandeja, datos)` los guarda como chats.
export async function sincronizarGmail(env, registrar, soloOrg = null) {
  const filas = await all(env, `SELECT business_id, gmail_desde FROM wa_google WHERE cuenta_gmail IS NOT NULL AND gmail_activo = 1${soloOrg ? ' AND business_id = ?' : ''}`, ...(soloOrg ? [soloOrg] : []));
  for (const f of filas) {
    try {
      const bandejas = await all(env, "SELECT * FROM wa_bandejas WHERE business_id = ? AND canal = 'correo' AND activo = 1", f.business_id);
      if (!bandejas.length) continue;
      const desde = f.gmail_desde || Math.floor(now() / 1000) - 600, ahora = Math.floor(now() / 1000);
      for (const b of bandejas) {
        const lista = await gapi(env, f.business_id, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(`to:${b.phone_number_id} -from:me after:${desde}`)}`);
        for (const x of lista?.messages || []) {
          const m = await gapi(env, f.business_id, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${x.id}?format=full`);
          const de = cab(m, 'from'), dir = (de.match(/<([^>]+)>/)?.[1] || de).trim().toLowerCase(), nombre = (de.match(/^"?([^"<]+?)"?\s*</)?.[1] || '').trim() || null;
          const auto = (cab(m, 'auto-submitted') && cab(m, 'auto-submitted').toLowerCase() !== 'no') || /bulk|list|junk|auto_reply/i.test(cab(m, 'precedence')) || cab(m, 'list-id') || /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce|notifications?@)/i.test(dir);
          if (auto) continue;
          await registrar(b, { de: dir, nombre, asunto: cab(m, 'subject'), texto: textoDe(m.payload), id: cab(m, 'message-id') || x.id, ref: cab(m, 'message-id') || null, ts: Number(m.internalDate) || now() });
        }
      }
      await env.DB.prepare('UPDATE wa_google SET gmail_desde = ? WHERE business_id = ?').bind(ahora - 120, f.business_id).run();
    } catch (e) { console.error('gmail sincronizar', f.business_id, e.message); }
  }
}

/* ---------- Calendar ---------- */
export const AGENDA_BASE = { offset: -300, dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '17:00', duracion: 45, buffer: 15, adelanto_dias: 14, minimo_horas: 4, titulo: 'Asesoría Diwilo – {nombre}', calendario: 'primary', copia: '', envio: 'gmail' };
export function normalizarAgenda(a = {}) {
  const hm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : d), n = (v, d, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : d);
  const o = { ...AGENDA_BASE, ...a };
  return { offset: n(o.offset, -300, -720, 840), dias: [...new Set((Array.isArray(o.dias) ? o.dias : AGENDA_BASE.dias).map(Number).filter((d) => d >= 0 && d <= 6))], desde: hm(o.desde, '08:00'), hasta: hm(o.hasta, '17:00'), duracion: n(o.duracion, 45, 10, 240), buffer: n(o.buffer, 15, 0, 120), adelanto_dias: n(o.adelanto_dias, 14, 1, 60), minimo_horas: n(o.minimo_horas, 4, 0, 168),
    titulo: String(o.titulo || AGENDA_BASE.titulo).slice(0, 120), calendario: String(o.calendario || 'primary').slice(0, 200),
    copia: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(o.copia || '').trim()) ? String(o.copia).trim().toLowerCase() : '', envio: o.envio === 'cloudflare' ? 'cloudflare' : 'gmail' };
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function etiquetaHora(ms, offset) {
  const d = new Date(ms + offset * 60000), h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} ${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
// Horarios libres: dentro del horario de atención, sin cruzarse con lo ocupado (busy = [{ start, end }] en ISO). Hasta 3 por día y 9 en total.
export function calcularHuecos(a, busy, desdeMs = Date.now()) {
  const ocup = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)]), out = [], min = desdeMs + a.minimo_horas * 3600000;
  const [h1, m1] = a.desde.split(':').map(Number), [h2, m2] = a.hasta.split(':').map(Number), ini = h1 * 60 + m1, fin = h2 * 60 + m2;
  for (let i = 0; i <= a.adelanto_dias && out.length < 9; i++) {
    const loc = new Date(desdeMs + a.offset * 60000 + i * 86400000);
    if (!a.dias.includes(loc.getUTCDay())) continue;
    const dia = [];
    for (let t = ini; t + a.duracion <= fin; t += a.duracion + a.buffer) {
      const inicio = Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate()) + t * 60000 - a.offset * 60000, final = inicio + a.duracion * 60000;
      if (inicio < min || ocup.some(([s, e]) => inicio < e + a.buffer * 60000 && final > s - a.buffer * 60000)) continue;
      dia.push({ iso: new Date(inicio).toISOString(), etiqueta: etiquetaHora(inicio, a.offset) });
    }
    if (dia.length > 3) { const paso = (dia.length - 1) / 2; out.push(...[0, 1, 2].map((k) => dia[Math.round(k * paso)])); } else out.push(...dia);
  }
  return out.slice(0, 9);
}
export async function agendaDe(env, org) { const g = await filaGoogle(env, org); let a = {}; try { a = g?.agenda ? JSON.parse(g.agenda) : {}; } catch { /* base */ } return normalizarAgenda(a); }
const cacheHuecos = new Map();
export async function huecosLibres(env, org, { fresco = false } = {}) {
  const c = cacheHuecos.get(org);
  if (!fresco && c && Date.now() - c.at < 120000) return c.v;
  const a = await agendaDe(env, org);
  const f = await gapi(env, org, 'https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + (a.adelanto_dias + 1) * 86400000).toISOString(), timeZone: 'UTC', items: [{ id: a.calendario }] }) }, 'calendario');
  const busy = Object.values(f?.calendars || {})[0]?.busy || [];
  const v = { agenda: a, slots: calcularHuecos(a, busy) };
  cacheHuecos.set(org, { at: Date.now(), v });
  return v;
}
// Crea la cita con Meet e invita a la persona. `inicio` debe ser uno de los horarios libres.
export async function crearCita(env, org, { inicio, nombre, correo, descripcion }) {
  const { agenda, slots } = await huecosLibres(env, org, { fresco: true });
  if (!slots.some((s) => s.iso === new Date(inicio).toISOString())) throw new GoogleError('Ese horario ya no está libre');
  const ini = new Date(inicio), fin = new Date(ini.getTime() + agenda.duracion * 60000);
  const ev = await gapi(env, org, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(agenda.calendario)}/events?conferenceDataVersion=1&sendUpdates=all`, { method: 'POST', body: JSON.stringify({
    summary: agenda.titulo.replace(/\{nombre\}/gi, nombre || 'cliente'), description: descripcion || 'Cita agendada por el asistente de Mensajes.', start: { dateTime: ini.toISOString() }, end: { dateTime: fin.toISOString() },
    attendees: [{ email: correo, ...(nombre ? { displayName: nombre } : {}) }, ...(agenda.copia && agenda.copia !== String(correo).toLowerCase() ? [{ email: agenda.copia }] : [])], conferenceData: { createRequest: { requestId: hex(8), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }) }, 'calendario');
  cacheHuecos.delete(org);
  return { id: ev.id, inicio: ini.toISOString(), etiqueta: etiquetaHora(ini.getTime(), agenda.offset), link: ev.hangoutLink || ev.htmlLink || null };
}

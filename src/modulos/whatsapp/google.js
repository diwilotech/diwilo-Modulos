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
    ON CONFLICT (business_id) DO UPDATE SET client_id = excluded.client_id, secreto_cifrado = excluded.secreto_cifrado, refresh_cifrado = NULL, email = NULL, scopes = NULL, conectado_at = NULL, estado = NULL, estado_exp = NULL, updated_at = excluded.updated_at`).bind(org, client_id, cif, t, t).run();
}
export const filaGoogle = (env, org) => one(env, 'SELECT * FROM wa_google WHERE business_id = ?', org);
export async function conectado(env, org) { const g = await filaGoogle(env, org); return !!g?.refresh_cifrado; }
export async function estadoGoogle(env, org) {
  const g = await filaGoogle(env, org);
  let agenda = null; try { agenda = g?.agenda ? JSON.parse(g.agenda) : null; } catch { /* sin horario */ }
  return { credenciales: !!g?.client_id, client_id: g?.client_id ? `${g.client_id.slice(0, 12)}…${g.client_id.slice(-30)}` : null, conectado: !!g?.refresh_cifrado, email: g?.email || null, scopes: g?.scopes ? g.scopes.split(' ').filter((s) => s.startsWith('https://')).map((s) => s.split('/').pop()) : [], conectado_at: g?.conectado_at || null, gmail_activo: g ? !!g.gmail_activo : true, agenda: { ...AGENDA_BASE, ...(agenda || {}) } };
}
export async function urlConexion(env, org, redirect) {
  const g = await filaGoogle(env, org);
  if (!g?.client_id) throw new GoogleError('Primero sube las credenciales de Google');
  const estado = hex(20);
  await env.DB.prepare('UPDATE wa_google SET estado = ?, estado_exp = ? WHERE business_id = ?').bind(estado, now() + 15 * 60000, org).run();
  const p = new URLSearchParams({ client_id: g.client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: estado });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}
const pedirToken = async (env, g, params) => {
  const secreto = await descifrarClave(env, g.secreto_cifrado);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: g.client_id, client_secret: secreto, ...params }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new GoogleError(d.error_description || d.error || `Google respondió ${r.status}`, 502);
  return d;
};
// Vuelta de Google: cambia el código por el token permanente. Devuelve { org, email }
export async function completarConexion(env, { code, state, redirect }) {
  const g = state ? await one(env, 'SELECT * FROM wa_google WHERE estado = ?', String(state)) : null;
  if (!g || !g.estado_exp || g.estado_exp < now()) throw new GoogleError('La conexión expiró o no es válida: vuelve a pulsar «Conectar con Google»');
  const d = await pedirToken(env, g, { code: String(code || ''), grant_type: 'authorization_code', redirect_uri: redirect });
  if (!d.refresh_token) throw new GoogleError('Google no entregó el permiso permanente. Quita el acceso de esta app en myaccount.google.com/permissions y vuelve a conectar.');
  let email = null;
  try { const u = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${d.access_token}` } })).json(); email = u.email || null; } catch { /* sin correo */ }
  await env.DB.prepare('UPDATE wa_google SET refresh_cifrado = ?, email = ?, scopes = ?, conectado_at = ?, gmail_desde = ?, estado = NULL, estado_exp = NULL, updated_at = ? WHERE business_id = ?')
    .bind(await cifrarClave(env, d.refresh_token), email, d.scope || SCOPES.join(' '), now(), Math.floor(now() / 1000) - 600, now(), g.business_id).run();
  tokens.delete(g.business_id);
  return { org: g.business_id, email };
}
export async function desconectar(env, org) {
  const g = await filaGoogle(env, org);
  if (g?.refresh_cifrado) { try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await descifrarClave(env, g.refresh_cifrado))}`, { method: 'POST' }); } catch { /* ya no sirve igual */ } }
  await env.DB.prepare('UPDATE wa_google SET refresh_cifrado = NULL, email = NULL, scopes = NULL, conectado_at = NULL, estado = NULL, estado_exp = NULL, updated_at = ? WHERE business_id = ?').bind(now(), org).run();
  tokens.delete(org);
}
const tokens = new Map();
export async function tokenDe(env, org) {
  const c = tokens.get(org);
  if (c && c.exp > Date.now() + 60000) return c.t;
  const g = await filaGoogle(env, org);
  if (!g?.refresh_cifrado) throw new GoogleError('Google no está conectado');
  const d = await pedirToken(env, g, { grant_type: 'refresh_token', refresh_token: await descifrarClave(env, g.refresh_cifrado) });
  tokens.set(org, { t: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 });
  return d.access_token;
}
export async function gapi(env, org, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${await tokenDe(env, org)}`, 'content-type': 'application/json', ...(init.headers || {}) } });
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
export function armarCorreo({ de, nombre, para, responderA, asunto, texto, enReplyA, referencias }) {
  const cab = [`From: ${nombre ? `${encCab(nombre)} <${de}>` : de}`, `To: ${para}`, ...(responderA ? [`Reply-To: ${responderA}`] : []), `Subject: ${encCab(asunto)}`, ...(enReplyA ? [`In-Reply-To: ${enReplyA}`] : []), ...(referencias ? [`References: ${referencias}`] : []), 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  return `${cab.join('\r\n')}\r\n\r\n${(utf8b64(texto).match(/.{1,76}/g) || []).join('\r\n')}`;
}
// Responde por Gmail en el mismo hilo (si encuentra el correo original en Gmail) y queda en «Enviados». Desde la dirección de la bandeja si es un alias «Enviar como»; si no, desde la cuenta conectada con Reply-To a la bandeja.
export async function enviarGmail(env, bandeja, para, texto, { asunto, ref } = {}) {
  const org = bandeja.business_id, g = await filaGoogle(env, org);
  let de = g?.email, nombre = bandeja.nombre;
  try { const alias = (await gapi(env, org, 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs'))?.sendAs?.find((a) => String(a.sendAsEmail).toLowerCase() === String(bandeja.phone_number_id).toLowerCase() && (!a.verificationStatus || a.verificationStatus === 'accepted')); if (alias) { de = alias.sendAsEmail; nombre = alias.displayName || nombre; } } catch { /* sin permiso de alias: se envía desde la cuenta */ }
  if (!de) throw new GoogleError('No sé desde qué cuenta enviar: vuelve a conectar Google');
  let threadId = null;
  if (ref) { try { const id = String(ref).replace(/^<|>$/g, ''); threadId = (await gapi(env, org, `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`rfc822msgid:${id}`)}&maxResults=1`))?.messages?.[0]?.threadId || null; } catch { /* sin hilo: sale como correo nuevo con Re: */ } }
  const subject = /^\s*re:/i.test(asunto || '') ? asunto : `Re: ${asunto || 'tu mensaje'}`;
  const raw = b64url(armarCorreo({ de, nombre, para, responderA: String(de).toLowerCase() === String(bandeja.phone_number_id).toLowerCase() ? null : bandeja.phone_number_id, asunto: subject.slice(0, 200), texto: String(texto).slice(0, 20000), enReplyA: ref || null, referencias: ref || null }));
  await gapi(env, org, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
}
const cab = (m, n) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === n)?.value || '';
function textoDe(p) {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return deB64url(p.body.data);
  for (const x of p.parts || []) { const t = textoDe(x); if (t) return t; }
  if (p.mimeType === 'text/html' && p.body?.data) return deB64url(p.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return '';
}
// Lee los correos nuevos de Gmail dirigidos a cada bandeja de correo (se llama cada 2 minutos). `registrar(bandeja, datos)` los guarda como chats.
export async function sincronizarGmail(env, registrar) {
  const filas = await all(env, 'SELECT business_id, gmail_desde FROM wa_google WHERE refresh_cifrado IS NOT NULL AND gmail_activo = 1');
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
export const AGENDA_BASE = { offset: -300, dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '17:00', duracion: 45, buffer: 15, adelanto_dias: 14, minimo_horas: 4, titulo: 'Asesoría Diwilo – {nombre}', calendario: 'primary' };
export function normalizarAgenda(a = {}) {
  const hm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : d), n = (v, d, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : d);
  const o = { ...AGENDA_BASE, ...a };
  return { offset: n(o.offset, -300, -720, 840), dias: [...new Set((Array.isArray(o.dias) ? o.dias : AGENDA_BASE.dias).map(Number).filter((d) => d >= 0 && d <= 6))], desde: hm(o.desde, '08:00'), hasta: hm(o.hasta, '17:00'), duracion: n(o.duracion, 45, 10, 240), buffer: n(o.buffer, 15, 0, 120), adelanto_dias: n(o.adelanto_dias, 14, 1, 60), minimo_horas: n(o.minimo_horas, 4, 0, 168),
    titulo: String(o.titulo || AGENDA_BASE.titulo).slice(0, 120), calendario: String(o.calendario || 'primary').slice(0, 200) };
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
  const f = await gapi(env, org, 'https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + (a.adelanto_dias + 1) * 86400000).toISOString(), timeZone: 'UTC', items: [{ id: a.calendario }] }) });
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
    attendees: [{ email: correo, ...(nombre ? { displayName: nombre } : {}) }], conferenceData: { createRequest: { requestId: hex(8), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }) });
  cacheHuecos.delete(org);
  return { id: ev.id, inicio: ini.toISOString(), etiqueta: etiquetaHora(ini.getTime(), agenda.offset), link: ev.hangoutLink || ev.htmlLink || null };
}

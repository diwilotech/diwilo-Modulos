// Fotos, videos, audios y documentos de los chats: se descargan de Meta (WhatsApp por el id del archivo; Instagram y Messenger por su dirección), se guardan en R2 y se sirven
// por el RPC media() con la sesión de la app. La IA puede transcribir audios, describir fotos y resumir PDFs. Los archivos que el equipo guarda van a la biblioteca («Archivos»).
import { one, all, now } from '../../lib/crud.js';
import { HttpError } from '../../lib/http.js';
import { entenderArchivo } from '../../lib/ia.js';
import { graph, GRAPH } from './canales.js';

export const MAX_BYTES = 25 * 1024 * 1024;      // más grande que esto no se guarda
export const MAX_IA = 12 * 1024 * 1024;         // más grande que esto no se manda a la IA
export const ETIQUETA = { imagen: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', documento: '📎 Documento', sticker: '🙂 Sticker' };
export const tipoDeMime = (mime = '') => (/^image\//.test(mime) ? 'imagen' : /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'documento');
const limpiarMime = (m) => String(m || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
const marcar = (env, id, estado, mime = null, bytes = null) => env.DB.prepare('UPDATE wa_mensajes SET media_estado = ?, media_mime = COALESCE(?, media_mime), media_bytes = COALESCE(?, media_bytes) WHERE id = ?').bind(estado, mime, bytes, id).run();

// Descarga el archivo de un mensaje a R2 (una sola vez). Devuelve la fila actualizada o null.
export async function descargarMedia(env, bandeja, m) {
  if (m.media_key) return m;
  if (!m.media_ref || !env.MEDIA) return null;
  try {
    let res, mime = m.media_mime;
    if (bandeja.canal === 'whatsapp') {
      const meta = await graph(env, bandeja, `${GRAPH}/${encodeURIComponent(m.media_ref)}`);
      if (!meta.ok) throw new Error(`Meta respondió ${meta.status} al pedir el archivo`);
      const d = await meta.json();
      mime = d.mime_type || mime;
      if (Number(d.file_size) > MAX_BYTES) { await marcar(env, m.id, 'grande', mime, d.file_size); return null; }
      res = await graph(env, bandeja, d.url, {}, 40000);
    } else {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 40000);
      try { res = await fetch(m.media_ref, { signal: ac.signal }); } finally { clearTimeout(t); }
    }
    if (!res.ok) throw new Error(`No se pudo descargar (${res.status})`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) { await marcar(env, m.id, 'grande', limpiarMime(res.headers.get('content-type') || mime)); return null; }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) { await marcar(env, m.id, 'grande', null, bytes.byteLength); return null; }
    mime = limpiarMime(res.headers.get('content-type') && !/octet-stream/.test(res.headers.get('content-type')) ? res.headers.get('content-type') : mime);
    const key = `${m.business_id}/${m.bandeja_id}/${m.id}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
    await env.DB.prepare("UPDATE wa_mensajes SET media_key = ?, media_mime = ?, media_bytes = ?, media_estado = 'listo', tipo = COALESCE(NULLIF(tipo, 'documento'), ?) WHERE id = ?").bind(key, mime, bytes.byteLength, m.tipo === 'documento' || !m.tipo ? tipoDeMime(mime) : m.tipo, m.id).run();
    return one(env, 'SELECT * FROM wa_mensajes WHERE id = ?', m.id);
  } catch (e) {
    console.error('media descargar', e.message);
    await marcar(env, m.id, 'error');
    return null;
  }
}

// La IA entiende el archivo (audio → transcripción, foto → descripción, PDF → resumen) y lo deja en el mensaje. Devuelve el texto.
export async function entenderMensaje(env, bandeja, m) {
  if (m.media_texto) return m.media_texto;
  if (!['audio', 'imagen', 'documento'].includes(m.tipo)) throw new HttpError(422, m.tipo === 'video' ? 'Los videos todavía no se pueden analizar con IA' : 'Este archivo no se puede analizar con IA');
  let texto;
  if (/^\s*\[prueba\]/.test(m.contenido || '')) texto = m.tipo === 'audio' ? 'Transcripción de prueba' : 'Descripción de prueba';   // pruebas: sin gastar IA
  else {
    const fila = m.media_key ? m : await descargarMedia(env, bandeja, m);
    if (!fila?.media_key) throw new HttpError(502, 'No pude descargar el archivo de Meta (puede haber vencido o ser muy grande)');
    if (m.tipo === 'documento' && fila.media_mime !== 'application/pdf') throw new HttpError(422, 'Solo se pueden resumir documentos PDF');
    const obj = await env.MEDIA.get(fila.media_key);
    if (!obj || obj.size > MAX_IA) throw new HttpError(422, 'El archivo es muy grande para la IA (máximo 12 MB)');
    texto = await entenderArchivo(env, m.business_id, { bytes: new Uint8Array(await obj.arrayBuffer()), mime: fila.media_mime, tipo: m.tipo });
  }
  texto = String(texto).slice(0, 2000);
  await env.DB.prepare('UPDATE wa_mensajes SET media_texto = ? WHERE id = ?').bind(texto, m.id).run();
  return texto;
}

// Cómo ve la IA un mensaje: el texto, o «[Foto: descripción] pie de foto» si es un archivo
export function paraIA(m) {
  if (!m.tipo || m.tipo === 'texto') return m.contenido;
  const nombre = (ETIQUETA[m.tipo] || 'Archivo').replace(/^\S+\s/, ''), pie = m.contenido && !/^[📷🎥🎤📎🙂]/u.test(m.contenido) ? ` ${m.contenido}` : '';
  return `[${nombre}${m.media_texto ? `: ${m.media_texto}` : ' recibido (no se pudo analizar)'}]${pie}`;
}

// Entiende los archivos recientes de un chat que la IA aún no vio (para responder con ellos en contexto). Se llama justo antes de que el agente responda.
export async function entenderRecientes(env, bandeja, contacto, org) {
  const ms = await all(env, "SELECT * FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? AND rol = 'user' AND tipo IN ('imagen', 'audio', 'documento') AND media_texto IS NULL AND (media_estado IS NULL OR media_estado <> 'grande') AND ts > ? ORDER BY id LIMIT 4", org, bandeja.id, contacto, now() - 20 * 60000);
  for (const m of ms) { try { await entenderMensaje(env, bandeja, m); } catch (e) { console.error('media entender', e.message); } }
}

/* ---------- servir el archivo (RPC media) ---------- */
export async function servirMedia(env, c, id, rango) {
  const sin = (status, t) => new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  if (!env.MEDIA) return sin(503, 'Almacenamiento no configurado');
  let m = await one(env, 'SELECT * FROM wa_mensajes WHERE id = ? AND business_id = ?', Number(id), c.businessId);
  if (!m || (!m.media_ref && !m.media_key)) return sin(404, 'No encontrado');
  if (!m.media_key) { const b = await one(env, 'SELECT * FROM wa_bandejas WHERE id = ? AND business_id = ?', m.bandeja_id, c.businessId); m = (b && (await descargarMedia(env, b, m))) || m; }
  if (!m.media_key) return sin(404, m.media_estado === 'grande' ? 'El archivo es muy grande para guardarlo' : 'El archivo no está disponible (puede haber vencido en Meta)');
  const size = m.media_bytes || (await env.MEDIA.head(m.media_key))?.size;
  if (!size) return sin(404, 'No encontrado');
  let ini = 0, fin = size - 1, parcial = false;
  const r = /^bytes=(\d*)-(\d*)$/.exec(String(rango || ''));
  if (r && (r[1] || r[2])) { parcial = true; if (r[1] === '') { ini = Math.max(0, size - Number(r[2])); } else { ini = Number(r[1]); if (r[2]) fin = Math.min(size - 1, Number(r[2])); } if (ini > fin || ini >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } }); }
  const obj = await env.MEDIA.get(m.media_key, parcial ? { range: { offset: ini, length: fin - ini + 1 } } : undefined);
  if (!obj) return sin(404, 'No encontrado');
  const mime = m.media_mime || 'application/octet-stream', peligroso = /html|svg|xml|javascript/i.test(mime);
  const nombre = String(m.media_nombre || `archivo-${m.id}`).replace(/[^\w.\- ]/g, '_').slice(0, 80);
  const h = { 'content-type': peligroso ? 'application/octet-stream' : mime, 'accept-ranges': 'bytes', 'content-length': String(fin - ini + 1), 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'", 'content-disposition': `${peligroso || /^application\/(?!pdf)/.test(mime) ? 'attachment' : 'inline'}; filename="${nombre}"` };
  if (parcial) h['content-range'] = `bytes ${ini}-${fin}/${size}`;
  return new Response(obj.body, { status: parcial ? 206 : 200, headers: h });
}

/* ---------- biblioteca de archivos ---------- */
export async function guardarArchivo(env, org, { mensajeId, nombre, contactId = null, por = null }) {
  const m = await one(env, 'SELECT * FROM wa_mensajes WHERE id = ? AND business_id = ?', Number(mensajeId), org);
  if (!m || !m.tipo || m.tipo === 'texto') throw new HttpError(404, 'Ese mensaje no tiene un archivo');
  if (!m.media_key) { const b = await one(env, 'SELECT * FROM wa_bandejas WHERE id = ?', m.bandeja_id); if (!(b && (await descargarMedia(env, b, m)))) throw new HttpError(502, 'No pude descargar el archivo de Meta: no se puede guardar'); }
  const nom = String(nombre || '').trim().slice(0, 80) || `${(ETIQUETA[m.tipo] || 'Archivo').replace(/^\S+\s/, '')} ${new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 16).replace('T', ' ')}`;
  const r = await env.DB.prepare('INSERT INTO wa_archivos (business_id, mensaje_id, nombre, contact_id, creado_por, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(org, m.id, nom, contactId ? Number(contactId) : null, por, now()).run();
  if (contactId) await env.DB.prepare("UPDATE mk_contacts SET notes = COALESCE(notes || char(10), '') || ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(`Archivo guardado: ${nom} (Mensajes → Archivos)`, now(), Number(contactId), org).run();
  return { id: r.meta.last_row_id, nombre: nom };
}
export const listarArchivos = (env, org) => all(env, `SELECT a.id, a.nombre, a.mensaje_id, a.contact_id, a.creado_por, a.created_at, m.tipo, m.media_mime, m.media_bytes, m.media_texto, k.name contacto
  FROM wa_archivos a JOIN wa_mensajes m ON m.id = a.mensaje_id LEFT JOIN mk_contacts k ON k.id = a.contact_id AND k.business_id = a.business_id WHERE a.business_id = ? ORDER BY a.created_at DESC LIMIT 200`, org);

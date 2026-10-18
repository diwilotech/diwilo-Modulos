// API pública del negocio (/v1/… en el dominio de cada app), con una clave «dwi_…» creada en IA → Conexiones.
// Solo lectura: conversaciones de sus chats y los contactos (leads) de Marketing.
//   GET /v1/conversaciones?desde=<ms>&limite=100     GET /v1/conversaciones/<id>     GET /v1/contactos?desde=<ms>&limite=100
import { all, one, now } from '../../lib/crud.js';
import { huella } from './api.js';

const JSONH = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const out = (status, data) => ({ status, headers: JSONH, body: JSON.stringify(data) });

export async function apiPublica(env, { app, clave, path, query = '' }) {
  if (!/^dwi_[0-9a-f]{40}$/.test(String(clave || ''))) return out(401, { error: 'Falta la clave de API (Authorization: Bearer dwi_…)' });
  const k = await one(env, 'SELECT id, business_id FROM ia_claves WHERE hash = ? AND revocada = 0', await huella(clave));
  if (!k || !k.business_id.startsWith(`${app}:`)) return out(401, { error: 'Clave no válida o revocada' });
  env.DB.prepare('UPDATE ia_claves SET last_used = ? WHERE id = ?').bind(now(), k.id).run().catch(() => {});
  const org = k.business_id, q = new URLSearchParams(String(query).replace(/^\?/, ''));
  const desde = Number(q.get('desde')) || 0, limite = Math.min(500, Math.max(1, Number(q.get('limite')) || 100));
  let m;
  if (path === '/v1/conversaciones') {
    return out(200, { rows: await all(env, `SELECT v.id, ch.nombre chat, ch.slug, v.started_at, v.last_at, v.msg_count, v.pagina, v.pais, v.dispositivo, v.lead_id FROM ia_conversaciones v JOIN ia_chats ch ON ch.id = v.chat_id
      WHERE v.business_id = ? AND v.last_at > ? ORDER BY v.last_at DESC LIMIT ${limite}`, org, desde) });
  }
  if ((m = /^\/v1\/conversaciones\/([A-Za-z0-9-]{1,80})$/.exec(path))) {
    const v = await one(env, 'SELECT id, chat_id, started_at, last_at, msg_count, lead_id FROM ia_conversaciones WHERE id = ? AND business_id = ?', m[1], org);
    if (!v) return out(404, { error: 'No encontrada' });
    return out(200, { conversacion: v, mensajes: await all(env, 'SELECT rol, contenido, ts FROM ia_mensajes WHERE conversacion_id = ? AND business_id = ? ORDER BY ts, id', m[1], org) });
  }
  if (path === '/v1/contactos') {
    return out(200, { rows: await all(env, `SELECT id, name, email, phone, company, stage, source, notes, created_at FROM mk_contacts WHERE business_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT ${limite}`, org, desde).catch(() => []) });
  }
  return out(404, { error: 'Ruta no encontrada' });
}

// Contactos de los chats: viven en Marketing (mk_contacts). Un chat se enlaza con un contacto por teléfono (sin duplicar); si el negocio
// no tiene Marketing activo, el chat funciona igual pero no guarda ni enlaza contactos.
import { all, one, now } from '../../lib/crud.js';
import { orgUsa, ctxDeOrg } from '../../lib/contexto.js';
import { ejecutarHerramienta } from '../../lib/registro.js';
import { CANALES, soloDigitos } from './canales.js';

export const marketingActivo = (env, org) => orgUsa(env, org, 'marketing');
const ultimos = (tel) => soloDigitos(tel).slice(-10);

// Contacto de Marketing con ese teléfono (compara los últimos 10 dígitos, sin importar espacios ni indicativo)
export async function contactoPorTelefono(env, org, tel) {
  const u = ultimos(tel);
  if (u.length < 7) return null;
  const filas = await all(env, 'SELECT id, name, phone, email, stage FROM mk_contacts WHERE business_id = ? AND phone LIKE ? LIMIT 50', org, `%${u.slice(-4)}%`);
  return filas.find((f) => ultimos(f.phone) === u) || null;
}
export const contactoPorId = (env, org, id) => (id ? one(env, 'SELECT id, name, phone, email, stage, company, notes FROM mk_contacts WHERE id = ? AND business_id = ?', id, org) : null);

// Guarda lo que se sabe de la persona del chat como contacto de Marketing y lo enlaza al chat. `d` = { nombre, telefono, correo, empresa, interes }.
// Devuelve { id, creado } o null si no hay Marketing activo o faltan datos mínimos.
export async function guardarContacto(env, org, { bandeja, conv, d }) {
  if (!(await marketingActivo(env, org))) return null;
  const tel = bandeja.canal === 'whatsapp' ? `+${soloDigitos(conv.contacto)}` : (String(d.telefono || '').replace(/[^\d+]/g, '') || null);
  const nombre = String(d.nombre || conv.nombre || '').trim().slice(0, 120), correo = String(d.correo || '').trim().toLowerCase();
  const correoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : null;
  let existente = conv.contact_id ? await contactoPorId(env, org, conv.contact_id) : null;
  if (!existente && tel) existente = await contactoPorTelefono(env, org, tel);
  if (existente) {
    // No pisa lo que ya tiene: solo completa el correo, el teléfono y las notas
    await env.DB.prepare('UPDATE mk_contacts SET email = COALESCE(NULLIF(email, \'\'), ?), phone = COALESCE(NULLIF(phone, \'\'), ?), notes = CASE WHEN ? IS NULL THEN notes ELSE COALESCE(notes || char(10), \'\') || ? END, updated_at = ? WHERE id = ? AND business_id = ?')
      .bind(correoOk, tel, d.interes ? 1 : null, d.interes ? `Chat: ${String(d.interes).slice(0, 300)}` : null, now(), existente.id, org).run();
    return { id: existente.id, creado: false };
  }
  if (!nombre || !(tel || correoOk)) return null;
  const ctx = await ctxDeOrg(env, org, { role: 'staff' });
  if (!ctx) return null;
  const r = await ejecutarHerramienta(env, ctx, 'marketing.crear_contacto', {
    nombre, ...(tel ? { telefono: tel.slice(0, 30) } : {}), ...(correoOk ? { correo: correoOk } : {}), ...(d.empresa ? { empresa: String(d.empresa).slice(0, 120) } : {}),
    origen: `${CANALES[bandeja.canal]?.nombre || 'Chat'}: ${bandeja.nombre}`.slice(0, 80), notas: String(d.interes || '').slice(0, 500),
  });
  return r.ok && r.result?.creado?.id ? { id: r.result.creado.id, creado: true } : null;
}

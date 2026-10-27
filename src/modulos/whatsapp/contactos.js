// Contactos de los chats: viven en Marketing (mk_contacts). Un chat se enlaza con un contacto por teléfono (sin duplicar); si el negocio
// no tiene Marketing activo, el chat funciona igual pero no guarda ni enlaza contactos.
import { all, one, now } from '../../lib/crud.js';
import { orgUsa, ctxDeOrg } from '../../lib/contexto.js';
import { ejecutarHerramienta } from '../../lib/registro.js';
import { CANALES, soloDigitos } from './canales.js';

// Datos que el agente puede pedir (los marca quien configura el agente). Nombre y un medio de contacto siempre se piden.
export const CAMPOS = {
  correo: 'correo electrónico', telefono: 'teléfono', empresa: 'nombre del negocio o empresa (si tiene)',
  tipo: 'si escribe como persona natural o en nombre de un negocio', ciudad: 'ciudad', interes: 'qué necesita o le interesa',
  es_cliente: 'si ya es cliente nuestro o es la primera vez que nos escribe (responde «si» o «no»)',
};
export const CAMPOS_BASE = { campos: ['correo', 'interes'], extras: [] };
// Valida y deja en JSON lo que llega del formulario del agente: { campos: [...], extras: [...] }
export function normalizarCampos(txt) {
  let x; try { x = typeof txt === 'string' ? JSON.parse(txt) : txt; } catch { x = null; }
  const campos = [...new Set((Array.isArray(x?.campos) ? x.campos : []).filter((k) => k in CAMPOS))];
  const extras = (Array.isArray(x?.extras) ? x.extras : []).map((e) => String(e || '').trim().slice(0, 60)).filter(Boolean).slice(0, 5);
  return JSON.stringify({ campos, extras });
}
export function camposDe(agente) {
  try { const x = JSON.parse(agente?.campos || 'null'); if (x && Array.isArray(x.campos)) return { campos: x.campos.filter((k) => k in CAMPOS), extras: Array.isArray(x.extras) ? x.extras : [] }; } catch { /* sin configurar */ }
  return CAMPOS_BASE;
}

// Lo que dice el agente (o el equipo) de la persona: solo las claves conocidas y con largo acotado
export function limpiarDatos(d) {
  const out = {};
  for (const k of ['nombre', 'telefono', 'correo', 'empresa', 'tipo', 'ciudad', 'interes', 'es_cliente']) if (d?.[k]) out[k] = String(d[k]).trim().slice(0, 300);
  if (d?.extras && typeof d.extras === 'object') out.extras = Object.fromEntries(Object.entries(d.extras).slice(0, 5).filter(([, v]) => v).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)]));
  return out;
}

// Teléfono con indicativo de país: «+57 3001112233», «0057…» o «3001112233» (celular colombiano de 10 dígitos que empieza en 3 → +57). Otros números sin indicativo se guardan como llegaron.
export function normalizarTelefono(t) {
  const crudo = String(t || '').trim();
  if (!crudo) return null;
  const d = crudo.replace(/\D/g, '');
  if (d.length < 7) return null;
  if (crudo.startsWith('+')) return `+${d}`;
  if (d.startsWith('00') && d.length > 9) return `+${d.slice(2)}`;
  if (d.length === 10 && d[0] === '3') return `+57${d}`;
  return d;
}
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
// manual = lo guarda una persona del equipo desde el formulario: lo que escribe reemplaza lo guardado (el agente, en cambio, solo completa y corrige el nombre).
export async function guardarContacto(env, org, { bandeja, conv, d, manual = false }) {
  if (!(await marketingActivo(env, org))) return null;
  const tel = bandeja.canal === 'whatsapp' ? `+${soloDigitos(conv.contacto)}` : normalizarTelefono(d.telefono);
  const nombre = String(d.nombre || conv.nombre || '').trim().slice(0, 120), correo = String(d.correo || '').trim().toLowerCase();
  const correoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : null;
  const empresa = String(d.empresa || '').trim().slice(0, 120) || null;
  // Lo demás que dijo la persona va a las notas del contacto
  const lineas = [];
  if (d.interes) lineas.push(`Chat: ${String(d.interes).slice(0, 300)}`);
  if (d.tipo) lineas.push(`Tipo: ${String(d.tipo).slice(0, 60)}`);
  if (d.ciudad) lineas.push(`Ciudad: ${String(d.ciudad).slice(0, 80)}`);
  for (const [k, v] of Object.entries(d.extras && typeof d.extras === 'object' ? d.extras : {}).slice(0, 5)) if (v) lineas.push(`${String(k).slice(0, 60)}: ${String(v).slice(0, 200)}`);
  const notas = lineas.join('\n').slice(0, 800) || null;
  let existente = conv.contact_id ? await contactoPorId(env, org, conv.contact_id) : null;
  if (!existente && tel) existente = await contactoPorTelefono(env, org, tel);
  const eraCliente = /^\s*(s[ií]|yes|ya soy)/i.test(String(d.es_cliente || ''));
  if (existente) {
    // Es la misma persona (mismo teléfono): lo que dice ahora completa y corrige el contacto. Si el nombre guardado era otro (p. ej. el negocio que escribió
    // en un formulario), pasa a «empresa» si está vacía y queda anotado; el correo distinto también se anota.
    const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length > 2);
    const previo = await env.DB.prepare('SELECT name, email, company, stage FROM mk_contacts WHERE id = ? AND business_id = ?').bind(existente.id, org).first();
    const mismoNombre = !nombre || norm(previo?.name).some((w) => norm(nombre).includes(w));
    if (manual) {
      await env.DB.prepare('UPDATE mk_contacts SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), company = COALESCE(?, company), stage = CASE WHEN ? = 1 AND stage = \'lead\' THEN \'cliente\' ELSE stage END, notes = CASE WHEN ? IS NULL OR instr(COALESCE(notes, \'\'), ?) > 0 THEN notes ELSE COALESCE(notes || char(10), \'\') || ? END, updated_at = ? WHERE id = ? AND business_id = ?')
        .bind(nombre || null, correoOk, tel, empresa, eraCliente ? 1 : 0, notas, notas, notas, now(), existente.id, org).run();
      return { id: existente.id, creado: false };
    }
    const extra = [];
    let nuevoNombre = previo?.name, empresaNueva = empresa;
    if (!mismoNombre) { nuevoNombre = nombre; extra.push(`Nombre anterior: ${previo.name}`); if (!previo.company && !empresa) empresaNueva = previo.name; }
    if (correoOk && previo?.email && previo.email.toLowerCase() !== correoOk) extra.push(`Otro correo dado en el chat: ${correoOk}`);
    const notasTodas = [notas, ...extra].filter(Boolean).join('\n').slice(0, 800) || null;
    await env.DB.prepare('UPDATE mk_contacts SET name = ?, email = COALESCE(NULLIF(email, \'\'), ?), phone = COALESCE(NULLIF(phone, \'\'), ?), company = COALESCE(NULLIF(company, \'\'), ?), stage = CASE WHEN ? = 1 AND stage = \'lead\' THEN \'cliente\' ELSE stage END, notes = CASE WHEN ? IS NULL THEN notes ELSE COALESCE(notes || char(10), \'\') || ? END, updated_at = ? WHERE id = ? AND business_id = ?')
      .bind(nuevoNombre, correoOk, tel, empresaNueva, eraCliente ? 1 : 0, notasTodas, notasTodas, now(), existente.id, org).run();
    return { id: existente.id, creado: false };
  }
  if (!nombre || !(tel || correoOk)) return null;
  const ctx = await ctxDeOrg(env, org, { role: 'staff' });
  if (!ctx) return null;
  const r = await ejecutarHerramienta(env, ctx, 'marketing.crear_contacto', {
    nombre, ...(tel ? { telefono: tel.slice(0, 30) } : {}), ...(correoOk ? { correo: correoOk } : {}), ...(empresa ? { empresa } : {}), ...(eraCliente ? { etapa: 'cliente' } : {}),
    origen: `${CANALES[bandeja.canal]?.nombre || 'Chat'}: ${bandeja.nombre}`.slice(0, 80), ...(notas ? { notas } : {}),
  });
  return r.ok && r.result?.creado?.id ? { id: r.result.creado.id, creado: true } : null;
}

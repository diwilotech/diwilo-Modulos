// Tarjetas de presentación digitales del módulo Marketing (las mismas de Diwilo), por negocio.
//   GET    /api/marketing/cards                 lista; si el negocio no tiene la suya, crea la predeterminada con sus datos
//   POST   /api/marketing/cards  ·  PATCH /api/marketing/cards/:id  ·  DELETE /api/marketing/cards/:id (no la predeterminada)
//   PUT    /api/marketing/cards/:id/foto        { photo_data, icon_192, icon_512 } (data URL; '' = quitar)
// Página pública /c/<slug> en el dominio de la app: publicCard() (la llama tarjeta() de src/index.js por RPC).
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { Router } from '../../router.js';
import { renderCard, renderVcf, cardManifest, CARD_SW } from './tarjeta.js';
import { TEMAS, brandOf } from '../../lib/marca.js';

const MOD = 'marketing', B = '/api/marketing';
// 'app' = el color de la marca del negocio (por defecto el de su app: cambia solo cuando cambia Apariencia); luego los 9 temas y «ámbar» (tarjetas viejas)
export const ACCENTS = ['app', ...Object.keys(TEMAS), 'ambar'];
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const COLS = 'id, business_id, slug, name, role, company, bio, phone, whatsapp, email, website, instagram, linkedin, accent, predeterminada, views, created_at, updated_at, photo_data IS NOT NULL AS has_photo, icon_512 IS NOT NULL AS has_icon';

// La dirección /c/<slug> es única en todas las apps.
async function uniqueSlug(env, wanted, exceptId = 0) {
  const base = slugify(wanted) || 'tarjeta';
  for (let i = 1; i < 60; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (!(await one(env, 'SELECT 1 FROM mk_cards WHERE slug = ? AND id <> ?', s, exceptId))) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const CARD_ENTITY = {
  table: 'mk_cards', label: 'la tarjeta', title: 'name', search: ['name', 'company', 'role', 'slug'], order: 'predeterminada DESC, created_at',
  fields: { slug: 'text', name: 'text!', role: 'text', company: 'text', bio: 'long', phone: 'text', whatsapp: 'text', email: 'email', website: 'url', instagram: 'text', linkedin: 'url', accent: ACCENTS },
  async beforeCreate(c, row) { row.slug = await uniqueSlug(c.env, row.slug || row.name); if (row.bio) row.bio = row.bio.slice(0, 600); },
  async beforeUpdate(c, row, before) { if ('slug' in row) row.slug = await uniqueSlug(c.env, row.slug || before.name, before.id); if (row.bio) row.bio = row.bio.slice(0, 600); },
  async beforeDelete(c, before) { if (before.predeterminada) throw new HttpError(409, 'La tarjeta del negocio no se borra: puedes editarla'); },
  decorate(c, rows) { return rows.map(({ photo_data, icon_192, icon_512, ...r }) => ({ ...r, has_photo: !!photo_data, has_icon: !!icon_512 })); },
};

// Tarjeta predeterminada: nombre del negocio, el color de su app (sigue a Apariencia) y el correo de quien la crea si es el propietario.
export async function ensureDefaultCard(c) {
  if (await one(c.env, 'SELECT 1 FROM mk_cards WHERE business_id = ? AND predeterminada = 1', c.businessId)) return false;
  const b = c.ctx?.business || {}, name = b.name || 'Mi negocio', t = now();
  await c.env.DB.prepare(`INSERT INTO mk_cards (business_id, slug, name, company, email, accent, predeterminada, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(c.businessId, await uniqueSlug(c.env, name), name, name, c.role === 'owner' ? c.session?.email || null : null, 'app', t, t).run();
  await audit(c, `Creó la tarjeta del negocio «${name}»`, { modulo: MOD });
  return true;
}

export function cardRoutes(r) {
  // La lista va primero: así se crea la predeterminada antes de listar
  const lister = crud(new Router(), { base: B, modulo: MOD, entities: { cards: CARD_ENTITY } });
  r.get(`${B}/cards`, `tenant:${MOD}`, async (c) => {
    if (!c.readOnly) await ensureDefaultCard(c);
    return json({ rows: await lister.list(c, 'cards', c.url.searchParams) });
  });
  r.put(`${B}/cards/:id/foto`, `tenant:${MOD}`, async (c) => {
    const card = await one(c.env, 'SELECT id, name FROM mk_cards WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
    const b = await readJson(c.req), set = {};
    if (b.photo_data !== undefined) {
      if (b.photo_data && !(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo_data) && b.photo_data.length < 400000)) throw new HttpError(400, 'La foto no es válida o pesa demasiado');
      set.photo_data = b.photo_data || null;
    }
    for (const k of ['icon_192', 'icon_512']) {
      if (b[k] === undefined) continue;
      if (b[k] && !(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b[k]) && b[k].length < 900000)) throw new HttpError(400, 'Ícono no válido');
      set[k] = b[k] || null;
    }
    const cols = Object.keys(set);
    if (cols.length) await c.env.DB.prepare(`UPDATE mk_cards SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...cols.map((k) => set[k]), now(), card.id, c.businessId).run();
    if ('photo_data' in set) await audit(c, `${set.photo_data ? 'Cambió' : 'Quitó'} la foto de la tarjeta «${card.name}»`, { modulo: MOD });
    return json({ ok: true });
  });
  r.get(`${B}/cards/:id/foto`, `tenant:${MOD}`, async (c) => {
    const row = await one(c.env, 'SELECT photo_data FROM mk_cards WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    return json({ photo_data: row?.photo_data || null });
  });
}

// /c/<rest> de una app: «sw.js», «<slug>», «<slug>.vcf», «<slug>/foto», «<slug>/icon-192.png», «<slug>/manifest.webmanifest».
// Devuelve { status, headers, body, base64?, business_id? } (business_id: la app revisa que el negocio esté activo y con Marketing).
export async function publicCard(env, app, rest, origin, { bot = false } = {}) {
  const text = (status, body, type = 'text/plain; charset=utf-8', extra = {}) => ({ status, headers: { 'content-type': type, ...extra }, body });
  if (rest === 'sw.js') return text(200, CARD_SW, 'application/javascript; charset=utf-8', { 'cache-control': 'no-cache' });
  const sub = /^([a-z0-9-]{1,60})\/(foto|icon-192\.png|icon-512\.png|manifest\.webmanifest)$/.exec(rest || '');
  const vcf = !sub && /\.vcf$/.test(rest || '');
  const slug = sub ? sub[1] : String(rest || '').replace(/\.vcf$/, '');
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return text(404, 'Tarjeta no encontrada');
  const card = await one(env, `SELECT ${COLS}, photo_data, icon_192, icon_512 FROM mk_cards WHERE slug = ? AND business_id LIKE ?`, slug, `${app}:%`);
  if (!card) return text(404, 'Tarjeta no encontrada');
  const business_id = card.business_id.slice(app.length + 1);
  // Marca del negocio: el color «app» sigue al tema de su app; la tipografía viene de Marca e IA
  const brand = await brandOf(env, card.business_id);
  card.accent_efectivo = card.accent === 'app' ? brand.color_efectivo : card.accent;
  card.tipografia = brand.tipografia;
  const img = (dataUrl, cache) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
    return m ? { status: 200, headers: { 'content-type': m[1], 'cache-control': cache }, body: m[2], base64: true, business_id } : null;
  };
  if (sub) {
    const part = sub[2];
    if (part === 'foto') return img(card.photo_data, 'public, max-age=31536000, immutable') || text(404, 'No encontrado');
    if (part === 'manifest.webmanifest') return { ...text(200, JSON.stringify(cardManifest(card)), 'application/manifest+json; charset=utf-8', { 'cache-control': 'public, max-age=300' }), business_id };
    // Sin ícono propio: el de la app
    return img(part === 'icon-192.png' ? card.icon_192 : card.icon_512, 'public, max-age=3600')
      || { status: 302, headers: { location: `${origin}/icons/icon-${part === 'icon-192.png' ? '192' : '512'}.png` }, body: '', business_id };
  }
  const v = card.updated_at || card.created_at;
  if (card.has_photo) card.photo_url = `${origin}/c/${encodeURIComponent(card.slug)}/foto?v=${v}`;
  if (vcf) return { ...text(200, renderVcf(card), 'text/vcard; charset=utf-8', { 'content-disposition': `attachment; filename="${card.slug}.vcf"` }), business_id };
  if (!bot) await env.DB.prepare('UPDATE mk_cards SET views = views + 1 WHERE id = ?').bind(card.id).run();
  return { ...text(200, renderCard(card, origin), 'text/html; charset=utf-8', { 'cache-control': 'no-cache' }), business_id };
}

export const cardsOf = (env, org) => all(env, `SELECT ${COLS} FROM mk_cards WHERE business_id = ? ORDER BY predeterminada DESC, created_at`, org);

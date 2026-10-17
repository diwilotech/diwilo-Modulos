// Marca e IA (módulo compartido): la marca del negocio y las plantillas de su IA. Ver: todo el equipo; cambiar: propietario y administrador.
//   GET   /api/marca                      marca + opciones (temas, tipografías, tonos) + plantillas + plantillas de ejemplo
//   PUT   /api/marca                      { color, fondo, tipografia, tono, tono_notas } (solo lo que llega)
//   CRUD  /api/marca/plantillas           plantillas de la IA: canal 'chat' (asistente de la app) o 'mcp' (asistente externo)
//   GET   /api/marca/ia/contexto?canal=   el texto que recibe la IA: tono + plantillas activas del canal (chat | mcp | agente)
//   GET|PUT|DELETE /api/marca/logo        copia del logo del negocio ({ dataUrl }) para el kit (la app guarda el suyo para su menú)
//   GET   /api/marca/kit                  el kit de marca completo (color, CSS, tipografía, tono y prompts listos) para webs, apps, chats y agentes
// El color 'app' sigue el color que el negocio elige en Apariencia de su app (lo envía cada llamada en ctx.business.tema).
// Las tarjetas públicas y los demás módulos leen la marca con brandOf() (src/lib/marca.js).
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, all, one, now } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { TEMAS, FUENTES, TONOS, STARTERS, CANALES, COLORES, FONDOS, brandOf, tonoPrompt, kitOf, paleta } from '../../lib/marca.js';

const MOD = 'marca', B = '/api/marca';
const MAX_POR_CANAL = 20;
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

const revisar = (row) => {
  if (row.nombre && row.nombre.length > 80) throw new HttpError(400, 'El nombre es muy largo (máximo 80 letras)');
  if (row.instrucciones && row.instrucciones.length > 2000) throw new HttpError(400, 'Las instrucciones son muy largas (máximo 2000 letras)');
};

export const ENTITIES = {
  plantillas: {
    table: 'mc_plantillas', label: 'la plantilla de IA', title: 'nombre', search: ['nombre'], order: 'canal, created_at',
    fields: { nombre: 'text!', canal: CANALES, instrucciones: 'long!', activa: 'bool+' },
    leer: 'tenant', crear: 'manager', borrar: 'manager',
    async beforeCreate(c, row) {
      revisar(row);
      const n = (await one(c.env, 'SELECT COUNT(*) n FROM mc_plantillas WHERE business_id = ? AND canal = ?', c.businessId, row.canal)).n;
      if (n >= MAX_POR_CANAL) throw new HttpError(400, `Ya tienes ${MAX_POR_CANAL} plantillas para ese canal`);
    },
    beforeUpdate(c, row) { revisar(row); },
  },
};

const api = crud({ get() {}, post() {}, patch() {}, delete() {} }, { base: B, modulo: MOD, entities: ENTITIES }); // solo para list() desde las herramientas

export async function saveMarca(c, b) {
  const cur = await brandOf(c.env, c.businessId);
  const next = { color: cur.color, fondo: cur.fondo, tipografia: cur.tipografia, tono: cur.tono, tono_notas: cur.tono_notas };
  if (b.color !== undefined) { if (!COLORES.includes(b.color)) throw new HttpError(400, 'Color no válido'); next.color = b.color; }
  if (b.fondo !== undefined) { if (!FONDOS[b.fondo]) throw new HttpError(400, 'Fondo no válido (negro, blanco o igual que la app)'); next.fondo = b.fondo; }
  if (b.tipografia !== undefined) { if (!FUENTES[b.tipografia]) throw new HttpError(400, 'Tipografía no válida'); next.tipografia = b.tipografia; }
  if (b.tono !== undefined) { if (!TONOS[b.tono]) throw new HttpError(400, 'Tono no válido'); next.tono = b.tono; }
  if (b.tono_notas !== undefined) next.tono_notas = String(b.tono_notas || '').trim().slice(0, 500);
  const t = now();
  await c.env.DB.prepare(`INSERT INTO mc_marca (business_id, color, fondo, tipografia, tono, tono_notas, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_id) DO UPDATE SET color = excluded.color, fondo = excluded.fondo, tipografia = excluded.tipografia, tono = excluded.tono, tono_notas = excluded.tono_notas, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(c.businessId, next.color, next.fondo, next.tipografia, next.tono, next.tono_notas || null, c.session?.email || null, t, t).run();
  await audit(c, 'Cambió la marca del negocio', { modulo: MOD, detalle: next });
  return brandOf(c.env, c.businessId);
}

// Lo que recibe la IA: el tono y las plantillas activas del canal.
export async function contexto(c, canal) {
  if (!CANALES.includes(canal)) throw new HttpError(400, 'Canal no válido (chat, mcp o agente)');
  const b = await brandOf(c.env, c.businessId);
  const plantillas = await all(c.env, 'SELECT id, nombre, instrucciones FROM mc_plantillas WHERE business_id = ? AND canal = ? AND activa = 1 ORDER BY created_at', c.businessId, canal);
  return {
    canal, tono: b.tono, plantillas: plantillas.map(({ id, nombre }) => ({ id, nombre })),
    prompt: [tonoPrompt(b), ...plantillas.map((p) => `## ${p.nombre}\n${p.instrucciones}`)].join('\n\n'),
  };
}

export const guia = async (c) => {
  const b = await brandOf(c.env, c.businessId);
  return {
    negocio: c.ctx?.business?.name || null, color: TEMAS[b.color_efectivo].nombre, tipografia: FUENTES[b.tipografia].nombre,
    tono: { id: b.tono, nombre: TONOS[b.tono].nombre, regla: TONOS[b.tono].regla, notas: b.tono_notas || null },
    plantillas: await all(c.env, "SELECT nombre, instrucciones FROM mc_plantillas WHERE business_id = ? AND canal = 'mcp' AND activa = 1 ORDER BY created_at", c.businessId),
    instruccion: 'Sigue este tono en todo texto que escribas para los clientes del negocio y aplica las plantillas activas.',
  };
};

export { api as plantillasApi };

export function routes(r) {
  crud(r, { base: B, modulo: MOD, entities: ENTITIES });
  r.get(B, `tenant:${MOD}`, async (c) => {
    const marca = await brandOf(c.env, c.businessId);
    return json({
      marca: { ...marca, tema_nombre: TEMAS[marca.tema_app].nombre },
      negocio: { nombre: c.ctx?.business?.name || null, logo: c.ctx?.business?.logo || null },
      opciones: {
        temas: Object.entries(TEMAS).map(([id, t]) => ({ id, nombre: t.nombre, color: t.ui, card: t.card[0], paleta: paleta(t.ui) })),
        fuentes: Object.entries(FUENTES).map(([id, f]) => ({ id, nombre: f.nombre, familia: f.familia, google: f.google })),
        fondos: Object.entries(FONDOS).map(([id, nombre]) => ({ id, nombre })),
        tonos: Object.entries(TONOS).map(([id, t]) => ({ id, nombre: t.nombre, ejemplo: t.ejemplo })),
      },
      plantillas: await api.list(c, 'plantillas'), starters: STARTERS, limite: MAX_POR_CANAL,
    });
  });
  r.put(B, `manager:${MOD}`, async (c) => json({ marca: await saveMarca(c, await readJson(c.req)) }));
  r.get(`${B}/kit`, `tenant:${MOD}`, async (c) => json(await kitOf(c.env, c.businessId, c.ctx?.business?.name || null, { logo: c.url.searchParams.get('logo') === '1' })));
  r.get(`${B}/logo`, `tenant:${MOD}`, async (c) => json({ data_url: (await one(c.env, 'SELECT logo FROM mc_marca WHERE business_id = ?', c.businessId))?.logo || null }));
  r.put(`${B}/logo`, `manager:${MOD}`, async (c) => {
    const url = String((await readJson(c.req)).dataUrl || '');
    if (!LOGO.test(url)) throw new HttpError(400, 'El logo debe ser una imagen PNG, JPG, WEBP o SVG');
    if (url.length > 420000) throw new HttpError(400, 'El logo pesa más de 300 KB');
    const t = now();
    await c.env.DB.prepare(`INSERT INTO mc_marca (business_id, logo, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(business_id) DO UPDATE SET logo = excluded.logo, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(c.businessId, url, c.session?.email || null, t, t).run();
    await audit(c, 'Cambió el logo del negocio', { modulo: MOD });
    return json({ ok: true });
  });
  r.delete(`${B}/logo`, `manager:${MOD}`, async (c) => {
    await c.env.DB.prepare('UPDATE mc_marca SET logo = NULL, updated_at = ? WHERE business_id = ?').bind(now(), c.businessId).run();
    await audit(c, 'Quitó el logo del negocio', { modulo: MOD });
    return json({ ok: true });
  });
  r.get(`${B}/ia/contexto`, `tenant:${MOD}`, async (c) => json(await contexto(c, c.url.searchParams.get('canal') || 'chat')));
}

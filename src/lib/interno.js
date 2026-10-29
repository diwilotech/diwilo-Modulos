// Despachador interno para las herramientas de IA de Finanzas y Marketing: ejecuta las MISMAS rutas de la API del módulo
// con el contexto del negocio (rol, suscripción vencida, validaciones y bitácora). Sin lógica duplicada.
import { Router } from '../router.js';
import { HttpError } from './http.js';
import { authorize } from './contexto.js';
import * as finanzasApi from '../modulos/finanzas/api.js';
import * as marketingApi from '../modulos/marketing/api.js';
import * as nominaApi from '../modulos/nomina/api.js';
import * as mensajesApi from '../modulos/whatsapp/api.js';

let router;
const rutas = () => {
  if (!router) { router = new Router(); finanzasApi.routes(router); marketingApi.routes(router); nominaApi.routes(router); mensajesApi.routes(router); }
  return router;
};

export function recortar(v, max = 150) {
  if (Array.isArray(v)) return v.length > max ? [...v.slice(0, max).map((x) => recortar(x, max)), { aviso: `Hay ${v.length - max} más; acota con filtros` }] : v.map((x) => recortar(x, max));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recortar(x, max)]));
  return v;
}

export async function llamar(c, metodo, ruta, { query, body } = {}) {
  const url = new URL(ruta, c.url.origin);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  const { route, params } = rutas().match(metodo, url.pathname);
  c.auditLog ||= [];   // misma lista para que la bitácora de la ruta llegue a quien llamó
  const req = new Request(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: metodo === 'GET' || body === undefined ? undefined : JSON.stringify(body) });
  const h = { ...c, req, url, params };
  authorize(h, route.auth);
  const res = await route.handler(h);
  const tipo = res.headers.get('content-type') || '';
  const texto = await res.text();
  let data;
  if (tipo.includes('json')) data = JSON.parse(texto);
  else if (tipo.startsWith('text/csv') || tipo.startsWith('text/plain')) data = { texto: texto.length > 60000 ? `${texto.slice(0, 60000)}\n…(recortado; acota las fechas)` : texto };
  else throw new HttpError(415, 'Esa respuesta es una página o archivo: se ve desde la app');
  if (res.status >= 400) throw new HttpError(res.status, data?.error || 'No se pudo completar');
  return recortar(data);
}

export function herramienta({ name, modulo, rol = 'staff', tipo, description, props = {}, required = [], ruta: [metodo, patron], salida }) {
  return {
    name, modulo, rol, tipo, description,
    inputSchema: { type: 'object', properties: props, required, additionalProperties: false },
    run: async (c, a) => {
      const resto = { ...a };
      const ruta = patron.replace(/:(\w+)/g, (_, k) => { const v = resto[k]; delete resto[k]; if (v === undefined || v === null || v === '') throw new HttpError(400, `Falta ${k}`); return encodeURIComponent(v); });
      const out = await llamar(c, metodo, ruta, metodo === 'GET' ? { query: resto } : { body: resto });
      return salida ? salida(out, a) : out;
    },
  };
}

// Listar / crear / editar / borrar de una entidad del CRUD genérico: <modulo>.listar_<plural>, crear_/editar_/borrar_<singular>.
export function crudHerramientas({ modulo, entidad, singular, plural, props, required = [], filtros = {}, escribe = 'staff', borra = 'admin', sin = [] }) {
  const ruta = `/api/${modulo}/${entidad}`;
  const todas = {
    listar: () => herramienta({ name: `${modulo}.listar_${plural}`, modulo, rol: escribe, tipo: 'lectura', description: `Lista ${plural} (busca por texto y filtra) con todos sus datos.`,
      props: { q: { type: 'string', description: 'Texto a buscar' }, limit: { type: 'integer' }, ...Object.fromEntries(Object.entries(filtros).map(([k, d]) => [`f_${k}`, { type: 'string', description: d }])) },
      ruta: ['GET', ruta], salida: (o) => ({ [plural]: o.rows ?? o }) }),
    crear: () => herramienta({ name: `${modulo}.crear_${singular}`, modulo, rol: escribe, tipo: 'escritura', description: `Crea ${singular}.`, props, required, ruta: ['POST', ruta] }),
    editar: () => herramienta({ name: `${modulo}.editar_${singular}`, modulo, rol: escribe, tipo: 'escritura', description: `Edita ${singular}: solo cambian los campos que envíes.`, props: { id: { type: 'integer' }, ...props }, required: ['id'], ruta: ['PATCH', `${ruta}/:id`] }),
    borrar: () => herramienta({ name: `${modulo}.borrar_${singular}`, modulo, rol: borra, tipo: 'escritura', description: `Borra ${singular} (no se puede deshacer).`, props: { id: { type: 'integer' } }, required: ['id'], ruta: ['DELETE', `${ruta}/:id`] }),
  };
  return Object.entries(todas).filter(([k]) => !sin.includes(k)).map(([, f]) => f());
}

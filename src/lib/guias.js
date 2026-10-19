// Guía de uso por módulo — UN SOLO ESTÁNDAR para quien use las herramientas de los módulos: el MCP del negocio, el asistente de IA de la app,
// los agentes y (si se activa) los chats. Sale del bloque «mcp» del manifiesto del módulo + las herramientas que el negocio y el rol pueden usar:
//   manifiesto "mcp": { "guia": "…", "ejemplos": ["…"], "flujos": [{ "id", "nombre", "descripcion", "pasos": ["modulo.herramienta"], "prompt"? }] }
// Documento «guía de módulo v1» (documentoDe):
//   { modulo, nombre, tipo, descripcion, conexion, guia, ejemplos, flujos: [{ id, nombre, descripcion, pasos, prompt }],
//     herramientas: [{ nombre, descripcion, tipo, rol, confirmar, argumentos, inputSchema }], recursos, prompts, markdown }
// Los módulos propios de una app mandan su manifiesto y sus herramientas en ctx.propias (la app los entrega y ejecuta; ver registro.js).
import { REG, herramientasDe } from './registro.js';

export const wire = (name) => String(name).replace(/\./g, '_');
const PROTOCOLO = '2025-06-18';
const args = (schema) => Object.entries(schema?.properties || {}).map(([k, v]) => ({ nombre: k, tipo: v.enum ? `uno de: ${v.enum.join(', ')}` : v.type || 'texto', obligatorio: (schema.required || []).includes(k), descripcion: v.description || null }));

export function promptDeFlujo(doc, f) {
  return f.prompt || `Usa el módulo ${doc.nombre}: ${f.descripcion || f.nombre}${f.pasos.length ? ` Sigue estos pasos con las herramientas: ${f.pasos.join(' → ')}.` : ''} Antes de escribir o cambiar datos, pídeme confirmación.`;
}

export function markdownDe(d) {
  const L = [`# ${d.nombre}`, '', d.descripcion || '', '', '## Cómo usarlo', d.guia, ''];
  if (d.ejemplos.length) L.push('## Ejemplos de lo que puedes pedir', ...d.ejemplos.map((e) => `- ${e}`), '');
  if (d.flujos.length) L.push('## Flujos recomendados', ...d.flujos.map((f) => `- **${f.nombre}** (${f.id}): ${f.descripcion}${f.pasos.length ? ` Herramientas: ${f.pasos.join(' → ')}.` : ''}`), '');
  L.push('## Herramientas', ...d.herramientas.map((t) => `- \`${t.nombre}\` · ${t.tipo}${t.confirmar ? ' (pide confirmación)' : ''}${t.rol !== 'staff' ? ` · mínimo ${t.rol}` : ''}: ${t.descripcion}${t.argumentos.length ? `\n  Argumentos: ${t.argumentos.map((a) => `${a.nombre}${a.obligatorio ? '*' : ''} (${a.tipo})`).join(', ')}` : ''}`), '');
  L.push('## Reglas', '- Trabajas con el rol de quien creó la conexión y solo con datos de este negocio.', '- Antes de usar una herramienta que escribe, explica qué vas a hacer y pide confirmación.', `- Conexión: ${d.conexion.mcp}`);
  return L.join('\n');
}

export function documentoDe(m, tools, origin = '') {
  const lectura = tools.filter((t) => t.tipo !== 'escritura'), escritura = tools.filter((t) => t.tipo === 'escritura');
  const guiaAuto = `${m.descripcion || `Módulo ${m.nombre}.`}${lectura.length ? ` Para consultar usa: ${lectura.map((t) => wire(t.name)).join(', ')}.` : ''}${escritura.length ? ` Para registrar o cambiar (piden confirmación): ${escritura.map((t) => wire(t.name)).join(', ')}.` : ''}`;
  const mcp = m.mcp || {};
  const d = {
    modulo: m.id, nombre: m.nombre, tipo: m.tipo || null, descripcion: m.descripcion || null,
    conexion: { mcp: `${origin}/mcp`, autenticacion: 'Authorization: Bearer <token> (se crea en IA → Conexiones; usa tu mismo rol)', protocolo: PROTOCOLO },
    guia: mcp.guia || guiaAuto, ejemplos: mcp.ejemplos || [],
    flujos: (mcp.flujos || []).map((f) => ({ id: f.id, nombre: f.nombre, descripcion: f.descripcion || '', pasos: (f.pasos || []).map(wire), prompt: f.prompt || null })),
    herramientas: tools.map((t) => ({ nombre: wire(t.name), descripcion: t.description, tipo: t.tipo === 'escritura' ? 'escritura' : 'lectura', rol: t.rol || 'staff', confirmar: t.tipo === 'escritura', argumentos: args(t.inputSchema), inputSchema: t.inputSchema })),
    recursos: [`diwilo://${m.id}/guia`], prompts: (mcp.flujos || []).map((f) => `${m.id}_${f.id}`),
  };
  d.flujos = d.flujos.map((f) => ({ ...f, prompt: promptDeFlujo(d, f) }));
  d.markdown = markdownDe(d);
  return d;
}

const RANK = { staff: 1, admin: 2, owner: 3 };
// Las guías de los módulos que este negocio y este rol pueden usar (centrales + los propios que mande la app en ctx.propias).
export function guiasDe(ctx, origin = ctx?.origin || '') {
  const manifests = [...(REG.manifests || []), ...(ctx.propias?.modulos || [])];
  const tools = herramientasDe(ctx);
  return manifests.filter((m) => (m.base || !ctx.modulos || ctx.modulos.includes(m.id) || (ctx.propias?.modulos || []).some((p) => p.id === m.id)) && (RANK[ctx.role] || 0) >= (RANK[m.permisos?.ver || 'staff'] || 1))
    .filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i)
    .map((m) => documentoDe(m, tools.filter((t) => t.modulo === m.id), origin));
}

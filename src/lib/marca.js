// La marca de un negocio: color, tipografía y tono de conversación. Una sola fuente para todo lo que el negocio muestra
// al público (tarjetas, recibos, mensajes) y para la IA (chat y MCP). Se guarda por negocio en mc_marca.
//   color 'app' = el color de la app del negocio (orgs.tema, que envía cada llamada); si cambia en Apariencia, cambia aquí.
import { one } from './crud.js';

// Los 9 temas de las apps. ui = color de la interfaz (--dw-p); card = [principal, claro, brillo rgb] para fondos oscuros.
export const TEMAS = {
  violeta: { nombre: 'Violeta', ui: '#6d28d9', card: ['#8f45f2', '#c99bfa', '168,85,247'] },
  azul: { nombre: 'Azul', ui: '#1d4ed8', card: ['#2f6fed', '#93c5fd', '59,130,246'] },
  indigo: { nombre: 'Índigo', ui: '#4338ca', card: ['#6366f1', '#a5b4fc', '99,102,241'] },
  rosa: { nombre: 'Rosa', ui: '#be185d', card: ['#db2777', '#f9a8d4', '236,72,153'] },
  rojo: { nombre: 'Rojo', ui: '#b91c1c', card: ['#dc2626', '#fca5a5', '239,68,68'] },
  naranja: { nombre: 'Naranja', ui: '#c2410c', card: ['#ea580c', '#fdba74', '249,115,22'] },
  verde: { nombre: 'Verde', ui: '#15803d', card: ['#0f9f6e', '#6ee7b7', '16,185,129'] },
  turquesa: { nombre: 'Turquesa', ui: '#0f766e', card: ['#0d9488', '#5eead4', '20,184,166'] },
  grafito: { nombre: 'Grafito', ui: '#374151', card: ['#64748b', '#cbd5e1', '100,116,139'] },
};

// Tipografías (lista cerrada: se leen bien y cargan rápido). google = parámetro family de Google Fonts.
export const FUENTES = {
  inter: { nombre: 'Inter', familia: "Inter, system-ui, sans-serif", google: 'Inter:wght@400;500;600' },
  poppins: { nombre: 'Poppins', familia: "Poppins, system-ui, sans-serif", google: 'Poppins:wght@400;500;600' },
  montserrat: { nombre: 'Montserrat', familia: "Montserrat, system-ui, sans-serif", google: 'Montserrat:wght@400;500;600' },
  nunito: { nombre: 'Nunito', familia: "Nunito, system-ui, sans-serif", google: 'Nunito:wght@400;600;700' },
  lora: { nombre: 'Lora (con serifa)', familia: "Lora, Georgia, serif", google: 'Lora:wght@400;500;600' },
  space: { nombre: 'Space Grotesk', familia: "'Space Grotesk', system-ui, sans-serif", google: 'Space+Grotesk:wght@400;500;600' },
};

// Tonos de conversación: `regla` es lo que se le pide a la IA; `ejemplo` lo ve el negocio en la vista previa.
export const TONOS = {
  cercano: { nombre: 'Cercano', regla: 'Habla de tú, con calidez y frases cortas, como una persona del equipo que conoce al cliente. Sin tecnicismos.', ejemplo: '¡Hola! Con gusto te ayudo. ¿Qué día te queda mejor?' },
  formal: { nombre: 'Formal', regla: 'Trata de usted, con cortesía y precisión. Frases completas, sin emojis ni coloquialismos.', ejemplo: 'Buenos días. Con mucho gusto le colaboro. ¿Qué fecha le resulta conveniente?' },
  amable: { nombre: 'Amable', regla: 'Sé paciente y empático: reconoce lo que la persona siente, explica con calma y ofrece ayuda concreta.', ejemplo: 'Entiendo, gracias por avisarnos. Vamos a resolverlo juntos; ¿me cuentas qué pasó?' },
  directo: { nombre: 'Directo', regla: 'Ve al punto: responde primero lo que se pregunta, en pocas líneas y con el siguiente paso claro.', ejemplo: 'Tu cita queda el jueves a las 3 p. m. Responde “sí” para confirmar.' },
  divertido: { nombre: 'Divertido', regla: 'Usa un humor ligero y positivo, con algún emoji, sin perder claridad ni respeto.', ejemplo: '¡Listo! 🎉 Tu pedido ya va en camino. ¡Que lo disfrutes!' },
};

// Plantillas de ejemplo para empezar (no se guardan hasta que el negocio las elija).
export const STARTERS = {
  chat: [
    { nombre: 'Atención al cliente', instrucciones: 'Responde las dudas de los clientes sobre el negocio. Si no sabes algo o no está en el sistema, dilo con honestidad y ofrece que una persona del equipo le responderá. Nunca inventes precios, horarios ni promesas.' },
    { nombre: 'Ventas y cotizaciones', instrucciones: 'Ayuda a elegir el producto o servicio adecuado, resume las opciones con los precios reales que tengas y termina siempre con un siguiente paso claro: agendar, pagar o escribir por WhatsApp.' },
    { nombre: 'Recordatorio de pagos', instrucciones: 'Cuando recuerdes un pago pendiente, sé respetuoso y breve: di el valor y la fecha, ofrece las formas de pago disponibles y agradece. No amenaces ni menciones cobro jurídico.' },
  ],
  mcp: [
    { nombre: 'Informe semanal del negocio', instrucciones: 'Cada lunes resume lo de la semana (ingresos, gastos, leads y tareas pendientes) en una página y termina con 3 recomendaciones concretas. Guarda el informe cuando termines.' },
    { nombre: 'Escribir con la voz del negocio', instrucciones: 'Cuando redactes mensajes, correos o publicaciones para clientes, usa el tono de la guía de marca. No prometas descuentos ni plazos que no estén en el sistema.' },
    { nombre: 'Confirmar antes de cambiar datos', instrucciones: 'Antes de crear, editar o borrar registros, explica en una frase qué vas a hacer y pide confirmación a la persona. Nunca borres datos sin que lo pida de forma explícita.' },
  ],
  agente: [
    { nombre: 'Seguimiento de leads', instrucciones: 'Cada día revisa los leads nuevos que no tienen contacto. Por cada uno crea una tarea para contactarlo hoy con un título concreto y, si puedes, deja redactado el primer mensaje en el tono de la marca. No contactes a nadie sin que una persona lo apruebe.' },
    { nombre: 'Recordatorios y cobros', instrucciones: 'Cada mañana busca lo que vence en los próximos 3 días y prepara los recordatorios para los clientes, con el valor y la fecha. Déjalos como borrador para aprobación; nunca los envíes solo.' },
    { nombre: 'Publicaciones de la semana', instrucciones: 'Cada lunes propón 3 ideas de publicación para redes con el tono de la marca, cada una con texto corto y una idea de imagen. Guárdalas como informe para que el equipo elija.' },
  ],
};

// chat = asistente de la app · mcp = asistente externo · agente = automatizaciones y agentes de IA
export const CANALES = ['chat', 'mcp', 'agente'];
export const COLORES = ['app', ...Object.keys(TEMAS)];
// Fondo de la marca: negro, blanco o igual que el modo (claro/oscuro) que la app tiene en Apariencia
export const FONDOS = { oscuro: 'Negro', claro: 'Blanco', app: 'Igual que mi app' };

// La marca efectiva de un negocio (org = «<app>:<id>»). Sin registro propio: color de la app, Inter y tono cercano.
export async function brandOf(env, org) {
  const row = await one(env, 'SELECT color, tipografia, tono, tono_notas, fondo, logo IS NOT NULL AS tiene_logo FROM mc_marca WHERE business_id = ?', org);
  const o = await one(env, 'SELECT tema, modo FROM orgs WHERE id = ?', org);
  const tema_app = TEMAS[o?.tema] ? o.tema : 'violeta';
  const color = COLORES.includes(row?.color) ? row.color : 'app';
  const fondo = FONDOS[row?.fondo] ? row.fondo : 'oscuro', modo_app = o?.modo === 'dark' ? 'oscuro' : 'claro';
  return {
    color, tema_app, color_efectivo: color === 'app' ? tema_app : color,
    fondo, modo_app, fondo_efectivo: fondo === 'app' ? modo_app : fondo,
    tipografia: FUENTES[row?.tipografia] ? row.tipografia : 'inter',
    tono: TONOS[row?.tono] ? row.tono : 'cercano', tono_notas: row?.tono_notas || '', tiene_logo: !!row?.tiene_logo,
  };
}

// Paleta de la marca: se CALCULA del color principal (el que guarda la app en Apariencia); aquí no se guarda nada.
//   50…900 = tonalidades del principal (500 es el principal) · fondo = fondo claro teñido · fondo_oscuro = fondo oscuro teñido
const mezcla = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
export function paleta(hex) {
  const claro = (t) => mezcla(hex, '#ffffff', t), oscuro = (t) => mezcla(hex, '#000000', t);
  return {
    50: claro(0.92), 100: claro(0.84), 200: claro(0.68), 300: claro(0.5), 400: claro(0.25), 500: hex,
    600: oscuro(0.12), 700: oscuro(0.28), 800: oscuro(0.45), 900: oscuro(0.62),
    fondo: claro(0.96), fondo_oscuro: mezcla('#0b0d14', hex, 0.14), texto: '#1f2937', texto_oscuro: '#e6e9f2',
  };
}

const rgbDe = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

// El «kit de marca»: todo lo que otra pieza necesita para verse y hablar como el negocio (una web, otra app, un chat, un agente).
// Lo entregan la pantalla Marca e IA (copiar/descargar), GET /api/marca/kit, la herramienta MCP marca.kit_de_marca y el RPC marca().
export async function kitOf(env, org, nombre = null, { logo = false } = {}) {
  const b = await brandOf(env, org);
  const t = TEMAS[b.color_efectivo], f = FUENTES[b.tipografia], pal = paleta(t.ui);
  const { results } = await env.DB.prepare('SELECT canal, nombre, instrucciones FROM mc_plantillas WHERE business_id = ? AND activa = 1 ORDER BY created_at').bind(org).all();
  const lg = await one(env, 'SELECT logo FROM mc_marca WHERE business_id = ?', org);
  const googleUrl = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  const prompts = Object.fromEntries(CANALES.map((k) => [k, [tonoPrompt(b), ...results.filter((r) => r.canal === k).map((r) => `## ${r.nombre}\n${r.instrucciones}`)].join('\n\n')]));
  return {
    version: 1, negocio: nombre,
    color: { id: b.color_efectivo, nombre: t.nombre, sigue_a_la_app: b.color === 'app', principal: t.ui, principal_rgb: rgbDe(t.ui), claro: t.card[1], brillo_rgb: t.card[2], texto_sobre_principal: '#ffffff', paleta: pal },
    fondo: { elegido: b.fondo, efectivo: b.fondo_efectivo, color: b.fondo_efectivo === 'claro' ? pal.fondo : pal.fondo_oscuro, tinta: b.fondo_efectivo === 'claro' ? pal.texto : pal.texto_oscuro },
    tipografia: { id: b.tipografia, nombre: f.nombre, familia: f.familia, google_url: googleUrl, html: `<link href="${googleUrl}" rel="stylesheet">` },
    css: `:root{--marca:${t.ui};--marca-rgb:${rgbDe(t.ui)};--marca-claro:${t.card[1]};--marca-texto:#ffffff;${[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => `--marca-${n}:${pal[n]}`).join(';')};--marca-fondo:${pal.fondo};--marca-fondo-oscuro:${pal.fondo_oscuro};--marca-tinta:${pal.texto};--marca-tinta-oscura:${pal.texto_oscuro};--marca-fondo-actual:${b.fondo_efectivo === 'claro' ? pal.fondo : pal.fondo_oscuro};--marca-tinta-actual:${b.fondo_efectivo === 'claro' ? pal.texto : pal.texto_oscuro};--marca-fuente:${f.familia}}\nbody{font-family:var(--marca-fuente);background:var(--marca-fondo-actual);color:var(--marca-tinta-actual)}`,
    tono: { id: b.tono, nombre: TONOS[b.tono].nombre, regla: TONOS[b.tono].regla, notas: b.tono_notas || null },
    logo: lg?.logo ? { disponible: true, formato: /^data:image\/([a-z+]+);/.exec(lg.logo)?.[1] || null, ...(logo ? { data_url: lg.logo } : { nota: 'Pídelo con ?logo=1 (API), en la pestaña «Usar en otros lados» o con el RPC marca()' }) } : null,
    prompts, plantillas: results,
  };
}

export const tonoPrompt = (b) => `Tono de conversación: ${TONOS[b.tono].nombre}. ${TONOS[b.tono].regla}${b.tono_notas ? ` Indicaciones del negocio sobre cómo hablar: ${b.tono_notas}` : ''}`;

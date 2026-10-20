// Flujos de trabajo ENTRE módulos: cada módulo trae su guía de uso (src/lib/guias.js); aquí está lo que cruza varios de ellos.
// Un flujo solo aplica si TODAS sus herramientas están disponibles para este negocio y este rol (módulos activos, módulos propios de la app, permisos),
// así que sirve igual para cualquier app: los pasos de módulos que no tenga simplemente no salen.
// Lo usan el asistente (IA Diwilo), los agentes, las sugerencias y la API de guías (`entre`).
import { wire } from './guias.js';

export const FLUJOS_ENTRE_MODULOS = [
  { id: 'lead_a_cobro', nombre: 'De un contacto a una cuenta de cobro', descripcion: 'Busca al contacto en Marketing, crea su cuenta de cobro en Finanzas y deja una tarea de seguimiento.',
    pasos: ['marketing.buscar_contactos', 'finanzas.ver_centros_y_cuentas', 'finanzas.crear_cuenta_cobro', 'marketing.crear_tarea'],
    reglas: 'Confirma con la persona el valor, el concepto y el centro de costo antes de crear la cuenta de cobro. La tarea de seguimiento lleva la fecha de vencimiento.' },
  { id: 'cobranza', nombre: 'Cobranza con seguimiento', descripcion: 'Revisa la cartera por cobrar, ubica a los deudores en Marketing y crea una tarea de cobro por cada uno, con el tono de la marca.',
    pasos: ['finanzas.cartera', 'marketing.buscar_contactos', 'marca.guia_de_marca', 'marketing.crear_tarea'],
    reglas: 'Empieza por los más vencidos. Redacta el mensaje de cobro con la voz de la marca (marca.guia_de_marca), amable y concreto. Una tarea por deudor, sin duplicar las que ya existen (marketing.tareas_pendientes).' },
  { id: 'campana_con_marca', nombre: 'Campaña con la voz de la marca', descripcion: 'Lee la guía de marca, escribe la campaña con ese tono y créala en Marketing con su tarea de lanzamiento.',
    pasos: ['marca.guia_de_marca', 'marketing.ver_listas', 'marketing.crear_campana', 'marketing.crear_tarea'],
    reglas: 'Pide el objetivo y la lista de destino antes de crear la campaña. Usa el tono, los colores y las plantillas de la marca; no inventes ofertas ni precios.' },
  { id: 'informe_general', nombre: 'Informe general del negocio', descripcion: 'Reúne los datos de Finanzas y de Marketing, escribe un solo informe con conclusiones y guarda cada parte donde corresponde.',
    pasos: ['finanzas.datos_informe', 'marketing.datos_informe', 'finanzas.guardar_informe', 'marketing.guardar_informe'],
    reglas: 'Cruza las cifras: cuánto se invirtió en marketing contra cuánto entró, qué contactos están por cobrar. Cada cifra sale de una herramienta de lectura.' },
  { id: 'chat_a_contacto', nombre: 'De una conversación del chat a un contacto', descripcion: 'Lee las conversaciones recientes de los chats de clientes, crea el contacto de quien dejó sus datos y una tarea para atenderlo.',
    pasos: ['ai.ver_conversaciones', 'ai.leer_conversacion', 'marketing.buscar_contactos', 'marketing.crear_contacto', 'marketing.crear_tarea'],
    reglas: 'Antes de crear el contacto busca si ya existe (por correo o teléfono). Solo crea contactos de quien dio sus datos.' },
  { id: 'matricula_y_cobro', nombre: 'Matricular y cobrar', descripcion: 'Ubica o crea al estudiante, revisa su cartera de cuotas, registra el pago y comprueba que quedó en Finanzas.',
    pasos: ['estudiantes.buscar', 'estudiantes.crear', 'cuotas.cartera', 'cuotas.registrar_pago', 'finanzas.buscar_movimientos'],
    reglas: 'Busca primero al estudiante: crea uno nuevo solo si no existe. El pago registrado en cuotas genera solo su recibo y su movimiento en Finanzas; después verifícalo con buscar_movimientos y no lo registres otra vez.' },
  { id: 'cartera_estudiantes', nombre: 'Cartera de estudiantes con seguimiento', descripcion: 'Mira quién debe cuotas, revisa su ficha y crea tareas de cobro en Marketing.',
    pasos: ['cuotas.cartera', 'estudiantes.ficha', 'marketing.crear_tarea'],
    reglas: 'Ordena por mora. No cobres a quien ya tiene un pago en revisión. Una tarea por estudiante.' },
  { id: 'clases_y_reposiciones', nombre: 'Clases de hoy y reposiciones pendientes', descripcion: 'Resume las clases del día y las reposiciones que faltan, y deja tareas para el equipo.',
    pasos: ['cursos.clases_de_hoy', 'reposiciones.pendientes', 'marketing.crear_tarea'],
    reglas: 'Solo lectura salvo las tareas. Avisa qué reposiciones llevan más tiempo pendientes.' },
];

const disponibles = (tools) => new Set(tools.map((t) => t.name));

// Los flujos entre módulos que aplican con estas herramientas. Cada paso es opcional salvo que el flujo se quede sin ninguno de sus módulos: se exige al menos una herramienta
// de cada módulo que el flujo toca, y se quitan los pasos que no existen.
export function flujosEntre(tools) {
  const hay = disponibles(tools);
  return FLUJOS_ENTRE_MODULOS.map((f) => {
    const mods = [...new Set(f.pasos.map((p) => p.split('.')[0]))];
    const ok = mods.every((m) => f.pasos.some((p) => p.startsWith(`${m}.`) && hay.has(p)));
    if (!ok) return null;
    const pasos = f.pasos.filter((p) => hay.has(p));
    return { id: f.id, nombre: f.nombre, descripcion: f.descripcion, modulos: mods, pasos: pasos.map(wire), reglas: f.reglas,
      prompt: `${f.nombre}: ${f.descripcion} Sigue estos pasos con las herramientas, en orden: ${pasos.map(wire).join(' → ')}. ${f.reglas} Antes de escribir o cambiar datos, pídeme confirmación.` };
  }).filter(Boolean);
}

export const flujosEnTexto = (flujos) => (flujos.length ? `\nFLUJOS ENTRE MÓDULOS (cuando lo que piden cruza varios módulos, sigue el flujo que corresponda: lee primero, escribe después y confirma):\n${flujos.map((f) => `- ${f.nombre} [${f.modulos.join(' + ')}]: ${f.descripcion} Pasos: ${f.pasos.join(' → ')}. ${f.reglas}`).join('\n')}\n` : '');

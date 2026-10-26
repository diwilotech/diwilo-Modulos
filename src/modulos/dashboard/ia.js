// Herramientas de IA del Dashboard (MCP del negocio).
import { tablero } from './api.js';

export default [
  {
    name: 'dashboard.resumen_del_dia', modulo: 'dashboard', rol: 'staff', tipo: 'lectura',
    description: 'El resumen del día del negocio: los indicadores de sus módulos activos y las alertas que necesitan atención (tareas vencidas, cartera vencida, tope de IA, marca incompleta). Úsala cuando pregunten cómo va el negocio o qué atender primero.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (c) => { const t = await tablero(c); return { fecha: t.hoy, indicadores: t.widgets.map(({ titulo, valor, detalle }) => ({ titulo, valor, detalle })), alertas: t.alertas.map(({ nivel, texto }) => ({ nivel, texto })) }; },
  },
];

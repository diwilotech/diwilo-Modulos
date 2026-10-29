// Movimientos del Inicio isométrico: cada módulo anota qué pasó (solo el tipo, sin datos personales) y la figura de la línea lo traduce a un viaje por la cinta.
// Los tipos válidos están en LINEAS[...].flujos de public/m/inicio.js. Retención de 30 días (se limpia en el cron diario).
const TIPO = /^[a-z]+\.[a-z_]+$/;
export async function emitirInicio(env, org, tipo) {
  if (!TIPO.test(tipo || '')) return;
  try { await env.DB.prepare('INSERT INTO inicio_eventos (business_id, tipo, creado_en) VALUES (?, ?, ?)').bind(org, tipo, Date.now()).run(); } catch (e) { console.error('inicio evento', e.message); }
}
export const limpiarInicio = (env) => env.DB.prepare('DELETE FROM inicio_eventos WHERE creado_en < ?').bind(Date.now() - 30 * 86400000).run().catch(() => null);

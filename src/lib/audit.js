// Bitácora: aquí no se guarda; cada cambio se devuelve a la app que hizo la llamada y la app lo escribe en su
// bitácora (audit_log) con el usuario y el origen (app o IA). Así el negocio ve todo en un solo lugar.
export async function audit(c, accion, { modulo = c.module || null, detalle = null, origen = c.origin || 'app' } = {}) {
  (c.auditLog ||= []).push({ accion: String(accion).slice(0, 120), modulo, origen,
    detalle: detalle == null ? null : (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)).slice(0, 2000) });
  c.audited = true;
}

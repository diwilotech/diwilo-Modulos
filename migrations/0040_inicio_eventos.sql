-- Inicio isométrico («Así funciona tu negocio»): movimientos de la figura. Solo agregados: nunca nombres, teléfonos ni montos. Retención 30 días.
CREATE TABLE IF NOT EXISTS inicio_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  tipo TEXT NOT NULL,             -- lead.nuevo | chat.nuevo | matricula.creada | pago.recibido | …
  creado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS inicio_eventos_business ON inicio_eventos (business_id, id);

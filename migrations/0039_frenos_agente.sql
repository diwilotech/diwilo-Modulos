-- Mensajes 3.10.0: frenos de producción del agente (tope diario por chat, errores con aviso, «no más mensajes»).
ALTER TABLE wa_agentes ADD COLUMN tope_diario INTEGER NOT NULL DEFAULT 100;      -- respuestas de IA por chat y por día (0 = sin tope)
ALTER TABLE wa_conversaciones ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0;   -- la persona pidió no recibir más mensajes (sin IA ni plantillas)
CREATE TABLE IF NOT EXISTS wa_errores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  bandeja_id INTEGER,
  contacto TEXT,
  tipo TEXT NOT NULL,                                                             -- modelo | envio | tope
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_errores_business ON wa_errores (business_id, created_at);

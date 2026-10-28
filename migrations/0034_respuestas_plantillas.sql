-- Mensajes 3.5.0: «mis plantillas» (respuestas reutilizables para cualquier canal), cuenta de mensajería para las plantillas de Meta y envío de correos a contactos.
ALTER TABLE wa_bandejas ADD COLUMN cuenta_plantillas TEXT;      -- WhatsApp: id de la cuenta de mensajería (dueña de las plantillas de Meta); vacío = la misma cuenta de WhatsApp
CREATE TABLE IF NOT EXISTS wa_respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  canales TEXT NOT NULL DEFAULT '[]',            -- JSON con los canales donde sirve (vacío = todos)
  asunto TEXT,                                   -- para correo
  cuerpo TEXT NOT NULL,                          -- admite {nombre} y {empresa}
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_respuestas_business ON wa_respuestas (business_id);

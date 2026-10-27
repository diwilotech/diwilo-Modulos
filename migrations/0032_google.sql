-- Mensajes 3.1.0: conexión con Google (Gmail y Calendar) por negocio. Las credenciales del cliente OAuth las sube el equipo; el secreto y el token van cifrados.
CREATE TABLE IF NOT EXISTS wa_google (
  business_id TEXT PRIMARY KEY,
  client_id TEXT,
  secreto_cifrado TEXT,                          -- secreto del cliente OAuth (AES-GCM con CLAVES_KEK)
  refresh_cifrado TEXT,                          -- token de acceso permanente de la cuenta conectada
  email TEXT,                                    -- cuenta de Google conectada
  scopes TEXT,
  conectado_at INTEGER,
  estado TEXT,                                   -- «state» de la conexión en curso (anti-falsificación)
  estado_exp INTEGER,
  agenda TEXT,                                   -- JSON con el horario de atención y la duración de las citas
  gmail_activo INTEGER NOT NULL DEFAULT 1,       -- leer los correos nuevos de Gmail en las bandejas de correo
  gmail_desde INTEGER,                           -- segundo (Unix) desde el que se buscan correos nuevos
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_google_estado ON wa_google (estado);
ALTER TABLE wa_agentes ADD COLUMN agendar INTEGER NOT NULL DEFAULT 0;   -- el agente puede agendar citas con Google Meet
ALTER TABLE wa_conversaciones ADD COLUMN cita TEXT;                     -- JSON { id, inicio, link } de la cita agendada en este chat

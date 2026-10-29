-- Historial del asistente «IA Diwilo» del equipo: se guarda en las mismas tablas de conversaciones (canal = 'asistente', chat_id = 0)
-- para poder revisarlo después y analizarlo en busca de errores. Solo agregar columnas.
ALTER TABLE ia_conversaciones ADD COLUMN canal TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE ia_conversaciones ADD COLUMN user_id TEXT;
ALTER TABLE ia_conversaciones ADD COLUMN analisis TEXT;
ALTER TABLE ia_conversaciones ADD COLUMN analizado_at INTEGER;
ALTER TABLE ia_mensajes ADD COLUMN meta TEXT;            -- JSON: pasos/herramientas que usó la respuesta
CREATE INDEX IF NOT EXISTS ia_conv_canal ON ia_conversaciones (business_id, canal, last_at);

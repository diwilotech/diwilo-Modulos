-- Mensajes 3.9.0: fotos, videos, audios y documentos en los chats; biblioteca de archivos; espera para responder en uno cuando llegan muchos mensajes seguidos.
ALTER TABLE wa_mensajes ADD COLUMN tipo TEXT;                    -- NULL/texto | imagen | video | audio | documento | sticker
ALTER TABLE wa_mensajes ADD COLUMN media_ref TEXT;               -- WhatsApp: id del archivo en Meta · Instagram y Messenger: dirección del archivo
ALTER TABLE wa_mensajes ADD COLUMN media_key TEXT;               -- clave en R2 (cuando ya se descargó)
ALTER TABLE wa_mensajes ADD COLUMN media_mime TEXT;
ALTER TABLE wa_mensajes ADD COLUMN media_nombre TEXT;
ALTER TABLE wa_mensajes ADD COLUMN media_bytes INTEGER;
ALTER TABLE wa_mensajes ADD COLUMN media_estado TEXT;            -- pendiente | listo | grande | error
ALTER TABLE wa_mensajes ADD COLUMN media_texto TEXT;             -- transcripción del audio o descripción de la foto / resumen del documento (IA)
CREATE TABLE IF NOT EXISTS wa_archivos (                         -- biblioteca: archivos que el equipo o el administrador guardó
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  mensaje_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  contact_id INTEGER,                                            -- contacto de Marketing al que se adjuntó (opcional)
  creado_por TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_archivos_business ON wa_archivos (business_id, created_at);
ALTER TABLE wa_agentes ADD COLUMN espera_seg INTEGER NOT NULL DEFAULT 5;   -- segundos que espera a que la persona termine de escribir para responder todo junto (0 = responde a cada mensaje)

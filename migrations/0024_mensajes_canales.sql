-- WhatsApp 2.0.0 («Mensajes»): bandejas de varios canales (WhatsApp, Instagram, Messenger) y conversaciones con estado.
ALTER TABLE wa_bandejas ADD COLUMN canal TEXT NOT NULL DEFAULT 'whatsapp';   -- whatsapp | instagram | messenger (phone_number_id = id del número, de la página o de la cuenta de Instagram)

-- Una fila por chat (bandeja + contacto): lista de la izquierda, interruptor de IA, contacto de Marketing enlazado y datos capturados
CREATE TABLE IF NOT EXISTS wa_conversaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  bandeja_id INTEGER NOT NULL,
  contacto TEXT NOT NULL,                        -- número (WhatsApp) o id de la persona en Instagram / Messenger
  nombre TEXT,
  ia_activa INTEGER NOT NULL DEFAULT 1,          -- el agente de la bandeja responde en este chat
  contact_id INTEGER,                            -- contacto de Marketing enlazado (mk_contacts)
  datos TEXT,                                    -- JSON con lo que capturó el agente: nombre, telefono, correo, interes
  no_leidos INTEGER NOT NULL DEFAULT 0,
  ultimo_ts INTEGER NOT NULL DEFAULT 0,
  ultimo_texto TEXT,
  ultimo_rol TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (bandeja_id, contacto)
);
CREATE INDEX IF NOT EXISTS wa_conv_business ON wa_conversaciones (business_id, ultimo_ts);

INSERT OR IGNORE INTO wa_conversaciones (business_id, bandeja_id, contacto, nombre, ultimo_ts, ultimo_texto, ultimo_rol, created_at)
SELECT m.business_id, m.bandeja_id, m.contacto, MAX(m.nombre), MAX(m.ts),
  (SELECT contenido FROM wa_mensajes x WHERE x.business_id = m.business_id AND x.bandeja_id = m.bandeja_id AND x.contacto = m.contacto ORDER BY x.ts DESC, x.id DESC LIMIT 1),
  (SELECT rol FROM wa_mensajes x WHERE x.business_id = m.business_id AND x.bandeja_id = m.bandeja_id AND x.contacto = m.contacto ORDER BY x.ts DESC, x.id DESC LIMIT 1),
  MIN(m.ts)
FROM wa_mensajes m GROUP BY m.business_id, m.bandeja_id, m.contacto;

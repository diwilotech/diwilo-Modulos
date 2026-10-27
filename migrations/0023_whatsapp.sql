-- WhatsApp 1.0.0: bandejas de entrada (WhatsApp Cloud API de Meta), agentes de IA por bandeja y mensajes.
-- La clave API y el secreto de la app van cifrados (AES-GCM con CLAVES_KEK); nunca se devuelven por la API.
CREATE TABLE IF NOT EXISTS wa_bandejas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,                     -- va en la URL del webhook: /wa/<slug> (no adivinable)
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,                        -- +57…
  phone_number_id TEXT NOT NULL,                 -- id del número de teléfono en Meta
  waba_id TEXT NOT NULL,                         -- id de la cuenta de WhatsApp Business
  clave_cifrada TEXT,                            -- token de acceso (clave API)
  secreto_cifrado TEXT,                          -- secreto de la app de Meta (opcional): valida la firma del webhook
  verify_token TEXT NOT NULL,                    -- token de verificación del webhook
  activo INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_bandejas_business ON wa_bandejas (business_id);

CREATE TABLE IF NOT EXISTS wa_agentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  bandeja_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  instrucciones TEXT,
  usar_marca INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1,             -- solo uno activo por bandeja responde
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_agentes_bandeja ON wa_agentes (business_id, bandeja_id);

CREATE TABLE IF NOT EXISTS wa_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  bandeja_id INTEGER NOT NULL,
  contacto TEXT NOT NULL,                        -- número de quien escribe (solo dígitos)
  nombre TEXT,                                   -- nombre de perfil de WhatsApp
  ts INTEGER NOT NULL,
  rol TEXT NOT NULL,                             -- user | assistant (agente) | humano
  contenido TEXT NOT NULL,
  wamid TEXT UNIQUE,                             -- id del mensaje en WhatsApp (evita procesar dos veces)
  estado TEXT                                    -- enviado | error | sin_clave (mensajes salientes)
);
CREATE INDEX IF NOT EXISTS wa_msg_conv ON wa_mensajes (business_id, bandeja_id, contacto, ts);

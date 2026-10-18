-- IA 1.0.0: módulo general de IA por negocio. Chats de clientes (se despliegan en tarjetas, webs y demás), sus conversaciones,
-- asistente y agentes con herramientas de los demás módulos, consumo con tope diario y claves de API.
ALTER TABLE orgs ADD COLUMN solo_lectura INTEGER;                -- la app avisa si la suscripción venció (los agentes no corren)
ALTER TABLE mk_cards ADD COLUMN chat_slug TEXT;                  -- chat de IA que se muestra en la tarjeta

-- Chats de clientes: un negocio puede tener varios (soporte, ventas, una landing…), cada uno con su dirección /chat/<slug> en el dominio de la app
CREATE TABLE IF NOT EXISTS ia_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  saludo TEXT,                                   -- primer mensaje que ve el cliente
  instrucciones TEXT,                            -- qué sabe y cómo responde este chat
  usar_marca INTEGER NOT NULL DEFAULT 1,         -- aplica el tono de la marca y las plantillas activas del chat
  capturar_leads INTEGER NOT NULL DEFAULT 1,     -- guarda en Marketing a quien deja sus datos
  whatsapp TEXT,                                 -- respaldo: «Seguir por WhatsApp»
  webhook_url TEXT,                              -- recibe chat_iniciado y lead_capturado
  limite_dia INTEGER,                            -- tope propio por día (nunca más que el del negocio)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ia_chats_business ON ia_chats (business_id);

CREATE TABLE IF NOT EXISTS ia_conversaciones (
  id TEXT PRIMARY KEY,                           -- <chat>-<sid del navegador>
  business_id TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
  pagina TEXT, pais TEXT, dispositivo TEXT,
  msg_count INTEGER NOT NULL DEFAULT 0,
  lead_id INTEGER                                -- contacto de Marketing creado desde esta conversación
);
CREATE INDEX IF NOT EXISTS ia_conv_business ON ia_conversaciones (business_id, last_at);
CREATE TABLE IF NOT EXISTS ia_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  conversacion_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  rol TEXT NOT NULL,                             -- user | assistant
  contenido TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ia_msg_conv ON ia_mensajes (conversacion_id, ts);

-- Consumo: una fila por negocio, día, fuente (chat, agente, asistente) y proveedor
CREATE TABLE IF NOT EXISTS ia_uso (
  business_id TEXT NOT NULL, day TEXT NOT NULL, fuente TEXT NOT NULL, proveedor TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0, tin INTEGER NOT NULL DEFAULT 0, tout INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, day, fuente, proveedor)
);

-- Agentes: trabajan solos (manual, diario o semanal) con herramientas de los módulos activos; lo que escriben se propone o se ejecuta
CREATE TABLE IF NOT EXISTS ia_agentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  instrucciones TEXT NOT NULL,
  herramientas TEXT NOT NULL DEFAULT '[]',       -- JSON: nombres de herramientas (p. ej. marketing.resumen)
  programacion TEXT NOT NULL DEFAULT 'manual',   -- manual | diario | semanal (lunes)
  autonomia TEXT NOT NULL DEFAULT 'proponer',    -- proponer (tú apruebas) | ejecutar
  activo INTEGER NOT NULL DEFAULT 1,
  ultima_ejecucion INTEGER, ejecuciones INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ia_agentes_business ON ia_agentes (business_id);
CREATE TABLE IF NOT EXISTS ia_ejecuciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  agente_id INTEGER NOT NULL,
  disparador TEXT NOT NULL,                      -- manual | programado
  estado TEXT NOT NULL DEFAULT 'en_curso',       -- en_curso | ok | error
  resumen TEXT,
  pasos TEXT NOT NULL DEFAULT '[]',              -- JSON: [{ herramienta, args, estado: consultada|hecha|propuesta|rechazada|error, resultado }]
  pendientes INTEGER NOT NULL DEFAULT 0,         -- propuestas por aprobar
  por TEXT,
  created_at INTEGER NOT NULL, terminada_at INTEGER
);
CREATE INDEX IF NOT EXISTS ia_ejec_agente ON ia_ejecuciones (business_id, agente_id, created_at);

-- Claves de la API del negocio (conversaciones y contactos): solo se guarda su huella
CREATE TABLE IF NOT EXISTS ia_claves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  prefijo TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  created_by TEXT, created_at INTEGER NOT NULL, last_used INTEGER, revocada INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ia_claves_business ON ia_claves (business_id);

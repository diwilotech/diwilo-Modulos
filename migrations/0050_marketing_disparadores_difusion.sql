-- Marketing 1.11.0: disparadores por etapa, motivo de pérdida, historial de etapas (informe de conversión) y difusiones.
ALTER TABLE mk_pipelines ADD COLUMN autos TEXT;        -- JSON { "<etapa>": [{ tipo: tarea|seguimiento|plantilla, … }] } = qué pasa al entrar a la etapa
ALTER TABLE mk_deals ADD COLUMN lost_reason TEXT;      -- por qué se perdió

-- Cada cambio de etapa de una oportunidad (de = NULL al crearla)
CREATE TABLE IF NOT EXISTS mk_deal_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  deal_id INTEGER NOT NULL,
  de TEXT, a TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_deal_moves_deal ON mk_deal_moves (business_id, deal_id, ts);

-- Difusión: un mensaje (plantilla de WhatsApp o correo) a un segmento de contactos; se envía por tandas
CREATE TABLE IF NOT EXISTS mk_difusiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  canal TEXT NOT NULL,                 -- whatsapp | correo
  bandeja_id INTEGER NOT NULL,
  plantilla TEXT, idioma TEXT, variables TEXT,   -- WhatsApp (variables = JSON)
  asunto TEXT, mensaje TEXT,                     -- correo
  segmento TEXT,                                 -- JSON del filtro usado
  estado TEXT NOT NULL DEFAULT 'pendiente',      -- pendiente | enviando | terminada
  total INTEGER NOT NULL DEFAULT 0, enviados INTEGER NOT NULL DEFAULT 0, fallidos INTEGER NOT NULL DEFAULT 0,
  creado_por TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_difusiones_business ON mk_difusiones (business_id, created_at);
CREATE TABLE IF NOT EXISTS mk_difusion_dest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  difusion_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',      -- pendiente | enviado | fallido
  error TEXT, ts INTEGER
);
CREATE INDEX IF NOT EXISTS mk_difusion_dest_estado ON mk_difusion_dest (business_id, difusion_id, estado);

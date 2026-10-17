-- Marca e IA 1.0.0: la marca del negocio (color, tipografía, tono de conversación) y las plantillas de la IA (chat y MCP).
-- orgs.tema: el color de la app del negocio (lo envía cada llamada), para las páginas públicas que se pintan sin sesión.
ALTER TABLE orgs ADD COLUMN tema TEXT;

CREATE TABLE IF NOT EXISTS mc_marca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'app',            -- 'app' (sigue el color de la app) o uno de los 9 temas
  tipografia TEXT NOT NULL DEFAULT 'inter',     -- inter | poppins | montserrat | nunito | lora | space
  tono TEXT NOT NULL DEFAULT 'cercano',         -- cercano | formal | amable | directo | divertido
  tono_notas TEXT,                              -- indicaciones propias del negocio (máx. 500)
  updated_by TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mc_plantillas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'chat',           -- chat (asistente de la app) | mcp (asistente externo) | agente (automatizaciones y agentes de IA)
  instrucciones TEXT NOT NULL,                  -- máx. 2000
  activa INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mc_plantillas_business ON mc_plantillas (business_id, canal);

-- Las tarjetas predeterminadas siguen el color de la app (accent = 'app')
UPDATE mk_cards SET accent = 'app' WHERE predeterminada = 1;

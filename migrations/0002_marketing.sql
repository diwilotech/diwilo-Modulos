-- Módulo marketing (Worker central): business_id = «<app>:<id del negocio>».

-- ---- 0001_base.sql ----
-- Marketing (igual al Marketing Hub de Diwilo, por negocio): clientes y leads, oportunidades, campañas con links de
-- rastreo por plataforma, gasto de pauta, tareas y automatizaciones, listas y suscripciones/herramientas.
-- Montos en pesos colombianos (enteros). Fechas 'YYYY-MM-DD'. created_at/updated_at en milisegundos.

CREATE TABLE IF NOT EXISTS mk_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT, phone TEXT, company TEXT,
  stage TEXT NOT NULL DEFAULT 'lead',             -- lead | cliente | perdido
  source TEXT, campaign_id INTEGER, owner TEXT, tags TEXT, notes TEXT,
  last_contact_at TEXT,
  ref TEXT,                                       -- origen externo sin duplicar (p. ej. otro módulo de la app)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_contacts_business ON mk_contacts (business_id, stage, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS mk_contacts_ref ON mk_contacts (business_id, ref);

CREATE TABLE IF NOT EXISTS mk_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  title TEXT NOT NULL, contact_id INTEGER, campaign_id INTEGER,
  value INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'nuevo',            -- nuevo | calificado | propuesta | negociacion | ganado | perdido
  expected_close TEXT, closed_at INTEGER, notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_deals_business ON mk_deals (business_id, stage);

CREATE TABLE IF NOT EXISTS mk_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'meta_ads',       -- meta_ads | google_ads | whatsapp | correo | organico | otro
  status TEXT NOT NULL DEFAULT 'activa',          -- activa | pausada | terminada
  start_date TEXT, end_date TEXT,
  budget INTEGER NOT NULL DEFAULT 0, goal_leads INTEGER,
  utm_campaign TEXT, notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_campaigns_business ON mk_campaigns (business_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS mk_campaigns_utm ON mk_campaigns (business_id, utm_campaign);

CREATE TABLE IF NOT EXISTS mk_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  campaign_id INTEGER NOT NULL, date TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0, leads INTEGER NOT NULL DEFAULT 0, clicks INTEGER, impressions INTEGER, note TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_spend_business ON mk_spend (business_id, campaign_id, date);

-- Links de rastreo cortos (/l/<slug>) de cada campaña por plataforma, con sus clics.
CREATE TABLE IF NOT EXISTS mk_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  campaign_id INTEGER NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL, title TEXT, target TEXT NOT NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  clicks INTEGER NOT NULL DEFAULT 0, last_click_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_links_business ON mk_links (business_id, campaign_id);

CREATE TABLE IF NOT EXISTS mk_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  title TEXT NOT NULL, due_date TEXT, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER,
  contact_id INTEGER, deal_id INTEGER, assignee TEXT, notes TEXT,
  source TEXT,                                    -- manual | plantilla | auto:<id>:<clave>:<paso>
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_tasks_business ON mk_tasks (business_id, done, due_date);

CREATE TABLE IF NOT EXISTS mk_automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,                          -- lead_nuevo | sin_contacto | presupuesto_campana
  action TEXT NOT NULL,                           -- crear_tarea | crear_oportunidad
  days INTEGER, percent INTEGER,
  task_title TEXT,                                -- JSON [{ t, d }] pasos: tarea y días
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER, runs INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_automations_business ON mk_automations (business_id, active, trigger);

CREATE TABLE IF NOT EXISTS mk_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'otra',              -- competidores | fuentes | temas | tendencias | prospectos | otra
  description TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mk_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  list_id INTEGER NOT NULL,
  title TEXT NOT NULL, url TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'activo',          -- activo | revisado | descartado
  score INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_list_items_business ON mk_list_items (business_id, list_id);

CREATE TABLE IF NOT EXISTS mk_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'marketing',     -- marketing | crm | infraestructura | software | api | ia | otro
  vendor TEXT, plan TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  cycle TEXT NOT NULL DEFAULT 'mensual',          -- mensual | anual | por uso
  renews_on TEXT, url TEXT, account_email TEXT,
  status TEXT NOT NULL DEFAULT 'activa',          -- activa | prueba | cancelada
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_tools_business ON mk_tools (business_id, status);

-- ---- 0002_listas_informes.sql ----
-- Marketing 1.1.0: revisar los sitios de una lista (feed y últimas publicaciones), informes del analista
-- y centro de costo de las suscripciones (si el negocio también usa Finanzas).
ALTER TABLE mk_list_items ADD COLUMN feed_url TEXT;
ALTER TABLE mk_list_items ADD COLUMN data TEXT;
ALTER TABLE mk_list_items ADD COLUMN last_checked_at INTEGER;
ALTER TABLE mk_tools ADD COLUMN cost_center_id INTEGER;

CREATE TABLE IF NOT EXISTS mk_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  title TEXT NOT NULL, content TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'ia',             -- ia (asistente del negocio por MCP) | automatico | manual
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_reports_business ON mk_reports (business_id, created_at);

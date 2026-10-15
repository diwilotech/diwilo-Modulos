-- Negocios que usan los módulos: id = «<app>:<id del negocio>». Lo mantiene cada llamada de su app
-- (nombre para documentos e informes, y los módulos que tiene activos para las tareas diarias).
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  business_id TEXT NOT NULL,
  name TEXT,
  modulos TEXT,                -- JSON: módulos centrales activos para el negocio
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orgs_app ON orgs (app);

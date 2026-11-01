-- Agente automático por módulo (ia_agentes.modulo; auto=1 lo crea el sistema y solo se edita su «Estrategia»)
-- y estado del Inicio que cada módulo EMPUJA (dashboard_estado), en vez de que Inicio lo busque en vivo.
ALTER TABLE ia_agentes ADD COLUMN modulo TEXT;
ALTER TABLE ia_agentes ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS ia_agentes_modulo ON ia_agentes (business_id, modulo) WHERE modulo IS NOT NULL;   -- un solo agente automático por módulo y negocio
CREATE TABLE IF NOT EXISTS dashboard_estado (
  business_id TEXT NOT NULL,
  modulo TEXT NOT NULL,
  widgets TEXT NOT NULL DEFAULT '[]',
  alertas TEXT NOT NULL DEFAULT '[]',
  actualizado_en INTEGER NOT NULL,
  PRIMARY KEY (business_id, modulo)
);

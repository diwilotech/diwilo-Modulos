-- Marketing 2.x: pipelines de oportunidades con etapas propias y seguimiento de cada oportunidad.
-- Cada pipeline tiene sus etapas abiertas (JSON [{k, n}]); «ganado» y «perdido» cierran en todos.
CREATE TABLE IF NOT EXISTS mk_pipelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  stages TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_pipelines_business ON mk_pipelines (business_id, position, id);

ALTER TABLE mk_deals ADD COLUMN pipeline_id INTEGER;   -- NULL = pipeline principal (el primero del negocio)
ALTER TABLE mk_deals ADD COLUMN next_date TEXT;        -- próximo seguimiento (AAAA-MM-DD)
ALTER TABLE mk_deals ADD COLUMN next_time TEXT;        -- hora (HH:MM)
ALTER TABLE mk_deals ADD COLUMN next_note TEXT;        -- qué sigue: llamada, reunión, enviar propuesta…
ALTER TABLE mk_deals ADD COLUMN stage_at INTEGER;      -- desde cuándo está en la etapa actual

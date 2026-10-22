-- Nómina: contratistas por prestación de servicios (retención de honorarios) y referencia externa para traer el equipo de una app sin duplicar.
ALTER TABLE nom_employees ADD COLUMN retencion_pct REAL;
ALTER TABLE nom_employees ADD COLUMN ext_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS nom_employees_ref ON nom_employees (business_id, ext_ref) WHERE ext_ref IS NOT NULL;

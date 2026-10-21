-- Embudo por link de rastreo: de qué link llegó cada lead (vistas → interesados → matriculados).
ALTER TABLE mk_contacts ADD COLUMN link_id INTEGER;
CREATE INDEX IF NOT EXISTS mk_contacts_link ON mk_contacts (link_id);

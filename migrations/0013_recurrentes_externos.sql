-- Finanzas 1.10.0: los gastos recurrentes pueden venir de otra app (p. ej. la nómina de Equipo): `ref` los identifica, `tax_id` es la cédula o NIT de a quién se le paga y `url` a dónde se gestiona.
ALTER TABLE fin_recurring ADD COLUMN ref TEXT;
ALTER TABLE fin_recurring ADD COLUMN tax_id TEXT;
ALTER TABLE fin_recurring ADD COLUMN url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_recurring_ref ON fin_recurring (business_id, ref) WHERE ref IS NOT NULL;

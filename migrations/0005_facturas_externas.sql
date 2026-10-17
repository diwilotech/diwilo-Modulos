-- Cuentas de cobro que crean otras apps (p. ej. una por matrícula): se identifican por `ref` y no se duplican.
ALTER TABLE fin_invoices ADD COLUMN ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_invoices_ref ON fin_invoices (business_id, ref);

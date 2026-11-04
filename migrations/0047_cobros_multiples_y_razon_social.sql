-- Varias cuentas de cobro por cotización (quote_id / quote_lines) y razón social (con S.A.S.) en contactos y empresas
ALTER TABLE fin_invoices ADD COLUMN quote_id INTEGER;
ALTER TABLE fin_invoices ADD COLUMN quote_lines TEXT;
ALTER TABLE mk_contacts ADD COLUMN legal_name TEXT;
ALTER TABLE mk_contacts ADD COLUMN tax_id TEXT;
ALTER TABLE pr_projects ADD COLUMN legal_name TEXT;
UPDATE fin_invoices SET quote_id = (SELECT q.id FROM pr_quotes q WHERE q.invoice_id = fin_invoices.id AND q.business_id = fin_invoices.business_id) WHERE quote_id IS NULL;
UPDATE pr_projects SET legal_name = name WHERE legal_name IS NULL;
UPDATE mk_contacts SET legal_name = (SELECT p.legal_name FROM pr_projects p WHERE p.contact_id = mk_contacts.id), tax_id = (SELECT p.tax_id FROM pr_projects p WHERE p.contact_id = mk_contacts.id)
  WHERE id IN (SELECT contact_id FROM pr_projects WHERE contact_id IS NOT NULL) AND legal_name IS NULL;

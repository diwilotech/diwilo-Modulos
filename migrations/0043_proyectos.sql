-- Proyectos: clientes/proyectos y sus cotizaciones. Las cuentas de cobro viven en Finanzas (fin_invoices) y se ligan al proyecto con project_id.
CREATE TABLE IF NOT EXISTS pr_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  client TEXT NOT NULL, tax_id TEXT, client_email TEXT, client_city TEXT,
  status TEXT NOT NULL DEFAULT 'propuesta',        -- propuesta | activo | terminado | cancelado
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pr_projects_business ON pr_projects (business_id, status);
CREATE TABLE IF NOT EXISTS pr_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  project_id INTEGER,
  number TEXT,
  counterparty TEXT NOT NULL, tax_id TEXT, client_email TEXT, client_city TEXT,
  title TEXT, concept TEXT,
  issue_date TEXT NOT NULL, valid_until TEXT,
  items TEXT,                                      -- JSON [{ concepto, detalle?, cantidad, moneda, valor, trm?, total }]
  subtotal INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  conditions TEXT,
  status TEXT NOT NULL DEFAULT 'borrador',         -- borrador | enviada | aprobada | rechazada
  invoice_id INTEGER,                              -- cuenta de cobro creada al aprobarla
  ref TEXT,                                        -- origen externo (p. ej. drive:<id>)
  verify_code TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pr_quotes_business ON pr_quotes (business_id, status, issue_date);
CREATE UNIQUE INDEX IF NOT EXISTS pr_quotes_ref ON pr_quotes (business_id, ref) WHERE ref IS NOT NULL;
ALTER TABLE fin_invoices ADD COLUMN project_id INTEGER;

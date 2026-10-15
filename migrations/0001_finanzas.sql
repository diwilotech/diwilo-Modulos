-- Módulo finanzas (Worker central): business_id = «<app>:<id del negocio>».

-- ---- 0001_base.sql ----
-- Finanzas (igual al Finance Hub de Diwilo, por negocio): centros de costo, cuentas, facturas y cuentas de cobro,
-- ingresos y gastos (COP o USD con TRM), gastos recurrentes, presupuestos, extractos bancarios y datos de facturación.
-- Montos en pesos colombianos (enteros). Fechas 'YYYY-MM-DD' (hora Colombia). created_at/updated_at en milisegundos.

CREATE TABLE IF NOT EXISTS fin_cost_centers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'proyecto',          -- app | cliente | proyecto | departamento
  code TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_cost_centers_business ON fin_cost_centers (business_id, active);

CREATE TABLE IF NOT EXISTS fin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'banco',             -- banco | efectivo | tarjeta | billetera
  bank TEXT, last4 TEXT,
  opening_balance INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_accounts_business ON fin_accounts (business_id);

CREATE TABLE IF NOT EXISTS fin_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'emitida',           -- emitida (por cobrar) | recibida (por pagar)
  number TEXT,
  counterparty TEXT NOT NULL, tax_id TEXT, client_email TEXT, client_city TEXT,
  issue_date TEXT NOT NULL, due_date TEXT,
  concept TEXT, items TEXT,                       -- items: JSON [{ concepto, detalle?, cantidad, moneda, valor, trm?, total }]
  subtotal INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,                -- suma de los movimientos ligados
  status TEXT NOT NULL DEFAULT 'pendiente',       -- pendiente | pagada | anulada (vencida se calcula)
  cost_center_id INTEGER, category TEXT, notes TEXT,
  verify_code TEXT,                               -- código del QR de validación pública
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_invoices_business ON fin_invoices (business_id, kind, status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS fin_invoices_verify ON fin_invoices (verify_code);

CREATE TABLE IF NOT EXISTS fin_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  kind TEXT NOT NULL,                             -- ingreso | gasto
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,                        -- pesos (si es en USD, con la TRM del día)
  currency TEXT NOT NULL DEFAULT 'COP',           -- COP | USD
  amount_usd REAL, fx_rate REAL,
  category TEXT, description TEXT, counterparty TEXT,
  cost_center_id INTEGER, account_id INTEGER, invoice_id INTEGER, recurring_id INTEGER,
  ref TEXT,                                       -- origen externo sin duplicar (p. ej. 'rec:<id>:<fecha>')
  reconciled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_movements_business ON fin_movements (business_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS fin_movements_ref ON fin_movements (business_id, ref);

CREATE TABLE IF NOT EXISTS fin_recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL, vendor TEXT,
  category TEXT NOT NULL DEFAULT 'software',      -- infraestructura | software | api | ia | marketing | otro
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'COP', amount_usd REAL, fx_rate REAL,
  cycle TEXT NOT NULL DEFAULT 'mensual',          -- mensual | anual
  next_date TEXT NOT NULL,
  cost_center_id INTEGER, account_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_recurring_business ON fin_recurring (business_id, active, next_date);

CREATE TABLE IF NOT EXISTS fin_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  month TEXT NOT NULL,                            -- 'YYYY-MM'
  cost_center_id INTEGER, category TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_budgets_business ON fin_budgets (business_id, month);

CREATE TABLE IF NOT EXISTS fin_bank_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  date TEXT NOT NULL, description TEXT, amount INTEGER NOT NULL, ref TEXT,
  movement_id INTEGER,                            -- movimiento con el que se concilió
  imported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_bank_lines_business ON fin_bank_lines (business_id, account_id, movement_id);

CREATE TABLE IF NOT EXISTS fin_billing_profile (
  business_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,                             -- JSON: nombre, documento, banco, Bre-B, firma, consecutivo…
  updated_at INTEGER NOT NULL
);

-- TRM oficial por día (dato público del Banco de la República, igual para todos los negocios: no lleva business_id).
CREATE TABLE IF NOT EXISTS fin_trm (date TEXT PRIMARY KEY, rate REAL NOT NULL);

-- ---- 0002_informes.sql ----
-- Finanzas 1.1.0: informes del analista de finanzas (los escribe el asistente de IA del negocio por MCP).
CREATE TABLE IF NOT EXISTS fin_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  title TEXT NOT NULL, content TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'ia',             -- ia | manual
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin_reports_business ON fin_reports (business_id, created_at);

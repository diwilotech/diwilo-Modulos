-- Recibos de caja: cada pago que se recibe de una cuenta por cobrar (pueden ser varios por cuenta). Numeración propia por negocio (RC-0001…).
-- El pago también queda como ingreso (fin_movements) ligado a la cuenta; `ref` permite que otras apps los creen sin duplicar.
CREATE TABLE IF NOT EXISTS fin_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  number TEXT NOT NULL,
  invoice_id INTEGER,                 -- cuenta por cobrar a la que se aplica (puede no tener)
  movement_id INTEGER,                -- el ingreso que generó
  date TEXT NOT NULL, amount INTEGER NOT NULL,
  method TEXT, account_id INTEGER, counterparty TEXT, concept TEXT, notes TEXT,
  ref TEXT,
  voided INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_receipts_number ON fin_receipts (business_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS fin_receipts_ref ON fin_receipts (business_id, ref);
CREATE INDEX IF NOT EXISTS fin_receipts_invoice ON fin_receipts (business_id, invoice_id);

-- Finanzas 1.8.0: lo que se arma para pagar cada mes (una persona de la nómina o un servicio) con sus ítems; el presupuesto del mes es la suma de estos planes por centro de costo y categoría.
CREATE TABLE IF NOT EXISTS fin_pagos_plan (
  business_id TEXT NOT NULL,
  month TEXT NOT NULL,                 -- 'YYYY-MM'
  tipo TEXT NOT NULL,                  -- nomina | servicios
  key TEXT NOT NULL,                   -- persona ('u:…' | 'p:…'), recurrente ('r:<id>') o servicio suelto ('s:…')
  tercero TEXT, cost_center_id INTEGER, category TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  items TEXT,                          -- JSON [{ concepto, valor }]
  recurring_id INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (business_id, month, tipo, key)
);

-- Nómina Colombia (módulo transversal): empleados, novedades del periodo, parámetros por año, corridas de nómina con sus líneas y liquidaciones de contrato.
CREATE TABLE IF NOT EXISTS nom_employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL, doc_type TEXT NOT NULL DEFAULT 'CC', doc_number TEXT, email TEXT, phone TEXT,
  position TEXT,                                  -- cargo
  contract_type TEXT NOT NULL DEFAULT 'indefinido', -- indefinido | fijo | obra_labor | aprendizaje
  salary_type TEXT NOT NULL DEFAULT 'ordinario',  -- ordinario | integral
  salary INTEGER NOT NULL DEFAULT 0,              -- mensual
  aux_transporte INTEGER NOT NULL DEFAULT 1,      -- recibe auxilio de transporte si gana hasta 2 SMMLV
  arl_risk INTEGER NOT NULL DEFAULT 1,            -- clase de riesgo 1 a 5
  pay_freq TEXT NOT NULL DEFAULT 'mensual',       -- mensual | quincenal
  start_date TEXT NOT NULL, contract_end TEXT,    -- fin del contrato a término fijo
  end_date TEXT,                                  -- retiro
  status TEXT NOT NULL DEFAULT 'activo',          -- activo | retirado
  eps TEXT, afp TEXT, arl TEXT, caja TEXT, cesantias_fund TEXT,
  bank TEXT, account_type TEXT, account_number TEXT,
  cost_center TEXT,                               -- centro de costo en Finanzas (por nombre)
  dependientes INTEGER NOT NULL DEFAULT 0,        -- deducción por dependientes (retención)
  deduc_vivienda INTEGER NOT NULL DEFAULT 0, deduc_prepagada INTEGER NOT NULL DEFAULT 0, -- mensuales (retención)
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nom_employees_business ON nom_employees (business_id, status);

CREATE TABLE IF NOT EXISTS nom_novedades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  period TEXT NOT NULL,                           -- AAAA-MM
  half TEXT NOT NULL DEFAULT 'M',                 -- M (mes) | 1 | 2 (quincena)
  kind TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,               -- horas o días
  amount INTEGER NOT NULL DEFAULT 0,              -- pesos (comisiones, bonos, descuentos)
  note TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nom_novedades_periodo ON nom_novedades (business_id, period, employee_id);

CREATE TABLE IF NOT EXISTS nom_params (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  smmlv INTEGER, aux_transporte INTEGER, uvt INTEGER,
  exonerado INTEGER NOT NULL DEFAULT 1,           -- exonerado de salud, SENA e ICBF (art. 114-1 E.T.)
  horas_mes INTEGER,                              -- divisor de la hora ordinaria (si no, el que fija la ley)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS nom_params_year ON nom_params (business_id, year);

CREATE TABLE IF NOT EXISTS nom_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nomina',            -- nomina | prima | cesantias
  period TEXT NOT NULL,                           -- AAAA-MM (prima: junio o diciembre; cesantías: diciembre)
  half TEXT NOT NULL DEFAULT 'M',
  status TEXT NOT NULL DEFAULT 'borrador',        -- borrador | aprobada | pagada
  devengado INTEGER NOT NULL DEFAULT 0, deducciones INTEGER NOT NULL DEFAULT 0, neto INTEGER NOT NULL DEFAULT 0,
  aportes INTEGER NOT NULL DEFAULT 0, provisiones INTEGER NOT NULL DEFAULT 0, retencion INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT, account_id INTEGER, note TEXT,
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS nom_runs_unica ON nom_runs (business_id, tipo, period, half);

CREATE TABLE IF NOT EXISTS nom_run_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  run_id INTEGER NOT NULL, employee_id INTEGER NOT NULL,
  devengado INTEGER NOT NULL DEFAULT 0, deducciones INTEGER NOT NULL DEFAULT 0, neto INTEGER NOT NULL DEFAULT 0,
  aportes INTEGER NOT NULL DEFAULT 0, provisiones INTEGER NOT NULL DEFAULT 0, retencion INTEGER NOT NULL DEFAULT 0,
  detalle TEXT NOT NULL DEFAULT '{}',             -- JSON con el desglose completo (desprendible)
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nom_run_lines_run ON nom_run_lines (business_id, run_id);

CREATE TABLE IF NOT EXISTS nom_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  end_date TEXT NOT NULL, reason TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  detalle TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'liquidada',       -- liquidada | pagada
  paid_at TEXT, account_id INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nom_settlements_business ON nom_settlements (business_id, employee_id);

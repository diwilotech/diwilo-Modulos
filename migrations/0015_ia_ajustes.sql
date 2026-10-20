-- IA 1.2.0: topes y tasa del dólar por negocio (tokens por día, tokens por ejecución de un agente, dólar en pesos).
CREATE TABLE IF NOT EXISTS ia_ajustes (
  business_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  PRIMARY KEY (business_id, k)
);

-- Paso a paso visible del asistente: mientras trabaja guarda aquí lo que va haciendo y la pantalla lo consulta cada segundo.
CREATE TABLE IF NOT EXISTS ia_progreso (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'trabajando',   -- trabajando | listo | error
  actual TEXT,
  pasos TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ia_progreso_fecha ON ia_progreso (updated_at);

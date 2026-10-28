-- Mensajes 3.6.0: modo administrador por WhatsApp (números autorizados que controlan el sistema desde el celular).
CREATE TABLE IF NOT EXISTS wa_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  numero TEXT NOT NULL,                          -- solo dígitos con indicativo (573001112233)
  nombre TEXT,
  pin_hash TEXT,                                 -- PIN opcional (SHA-256); sin PIN, el número basta
  desbloqueado_hasta INTEGER NOT NULL DEFAULT 0, -- con PIN: hasta cuándo está abierta la sesión
  fallos INTEGER NOT NULL DEFAULT 0, bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (business_id, numero)
);
-- Acciones que el asistente propuso y esperan el «sí» del administrador
CREATE TABLE IF NOT EXISTS wa_admin_pend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL, numero TEXT NOT NULL,
  pasos TEXT NOT NULL,                           -- JSON [{ herramienta, args }]
  expira INTEGER NOT NULL
);
ALTER TABLE wa_conversaciones ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;   -- chat de un administrador (no es un cliente)

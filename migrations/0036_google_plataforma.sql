-- Mensajes 3.7.0: las credenciales de Google son de Diwilo (una sola app OAuth para todos los negocios); cada negocio solo vincula sus cuentas.
CREATE TABLE IF NOT EXISTS wa_google_plataforma (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_id TEXT NOT NULL,
  secreto_cifrado TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO wa_google_plataforma (id, client_id, secreto_cifrado, updated_at)
SELECT 1, client_id, secreto_cifrado, updated_at FROM wa_google WHERE business_id = 'diwilo:diwilo' AND client_id IS NOT NULL AND secreto_cifrado IS NOT NULL;
ALTER TABLE wa_bandejas ADD COLUMN cuenta_google INTEGER;       -- bandeja de correo: cuenta de Google (wa_google_cuentas.id) que envía y lee sus correos
ALTER TABLE wa_bandejas ADD COLUMN autoguardar INTEGER NOT NULL DEFAULT 1;   -- guarda en Marketing a quien escribe cuando el chat trae nombre y teléfono o correo
ALTER TABLE wa_admins ADD COLUMN usuario TEXT;                  -- correo de la persona del equipo a la que pertenece este número

-- Mensajes 3.3.0: varias cuentas de Google por negocio (p. ej. diwilo.tech@gmail.com para el correo y hola@diwilo.com para las citas con Meet).
CREATE TABLE IF NOT EXISTS wa_google_cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  email TEXT NOT NULL,
  refresh_cifrado TEXT NOT NULL,
  scopes TEXT,
  conectado_at INTEGER NOT NULL,
  UNIQUE (business_id, email)
);
ALTER TABLE wa_google ADD COLUMN cuenta_gmail INTEGER;          -- cuenta que envía y lee el correo
ALTER TABLE wa_google ADD COLUMN cuenta_calendario INTEGER;     -- cuenta cuyo Calendar agenda las citas con Meet
INSERT OR IGNORE INTO wa_google_cuentas (business_id, email, refresh_cifrado, scopes, conectado_at)
SELECT business_id, COALESCE(email, 'cuenta'), refresh_cifrado, scopes, COALESCE(conectado_at, updated_at) FROM wa_google WHERE refresh_cifrado IS NOT NULL;
UPDATE wa_google SET cuenta_gmail = (SELECT c.id FROM wa_google_cuentas c WHERE c.business_id = wa_google.business_id ORDER BY c.id LIMIT 1),
  cuenta_calendario = (SELECT c.id FROM wa_google_cuentas c WHERE c.business_id = wa_google.business_id ORDER BY c.id LIMIT 1) WHERE refresh_cifrado IS NOT NULL;

-- Marketing 1.2.0: tarjetas de presentación digitales por negocio (página pública /c/<slug> en el dominio de su app,
-- instalable como app, con vCard). Cada negocio tiene una predeterminada que se crea sola con sus datos.
CREATE TABLE IF NOT EXISTS mk_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, role TEXT, company TEXT, bio TEXT,
  phone TEXT, whatsapp TEXT, email TEXT, website TEXT, instagram TEXT, linkedin TEXT,
  accent TEXT NOT NULL DEFAULT 'violeta',          -- violeta | azul | verde | ambar | rosa
  photo_data TEXT,                                 -- foto (data URL JPEG cuadrada ~30 KB)
  icon_192 TEXT, icon_512 TEXT,                    -- íconos de la app instalable (PNG en data URL)
  predeterminada INTEGER NOT NULL DEFAULT 0,       -- 1 = la del negocio (se crea sola)
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mk_cards_business ON mk_cards (business_id);

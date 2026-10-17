-- Marca e IA 1.2.0: fondo de la marca (blanco, negro o igual que la app) para tarjetas, webs y apps, y logo del negocio para el kit de marca.
-- orgs.modo: modo claro/oscuro de la app del negocio (lo envía cada llamada), para el fondo «igual que mi app».
ALTER TABLE orgs ADD COLUMN modo TEXT;
ALTER TABLE mc_marca ADD COLUMN fondo TEXT NOT NULL DEFAULT 'oscuro';   -- oscuro | claro | app
ALTER TABLE mc_marca ADD COLUMN logo TEXT;                           -- copia del logo (data URL, máx. ~400 KB) para el kit; la app guarda el suyo para su menú

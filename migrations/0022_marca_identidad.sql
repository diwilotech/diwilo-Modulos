-- Marca 2.1.0: identidad del negocio (descripción y lema) y logos por uso (horizontal, vertical, ícono, solo letras, para fondo oscuro).
-- El logo único de siempre (mc_marca.logo) sigue siendo el de la app y el del kit.
ALTER TABLE mc_marca ADD COLUMN descripcion TEXT;   -- qué hace el negocio (máx. 600 letras); la lee la IA y el kit
ALTER TABLE mc_marca ADD COLUMN lema TEXT;          -- frase corta de la marca (máx. 80 letras)
CREATE TABLE IF NOT EXISTS mc_logos (
  business_id TEXT NOT NULL,
  tipo TEXT NOT NULL,                               -- horizontal | vertical | icono | letras | oscuro
  data_url TEXT NOT NULL,                           -- PNG, JPG, WEBP o SVG (máx. ~400 KB)
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (business_id, tipo)
);

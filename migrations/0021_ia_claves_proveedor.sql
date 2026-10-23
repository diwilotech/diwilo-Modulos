-- IA 1.6.0: claves de Claude y Gemini puestas desde Diwilo Admin (varias por proveedor). Van cifradas (AES-GCM) con el secreto CLAVES_KEK.
CREATE TABLE IF NOT EXISTS ia_claves_prov (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor TEXT NOT NULL,
  nombre TEXT NOT NULL,
  prefijo TEXT NOT NULL,
  cifrada TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

-- Documentos del negocio para sus clientes: RUT y certificación bancaria (el archivo vive en R2, MEDIA)
CREATE TABLE IF NOT EXISTS pr_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- rut | banco
  name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, key TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS pr_docs_kind ON pr_docs (business_id, kind);

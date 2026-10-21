-- IA 1.3.0: qué modelo de IA usa la plataforma (lo elige Diwilo Admin): automático, Claude, Gemini o Workers AI, y el modelo de cada uno.
CREATE TABLE IF NOT EXISTS ia_plataforma (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

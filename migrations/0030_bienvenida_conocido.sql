-- Mensajes 2.6.0: saludo para quien ya presentó una solicitud (está en Marketing con ese teléfono).
ALTER TABLE wa_agentes ADD COLUMN bienvenida_conocido TEXT;     -- texto propio; NULL = el predeterminado ({nombre}, {solicitud}, {empresa})
ALTER TABLE wa_agentes ADD COLUMN usar_conocido INTEGER NOT NULL DEFAULT 1;   -- saludar distinto a quien ya está en Marketing

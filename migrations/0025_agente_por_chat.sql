-- Mensajes 2.1.0: el agente se elige por chat (ya no hay un «agente activo» por bandeja), el agente decide qué datos pide al cliente,
-- y aparece el canal «webhook» (web, n8n, otro sistema) con URL de salida opcional.
ALTER TABLE wa_conversaciones ADD COLUMN agente_id INTEGER;     -- NULL = aún sin asignar (se asigna solo al primer agente de la bandeja) · 0 = sin agente
ALTER TABLE wa_agentes ADD COLUMN campos TEXT;                  -- JSON { campos: [correo, telefono, empresa, tipo, ciudad, interes], extras: [preguntas propias] }
ALTER TABLE wa_bandejas ADD COLUMN url_salida TEXT;             -- canal webhook: aquí se entregan las respuestas de la bandeja (https)

-- Los chats que ya existen conservan el agente que respondía en su bandeja
UPDATE wa_conversaciones SET agente_id = (SELECT a.id FROM wa_agentes a WHERE a.business_id = wa_conversaciones.business_id AND a.bandeja_id = wa_conversaciones.bandeja_id AND a.activo = 1 ORDER BY a.id LIMIT 1)
WHERE agente_id IS NULL;

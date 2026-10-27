-- Mensajes 2.2.0: de dónde escribe cada persona (país y dispositivo) y los chats de IA / del sitio pasan a Mensajes.
ALTER TABLE wa_conversaciones ADD COLUMN pais TEXT;             -- ISO de 2 letras (CO, US…): del indicativo del teléfono o de lo que manda la web
ALTER TABLE wa_conversaciones ADD COLUMN dispositivo TEXT;      -- móvil | escritorio (chats web)
ALTER TABLE wa_conversaciones ADD COLUMN pagina TEXT;           -- página desde la que escribió (chats web)
ALTER TABLE wa_bandejas ADD COLUMN ref TEXT;                    -- de dónde viene una bandeja web automática: «ia:<id del chat de IA>» o «sitio» (chat de diwilo.com)
CREATE UNIQUE INDEX IF NOT EXISTS wa_bandejas_ref ON wa_bandejas (business_id, ref) WHERE ref IS NOT NULL;

-- Chats de clientes del módulo IA → una bandeja web por chat (solo negocios que ya tienen Mensajes activo; los demás siguen viéndolos en IA)
INSERT INTO wa_bandejas (business_id, slug, nombre, telefono, phone_number_id, waba_id, verify_token, activo, created_at, updated_at, canal, ref)
SELECT c.business_id, lower(hex(randomblob(12))), 'Chat: ' || c.nombre, '', 'wh_' || lower(hex(randomblob(6))), '', lower(hex(randomblob(16))), 1, c.created_at, c.updated_at, 'webhook', 'ia:' || c.id
FROM ia_chats c JOIN orgs o ON o.id = c.business_id
WHERE o.modulos LIKE '%"whatsapp"%' AND NOT EXISTS (SELECT 1 FROM wa_bandejas b WHERE b.business_id = c.business_id AND b.ref = 'ia:' || c.id);

-- Sus conversaciones: el contacto es el id de sesión del visitante (lo que va después de «<chat>-» en el id de la conversación)
INSERT OR IGNORE INTO wa_conversaciones (business_id, bandeja_id, contacto, nombre, ia_activa, agente_id, contact_id, ultimo_ts, ultimo_texto, ultimo_rol, created_at, pais, dispositivo, pagina)
SELECT v.business_id, b.id, substr(v.id, length(CAST(v.chat_id AS TEXT)) + 2), NULL, 0, 0, v.lead_id, v.last_at,
  substr((SELECT m.contenido FROM ia_mensajes m WHERE m.conversacion_id = v.id ORDER BY m.ts DESC, m.id DESC LIMIT 1), 1, 200),
  (SELECT CASE m.rol WHEN 'user' THEN 'user' ELSE 'assistant' END FROM ia_mensajes m WHERE m.conversacion_id = v.id ORDER BY m.ts DESC, m.id DESC LIMIT 1),
  v.started_at, v.pais, v.dispositivo, v.pagina
FROM ia_conversaciones v JOIN wa_bandejas b ON b.business_id = v.business_id AND b.ref = 'ia:' || v.chat_id;

INSERT OR IGNORE INTO wa_mensajes (business_id, bandeja_id, contacto, ts, rol, contenido, wamid, estado)
SELECT m.business_id, b.id, substr(v.id, length(CAST(v.chat_id AS TEXT)) + 2), m.ts, CASE m.rol WHEN 'user' THEN 'user' ELSE 'assistant' END, m.contenido, 'ia:' || m.id, CASE m.rol WHEN 'user' THEN NULL ELSE 'enviado' END
FROM ia_mensajes m JOIN ia_conversaciones v ON v.id = m.conversacion_id JOIN wa_bandejas b ON b.business_id = v.business_id AND b.ref = 'ia:' || v.chat_id;

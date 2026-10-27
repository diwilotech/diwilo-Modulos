-- Mensajes 2.4.0: chats que necesitan a una persona (el agente no supo responder o piden un asesor) y chat del sitio atendido por un agente.
ALTER TABLE wa_conversaciones ADD COLUMN atencion TEXT;         -- NULL | pide_asesor | no_sabe  (se ve en rojo hasta que una persona responde o lo marca atendido)
ALTER TABLE wa_conversaciones ADD COLUMN atencion_ts INTEGER;
ALTER TABLE wa_agentes ADD COLUMN alerta_asesor INTEGER NOT NULL DEFAULT 1;   -- el agente avisa cuando no sabe o piden un asesor

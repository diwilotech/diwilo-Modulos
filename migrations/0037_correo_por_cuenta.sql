-- Mensajes 3.8.0: la bandeja de correo es una cuenta de Google (recibe todo lo que llega a la cuenta y a sus alias) y responde desde la dirección a la que escribieron.
ALTER TABLE wa_conversaciones ADD COLUMN via_correo TEXT;       -- dirección (la cuenta o un alias) a la que escribió la persona: desde ahí se le responde
ALTER TABLE wa_bandejas ADD COLUMN responder_desde TEXT NOT NULL DEFAULT 'auto';   -- auto = desde la dirección a la que escribieron · cuenta = siempre desde la cuenta

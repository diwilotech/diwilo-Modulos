-- Mensajes 3.0.0: canal de correo (Cloudflare Email Routing → Worker; respuestas por Cloudflare Email Sending).
ALTER TABLE wa_bandejas ADD COLUMN reenviar_a TEXT;             -- canal correo: dirección verificada a la que se sigue reenviando una copia de cada correo
ALTER TABLE wa_conversaciones ADD COLUMN asunto TEXT;           -- canal correo: asunto del hilo
ALTER TABLE wa_conversaciones ADD COLUMN ref_correo TEXT;       -- canal correo: Message-ID del último correo (para responder en el mismo hilo)

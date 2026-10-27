-- Mensajes 2.5.0: mensaje de bienvenida prediseñado por agente y opción de insistir hasta tener los datos del lead.
ALTER TABLE wa_agentes ADD COLUMN bienvenida TEXT;              -- se envía cuando alguien inicia el chat ({nombre} = su nombre)
ALTER TABLE wa_agentes ADD COLUMN insistir INTEGER NOT NULL DEFAULT 1;   -- vuelve a pedir nombre y contacto si la persona no los da

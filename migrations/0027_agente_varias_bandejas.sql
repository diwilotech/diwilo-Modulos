-- Mensajes 2.3.0: un agente puede servir en varias bandejas (lista de ids; vacía = todas).
ALTER TABLE wa_agentes ADD COLUMN bandejas TEXT;                -- JSON [ids de bandeja]; '[]' o NULL = todas las bandejas
UPDATE wa_agentes SET bandejas = CASE WHEN bandeja_id > 0 THEN '[' || bandeja_id || ']' ELSE '[]' END WHERE bandejas IS NULL;

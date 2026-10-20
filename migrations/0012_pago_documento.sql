-- Finanzas 1.9.0: cédula o NIT de a quién se le paga (sale en la lista de Movimientos y en el documento del pago).
ALTER TABLE fin_movements ADD COLUMN tax_id TEXT;
ALTER TABLE fin_pagos_plan ADD COLUMN tax_id TEXT;

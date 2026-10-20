-- Finanzas 1.5.0: archivos de un recibo (p. ej. el comprobante de pago que subió el cliente en la app): JSON [{ nombre, url }] con rutas de la propia app.
ALTER TABLE fin_receipts ADD COLUMN files TEXT;

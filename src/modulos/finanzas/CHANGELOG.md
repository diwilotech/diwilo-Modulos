# Finanzas — cambios

## 1.4.0 · 2026-10-20
- La cuenta de cobro y el recibo de caja usan la marca del negocio (Marca e IA): color principal y sus tonos, tipografía y logo, en lugar de un violeta fijo.
- `POST /api/finanzas/invoices/externo` acepta `items: [{ concepto, detalle?, valor }]` (una línea por cuota, por ejemplo); si no suman el total se usa una sola línea. El recibo también muestra el logo.

## 1.3.1 · 2026-10-17
- Centros de costo: cada uno muestra su total acumulado (ingresos, gastos y resultado, con el número de movimientos) y arriba un resumen de todos los centros y de lo que no tiene centro. `GET /api/finanzas/cost_centers/totales`.

## 1.3.0 · 2026-10-16
- **Recibos de caja**: cada pago de una cuenta por cobrar genera su recibo (RC-0001…), pueden ser varios por cuenta; se ven y se registran desde la cuenta por cobrar y en la vista «Recibos de caja»; se imprimen y se anulan (el ingreso desaparece y la cuenta vuelve a deber). Migración 0006 (`fin_receipts`).
- Las apps los crean con `POST /api/finanzas/receipts/externo` (por `ref`, ligados a su cuenta con `invoice_ref`) y los anulan con `/receipts/externo/void`.
- «Facturas y cartera» pasa a «Cuentas por cobrar y pagar».

## 1.2.0 · 2026-10-16
- Cuentas de cobro desde otras apps: `POST /api/finanzas/invoices/externo` (por `ref`, sin duplicar; se actualiza mientras no esté anulada). Migración 0005 (`fin_invoices.ref`).
- Movimientos externos pueden ligarse a esa cuenta de cobro (`invoice_ref`): al pagarse completa pasa a «pagada». Si se anula el pago (`anula_ref`) deja de contar en la cuenta de cobro.

## 1.1.0 · 2026-10-14
- Igual al Finance Hub de Diwilo en las herramientas de IA: ver centros de costo y cuentas, ver gastos recurrentes, buscar movimientos (por texto, mes, tipo o sin centro de costo), crear centro de costo y cuenta (sin duplicar), editar movimientos, crear gasto recurrente (con cobros ya hechos y en dólares con TRM) y editarlo (llevando el centro de costo a sus cobros).
- Registrar movimiento: centro de costo y cuenta por nombre y sin duplicar. Cuenta de cobro: ciudad, correo, detalle por línea y centro de costo.
- **Informes** del analista de finanzas (Finanzas → Informes): los escribe el asistente de IA del negocio por MCP con los datos del mes.
- La herramienta `finanzas.movimientos` pasa a llamarse `finanzas.buscar_movimientos` (como en Diwilo).
- Migración `0002_informes.sql` (solo agrega la tabla `fin_reports`).

## 1.0.0 · 2026-10-14
- Primera versión publicada: es el **Finance Hub de Diwilo** llevado a las apps, por negocio.
- Resumen del mes (ingresos, gastos, resultado, presupuesto, cartera por antigüedad, flujo de caja real y proyectado, cuentas).
- Ingresos y gastos en COP o USD (TRM oficial del Banco de la República de cada día), con centro de costo, cuenta y factura.
- Facturas por cobrar y por pagar; cuentas de cobro con líneas, consecutivo, valor en letras, firma, llave Bre-B,
  QR para el comprobante y QR de validación pública (`/validar/:código`); registro de cobros y pagos.
- Gastos recurrentes (tarea diaria a las 3:00 a. m.), centros de costo y presupuestos por mes.
- Bancos: cuentas, importación de extractos CSV y conciliación automática y manual.
- Exportación CSV para el contador.
- Herramientas de IA (MCP): resumen del mes, cartera, movimientos, registrar movimiento y crear cuenta de cobro.
- Reemplaza la versión de prueba 0.1.0 (nunca instalada en una app).

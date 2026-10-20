# Finanzas — cambios

## 1.11.0 · 2026-10-23
- **El gasto recurrente tiene un valor total y «Cómo se paga»**: todo de una vez, en 2 quincenas, 4 semanas o 12 meses (migración 0014, `partes`). El formulario pide el total y la tabla muestra «mensual · en 4 semanas». Los de cuotas se pagan con el botón (no se cobran solos).
- **Pagar muestra el valor completo**: si los ítems no llegan al valor del gasto (p. ej. 2.800.000 de 4.000.000), la diferencia sale como una fila para decir qué es, con aviso, y no deja registrar hasta nombrarla. La API acepta `partes` en `recurring/externo`.

## 1.10.4 · 2026-10-23
- **«Cómo se paga» en el diálogo de Pagar**: todo de una vez, o en cuotas semanales (total del mes ÷ 4), quincenales (÷ 2) o mensuales (total del año ÷ 12). Muestra el total y «Este pago · 1 de N». Un gasto propio de Finanzas parte de su valor, no de un plan viejo del mes.

## 1.10.3 · 2026-10-23
- **Los ítems se editan en el mismo diálogo de «Pagar»**: cambiar concepto o valor, agregar y quitar ítems. La app de origen (Equipo) solo los organiza y los trae; lo que cambies aquí queda en el plan del mes (y en su presupuesto). El total y la parte del pago (semanal/quincenal) se recalculan al escribir.

## 1.10.2 · 2026-10-23
- **La nómina semanal o quincenal cubre el mes**: el total de los ítems se divide entre las 4 semanas o las 2 quincenas y cada «Pagar» registra una parte (el diálogo muestra el total del mes y «Este pago · 1 de 4»). Se pueden registrar todas las partes del mes; cada una solo una vez por cobro.
- Se quita el acceso a los ítems de la fila de gastos recurrentes (Finanzas es general; los ítems se arman en la app).

## 1.10.1 · 2026-10-23
- **El pago se hace en Finanzas**: el botón «Pagar» de un gasto recurrente (incluida la nómina) muestra el total con sus ítems (los de la nómina vienen de la app), la fecha y de qué cuentas sale, con «Mitad y mitad» y cuentas extra; queda en Movimientos con su documento. La nómina trae además un acceso a sus ítems (`url`). `#pagar:<id>` abre ese pago directo.

## 1.10.0 · 2026-10-23
- **Finanzas queda general y liviano**: se quitan de la pantalla el editor de pagos del mes y la tabla de nómina (la nómina se maneja en la app, p. ej. Equipo de CD Academia). Siguen en la API (`/pagos-mes`, documento del pago) para que las apps los usen.
- **La nómina es un gasto recurrente más**: tipo **Nómina**, con **nombre, cédula o NIT, valor y ciclo** (mensual, quincenal, semanal), este mes, próximo cobro, centro de costo y estado. Las apps lo crean con `POST /api/finanzas/recurring/externo` (por `ref`); el botón de la fila lleva a la app (`url`) donde se paga. Los recurrentes con `ref` no se cobran solos.
- Ciclos **quincenal** (15 y fin de mes) y **semanal** (cada 7 días) en gastos recurrentes; columna «Cédula o NIT». Migración 0013.

## 1.9.4 · 2026-10-22
- El editor de pagos muestra los **ítems por grupos** (sueldo, clases que dicta, otros ítems; en servicios, lo que se paga) con su subtotal y cuántos tienen valor; los sin valor se ven atenuados.
- En Gastos recurrentes los **Servicios** y la **Nómina** quedan en secciones aparte, cada una con su título.

## 1.9.3 · 2026-10-22
- Tabla «Nómina de <mes>»: se quitan «Pago definido» y «Por pagar este mes»; la columna **Valor** muestra el total del mes y cómo se paga («4 pagos de $500.000 · cada semana», «Faltan 2 de 4»; por clase u hora, las que faltan). La cédula o NIT se pone **desde Equipo** y aquí solo se ve.

## 1.9.2 · 2026-10-22
- En la tabla «Nómina de <mes>» de Gastos recurrentes, el lápiz junto al pago definido de cada persona abre un formulario pequeño para definir cuánto se le paga (por mes, quincena, semana, clase u hora) y su cédula o NIT; Equipo ya no tiene el modal de nómina, solo un botón que lleva aquí.

## 1.9.1 · 2026-10-22
- **Gastos recurrentes** ahora trae la tabla **«Nómina de <mes>»** (persona, cédula o NIT, pago definido, lo que se aproxima a pagar este mes y su estado) con «Armar pago» / «Ver pago». La ventana de pagos queda solo para **editar** el pago (ítems, centro de costo, cédula, cuentas); el botón «Pago de otro servicio» abre uno suelto.
- Arreglo: al agregar o quitar un ítem ya no se borran la cédula o NIT, el proveedor ni el centro de costo escritos.

## 1.9.0 · 2026-10-22
- Al armar un pago se pide la **cédula o NIT** de a quién se le paga (la nómina la trae de Equipo). Queda en cada movimiento (columna en la descripción: «CC/NIT …») y en el pago.
- **Documento del pago**: cada movimiento de «Pagos del mes» tiene un botón con el documento (nombre, cédula o NIT, el **total con sus ítems**, centro de costo y de qué cuentas salió) para imprimir o guardar como PDF, con la marca del negocio y N.º `PG-AAAAMM-…`. `GET /api/finanzas/pagos-mes/documento?tipo=&month=&key=`. Migración 0012.
- Equipo → «Pago» de una persona abre directo Finanzas con su pago listo para armar (`#pagos:<persona>`).

## 1.8.0 · 2026-10-22
- **Pagos del mes por separado**: se arma el pago de UNA persona (nómina) o de UN servicio. Ítems: el sueldo definido en Equipo, las **clases que dicta el profesional** ese mes (cada una con valor opcional: las vacías no cuentan), bonos o lo que se agregue; en servicios, los ítems del recibo.
- El **centro de costo** se escoge en Finanzas al armar el pago. Cada plan suma al **presupuesto del mes** (por centro de costo y categoría); `fin_pagos_plan` (migración 0011).
- **Pagar** (como en Gastos recurrentes): fecha y **de qué cuentas sale**, con «Mitad y mitad» y cuentas extra (p. ej. efectivo + banco); crea un gasto en Movimientos por cuenta y los servicios recurrentes pasan al siguiente cobro. No se paga dos veces el mismo mes.
- Servicios sueltos («Pago de otro servicio») además de los gastos recurrentes. `GET/POST /api/finanzas/pagos-mes`.

## 1.7.0 · 2026-10-21
- (Reemplazado por 1.8.0) **Pagos del mes**: una ventana con «Pago de servicios» y «Pago de nómina». Se lista lo del mes, se marcan los pagados y al guardar: (1) se crea el **presupuesto del mes** por centro de costo y categoría y (2) lo pagado queda como gasto en **Movimientos**.
  - Servicios: los gastos recurrentes que vencen en el mes (valor y proveedor editables); al pagar, pasan al siguiente cobro.
  - Nómina: las personas con pago definido en Equipo (si la app lo tiene), con cantidad (clases, horas…), centro de costo y ítems extra (bonos, auxilios).
  - `GET/POST /api/finanzas/pagos-mes`. Guardar de nuevo no duplica pagos ni presupuesto.

## 1.6.0 · 2026-10-21
- **Gastos recurrentes → Pagar**: cada gasto tiene el botón «Pagar» (destacado cuando vence este mes). Se elige proveedor, fecha, valor y la cuenta de la que sale; el pago queda como gasto en Movimientos (con su proveedor y cuenta) y el gasto pasa al siguiente cobro, sin duplicarse con el cobro automático. `POST /api/finanzas/recurring/:id/pagar`.

## 1.5.2 · 2026-10-21
- Bancos y conciliación: la lista de cuentas vuelve a ser simple (nombre, tipo, banco, saldo inicial y el botón «Conciliar»); sin saldos ni totales.
- «Conciliar» abre una ventana fija (no se cierra sin querer): tocas «Vi el movimiento» en los pagos que ya salieron en el banco, los cambios quedan resaltados «Sin guardar» y el botón «Guardar conciliación» de abajo los concilia; al guardar, los conciliados bajan al final. Opción para ocultar los ya conciliados. La ventana va por meses (flechas y «Este mes»): «Total mes anterior» y «Total este mes» con lo que falta conciliar de cada uno, y un aviso con lo sin conciliar de meses anteriores que se puede ver y conciliar ahí mismo.

## 1.5.1 · 2026-10-21
- **Bancos y conciliación**: la lista de cuentas muestra el «Saldo según registros» (saldo inicial + movimientos de la cuenta) y lo que falta por conciliar, con el total en cuentas arriba.
- Al tocar el banco (o «Conciliar») se abre su conciliación: sus movimientos y pagos con el recibo, el saldo conciliado y el botón «Ya salió en el banco»; debajo, el extracto de esa cuenta. `GET /api/finanzas/accounts/:id/conciliacion`.
- Las líneas del extracto sugieren primero los movimientos de la misma cuenta.

## 1.5.0 · 2026-10-21
- **Movimientos** (antes «Ingresos y gastos»): cada movimiento que viene de un recibo de caja muestra su recibo (PDF) y los archivos que lo acompañan; el recibo suelto se crea desde aquí.
- **Cobros** (antes «Cuentas por cobrar y pagar»): el botón «Ver» abre la cuenta con su PDF, sus pagos, el recibo de cada pago (PDF) y sus archivos (comprobantes); se registra el cobro y se anula un recibo desde ahí. Se quita la vista «Recibos de caja» (la API sigue igual).
- **Gastos recurrentes**: resumen «Este mes», «Pagado» y «Por pagar», y una columna «Este mes» por gasto. `GET /api/finanzas/recurring/estado`.
- Las cuentas de cobro de otras apps (`POST /invoices/externo`) **ya no se reescriben**: quedan como se emitieron aunque la app cambie después sus cuotas; solo se actualizan con `update: true`.
- Los recibos de otras apps traen `files: [{ nombre, url }]` (rutas de la propia app). `GET /api/finanzas/invoices/:id/detalle`. Migración 0010.

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

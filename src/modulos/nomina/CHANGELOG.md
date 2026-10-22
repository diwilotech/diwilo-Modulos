# Nómina — cambios

## 1.3.0 · 2026-10-22
- **Calendario de pagos** (negocio y por empleado): fechas de pago según sea mensual, quincenal o semanal, a quién va cada peso (empleado, EPS, pensión, ARL, caja, SENA, ICBF, DIAN, provisiones), cuánto cuesta cada persona y las obligaciones del mes (PILA, retención, prima, cesantías). Aviso del calendario administrativo de 360 días.
- Pago **semanal** (se liquida por mes y se paga en partes).

## 1.2.0 · 2026-10-22
- **Todo automático:** cada día (y al traer el equipo de una app) la nómina del mes queda en borrador al día y cada contratista por prestación de servicios recibe su **cuenta de cobro** en Finanzas (factura recibida) con cada cargo por separado: honorarios, cada clase o servicio entregado, descuentos y la retención. Mientras no esté pagada se actualiza con lo que se va entregando.
- Al pagar la nómina, los contratistas se pagan contra su cuenta de cobro (no se duplica el gasto) y la retención va a la DIAN.
- Vista **Contratistas** con una tarjeta por persona y su cuenta de cobro; Empleados en tarjetas; resumen renovado. Tipo de documento NIT. Migración `0020_nomina_automatica.sql`.

## 1.1.0 · 2026-10-22
- **Prestación de servicios:** nuevo tipo de contrato para contratistas (docentes por clases, por ejemplo). Cobran honorarios con retención en la fuente (10 % por defecto, ajustable por persona), sin seguridad social, aportes ni prestaciones; el desprendible y el pago a Finanzas funcionan igual.
- **Novedad «Honorarios»** (clases o servicios) y campo de retención de honorarios.
- **Importar el equipo de una app** (`nominaImportar`, migración 0019): crea las personas por referencia sin duplicarlas y deja los honorarios del mes de quienes cobran por clase u hora.

## 1.0.0 · 2026-10-22
- **Módulo nuevo (transversal):** nómina completa para Colombia, conectada con Finanzas.
- Empleados y contratos (indefinido, fijo, obra o labor, aprendizaje; salario ordinario o integral; mensual o quincenal; riesgo ARL; entidades; banco; centro de costo).
- Novedades: horas extras y recargos (jornada de la Ley 2101 y recargo dominical de la Ley 2466), comisiones y bonificaciones salariales y no salariales (regla del 40 %), incapacidades, licencias, vacaciones, ausencias y descuentos.
- Liquidación mensual o por quincenas: auxilio de transporte, IBC con tope y mínimo, salud, pensión, FSP, retención en la fuente (art. 383 E.T.), aportes del empleador con exoneración art. 114-1 y provisiones.
- Prima de servicios (junio y diciembre), cesantías e intereses (diciembre) y liquidación de fin de contrato con indemnización.
- Desprendible de pago imprimible, archivo de pago al banco y resumen de aportes (CSV).
- **Finanzas:** al pagar una corrida se crean los egresos (pago a empleados por centro de costo, seguridad social y parafiscales, retención en la fuente); no se duplican.
- Parámetros oficiales de 2024 a 2026 (SMMLV, auxilio, UVT), ajustables por negocio y año. Herramientas de IA y guía MCP. Migración `0018_nomina.sql`.

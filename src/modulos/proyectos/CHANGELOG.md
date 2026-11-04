# Proyectos — cambios

## 1.0.0 · 2026-11-03
- **Módulo nuevo:** proyectos/clientes, cotizaciones (consecutivo COT-0001, líneas en pesos o dólares, vigencia de 15 días, condiciones) y PDF con tu firma y tus datos de Finanzas (mismo diseño de las cuentas de cobro).
- **Aprobar y cobrar:** una cotización aprobada crea su cuenta de cobro (sin pagar) en Finanzas, ligada al proyecto (`fin_invoices.project_id`); solo una vez.
- **IA:** 9 herramientas (`proyectos.*`): cotizar con un valor o con líneas, listar, cambiar estado, convertir en cuenta de cobro y enlace al PDF. `finanzas.crear_cuenta_cobro` acepta `proyecto_id`.

# Proyectos — cambios

## 1.2.0 — Proyectos = empresas, envío por correo y cuenta de cobro con el diseño nuevo
- Un proyecto es una empresa (solo su nombre), enlazada a su contacto de Marketing (`pr_projects.contact_id`, migración 0045). Editar su NIT, correo o ciudad actualiza sus cotizaciones y cuentas de cobro.
- Pantalla en dos paneles: empresas a la izquierda y, a la derecha, sus cotizaciones con Ver, Cuenta de cobro (modal de líneas) y Enviar.
- Envío por correo desde Mensajes con redacción y enlace público al PDF (`/validar/<código>/documento`).
- Las sugerencias de una cotización salen aparte, sin sumar al total.
- La cuenta de cobro (Finanzas) usa el mismo diseño del PDF. Herramientas de IA nuevas: editar_cotizacion, preparar_correo y enviar_por_correo.

## 1.1.0 — Cotización con diseño de propuesta
- El PDF de la cotización usa un diseño nuevo: encabezado con degradado de la marca, indicadores, secciones, inversión, «sugerido», «lo que necesitamos», condiciones, firma y pie con numeración de páginas.
- `pr_quotes.extra` (JSON, migración 0044) guarda secciones, indicadores, sugerido, necesitamos y plazo; sin él, el PDF se arma solo con el resumen, las líneas y las condiciones.
- La IA puede pasar `incluye`, `necesitamos` y `plazo` al crear la cotización.

## 1.0.0 · 2026-11-03
- **Módulo nuevo:** proyectos/clientes, cotizaciones (consecutivo COT-0001, líneas en pesos o dólares, vigencia de 15 días, condiciones) y PDF con tu firma y tus datos de Finanzas (mismo diseño de las cuentas de cobro).
- **Aprobar y cobrar:** una cotización aprobada crea su cuenta de cobro (sin pagar) en Finanzas, ligada al proyecto (`fin_invoices.project_id`); solo una vez.
- **IA:** 9 herramientas (`proyectos.*`): cotizar con un valor o con líneas, listar, cambiar estado, convertir en cuenta de cobro y enlace al PDF. `finanzas.crear_cuenta_cobro` acepta `proyecto_id`.

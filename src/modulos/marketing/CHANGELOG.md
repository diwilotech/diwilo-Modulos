# Marketing — cambios

## 1.1.0 · 2026-10-14
- Igual al Marketing Hub de Diwilo en todo lo que faltaba:
  - **Revisar sitios de una lista** (blogs de competidores, fuentes): lee su feed RSS o la página y guarda sus últimas publicaciones.
  - Elementos de lista con **feed RSS**; suscripciones con **centro de costo** de Finanzas (si el negocio la usa).
  - Automatizaciones nuevas: **factura vencida** (si usa Finanzas) y **cada lunes**, con la acción **informe del analista de IA**.
  - **Informes**: los escribe el asistente de IA del negocio por MCP (o Workers AI si la app lo tiene) y quedan en Marketing → Informes.
  - 13 herramientas de IA nuevas, las mismas de IA Diwilo: listas (ver, leer, crear, agregar, revisar), automatizaciones (ver, crear), cambiar etapa de un contacto, marcar tarea hecha, crear campaña, datos para el informe, guardar y ver informes. No duplican listas, elementos ni tareas.
- Migración `0002_listas_informes.sql` (solo agrega columnas y la tabla `mk_reports`).

## 1.0.0 · 2026-10-14
- Primera versión: es el **Marketing Hub de Diwilo** llevado a las apps, por negocio.
- Resumen (leads nuevos, embudo, ganado, gasto, costo por lead, ROI, canales, de dónde llegan, tareas, herramientas).
- Clientes y leads con etapas, campaña de origen, último contacto y exportación CSV.
- Oportunidades en tablero (arrastrar entre etapas).
- Campañas con presupuesto y meta de leads, gasto real, y links de rastreo cortos (`/l/:slug`) por plataforma con UTM, clics y QR.
- Tareas con plantillas (varias tareas en secuencia) y automatizaciones: lead nuevo (al instante), lead sin contacto y presupuesto de campaña (cada día).
- Listas (competidores, prospectos, temas…) y suscripciones/herramientas con su costo mensual.
- Herramientas de IA (MCP): resumen, buscar contactos, tareas pendientes, crear contacto y crear tarea.
- Pendiente: campañas por WhatsApp (Evolution API) y correo (SMTP) con enlace de baja y dirección postal.

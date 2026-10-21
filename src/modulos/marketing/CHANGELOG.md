# Marketing — cambios

## 1.6.0 · 2026-10-20
- **Control total por IA**: editar y borrar contactos, tareas, listas y automatizaciones; editar campañas; gasto de campañas; oportunidades del embudo; links de rastreo; herramientas de marketing; revisar listas y ver tarjetas. Cada herramienta llama a la misma ruta de la API (`src/lib/interno.js`).

## 1.5.0 · 2026-10-17
- **Tarjetas en vivo, sin modal:** editar una tarjeta abre el editor en la misma página, con el formulario y la **tarjeta real** a un lado que cambia mientras escribes
  (con el color, el fondo y la letra de la marca). Las tarjetas de la lista también se ven así.
- **Marca muestra la tarjeta del negocio** (la real, no un ejemplo) y los cambios de color, modo, fondo, tipografía y tono se ven en ella al instante; desde ahí se salta a editar sus datos.
- **Nueva tarjeta:** un modal propone como **sugeridos** a los profesionales del equipo que aún no tienen tarjeta (se rellena con sus datos) o una tarjeta en blanco.

## 1.4.0 · 2026-10-17
- **Marca dentro de Tarjetas:** la vista «Tarjetas» pasa a «Tarjetas y marca», con tres partes: Tarjetas, **Marca** (color de la app, modo claro/oscuro, logo, fondo, tipografía y tono)
  y **Usar en otros lados** (kit de marca para webs, apps, chats y agentes). Antes vivía en la pantalla «Marca e IA».
- **Chat de IA en la tarjeta:** cada tarjeta puede mostrar un chat del módulo IA como burbuja (`mk_cards.chat_slug`, migración `0009_ia.sql`).

## 1.3.0 · 2026-10-17
- **Tarjetas con el color de la app:** el color «app» (el predeterminado) sigue al color que el negocio elige en Apariencia y cambia solo
  cuando él cambia; también se pueden elegir los 9 temas completos (antes había 5 colores y el tema se copiaba una sola vez al crear la tarjeta).
- La tarjeta pública usa la tipografía de la marca (módulo Marca e IA). Con Inter queda igual que antes.
- Las tarjetas predeterminadas existentes pasan a «color de la app» (migración `0007_marca.sql`).

## 1.2.0 · 2026-10-15
- **Tarjetas de presentación digitales** (las mismas de Diwilo): página pública `/c/<slug>` en el dominio de cada app, instalable como
  app con su propio ícono, vCard para guardar el contacto, foto, colores, WhatsApp, redes, QR y contador de vistas.
- **Tarjeta del negocio:** se crea sola la primera vez que se abre Marketing → Tarjetas, con el nombre del negocio, el color de su
  tema y el correo del propietario. No se puede borrar (sí editar).
- Migración `0004_tarjetas.sql` (tabla `mk_cards`).

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

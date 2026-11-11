# Marketing — cambios

## 1.11.0 — Disparadores por etapa, motivo de pérdida, informe del pipeline y difusiones
- **Disparadores por etapa** (`mk_pipelines.autos`, migración 0050): al entrar una oportunidad a una etapa (también Ganado y Perdido) se crea una tarea, se deja el próximo seguimiento o se envía una plantilla de WhatsApp al contacto por Mensajes. Se configuran con el rayo de cada etapa en «Pipelines y etapas». Si el WhatsApp no sale, queda una tarea avisando.
- **Motivo de pérdida** (`mk_deals.lost_reason`): la ficha lo pide al marcar Perdida.
- **Informe del pipeline** (`GET /api/marketing/pipelines/:id/informe`, historial en `mk_deal_moves`): cuántas llegaron a cada etapa, qué parte avanza, días promedio en la etapa, dónde se pierden, motivos, tasa de cierre y días para ganar.
- **Difusión** (pantalla nueva, `mk_difusiones` + `mk_difusion_dest`): plantilla aprobada de WhatsApp o correo a un segmento (leads/clientes, origen, etiqueta, campaña, etapa del pipeline, sin contacto hace N días), hasta 2000 contactos, enviada por tandas con avance, pausa y lista de errores. Usa las rutas de envío de Mensajes: respeta a quien pidió no recibir más y deja el mensaje en su chat.
- IA: `marketing.informe_pipeline`, `marketing.listar_difusiones`; `lost_reason` al editar una oportunidad.

## 1.10.0 — Pipelines de oportunidades con etapas propias y seguimiento
- **Pipelines** (`mk_pipelines`, migración 0049): uno o varios por negocio, cada uno con sus etapas en el orden que quieras (crear, renombrar, ordenar y quitar; Ganado y Perdido cierran en todos). El primero es el principal y recibe las oportunidades de antes. Rutas `GET/POST /api/marketing/pipelines`, `PATCH/DELETE /api/marketing/pipelines/:id` (propietario o administrador).
- **Seguimiento de cada oportunidad**: próximo paso con fecha, hora y qué sigue (`next_date`, `next_time`, `next_note`) y desde cuándo está en la etapa (`stage_at`). `GET /api/marketing/seguimientos` las ordena: vencidas, de hoy, sin próximo paso.
- **Pantalla Oportunidades**: tablero por etapa con cantidad y valor, selector de pipeline, periodo y buscador; tarjetas con contacto, valor, próximo seguimiento (rojo si se venció) y días en la etapa; ficha con llamar / WhatsApp / correo al contacto y botones Ganada / Perdida.
- Inicio y la IA proactiva avisan de seguimientos vencidos o de hoy. IA: `marketing.seguimiento_oportunidades`, `listar_pipelines`, `crear_pipeline`, `editar_pipeline`, `borrar_pipeline`; `stage` de una oportunidad ahora es la clave de la etapa.

## 1.9.0 — Ficha 360 del contacto
- Botón «Ficha» en Clientes y leads: oportunidades, cotizaciones y cuentas de cobro (Proyectos/Finanzas), tareas, chats de Mensajes y la historia en línea de tiempo, con totales en juego/cotizado/cobrado/por cobrar.
- Ruta `GET /api/marketing/contacts/:id/ficha`.

## 1.8.0
- Los contactos guardan el **nombre de la empresa** (como la llamas) y su **razón social** con S.A.S. o el tipo que sea, más el NIT. Proyectos usa la razón social en cotizaciones y cuentas de cobro.

## 1.7.0 · 2026-10-20
- **Menos pantallas:** se quitan de la interfaz Tareas y automatizaciones e Informes (la API y las herramientas de IA siguen igual).
- **Embudo por link:** cada link de rastreo es una tarjeta con **Vistas → Interesados → Matriculados**. Los interesados son quienes dejan sus datos en la página de matrícula (`mk_contacts.link_id`, migración 0017); al matricularlos en la app pasan a cliente (RPC `lead` y `matriculado`).
- **Campaña nueva en una academia** nace con su link de rastreo hacia `/matricula` (el destino puede ser una ruta de la app o una dirección https://).

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

# Marca e IA — cambios

## 2.3.0 · 2026-10-26
- **Identidad y Logos juntos**: una sola pestaña con el nombre de la marca, la descripción y el lema, y las 6 tarjetas de logo (el cuadrado de la app —que antes estaba en Color y letra— más horizontal, vertical, solo ícono, solo letras y para fondo oscuro). Cada tarjeta explica para qué sirve y, mientras no se sube el logo, muestra un dibujo de ejemplo de qué va ahí. La pestaña «Logos» desaparece; «Color y letra» ya no pide logo.
- Dentro de Diwilo Admin el logo cuadrado también se puede subir (queda la copia del módulo para el kit).

## 2.2.0 · 2026-10-24
- **Tarjetas y marca salen de Marketing y viven aquí:** la pestaña **Tarjetas** trae la lista, el editor en vivo (foto, color, chat de IA, enlace, QR) y las vistas de cada tarjeta. En Marketing se quitó «Tarjetas y marca»; sus enlaces viejos (`#tarjetas`, `#marca`, `#kit`) llevan a la pantalla Marca.
- **Links de rastreo de las tarjetas:** cada tarjeta lista los links de campaña que llevan a ella (`GET /api/marketing/cards/rastreo`) con sus vistas. Se crean en Marketing → Campañas: al crear un link se puede elegir una tarjeta como destino (`/l/<slug>` → `/c/<tarjeta>`), así se cuentan las vistas por plataforma y la tarjeta suma además su propia vista.
- La pantalla Marca ya no depende de que la app la active: siempre es una pantalla. Los datos, las rutas `/api/marketing/cards` y las páginas públicas `/c/…` no cambian.

## 2.1.0 · 2026-10-23
- **Pantalla propia en el menú** (`/staff/marca.html`): Identidad · Logos · Color y letra · Tarjetas · Usar en otros lados. Cada app la activa con `window.DW_MARCA_PROPIA = 1`;
  las que no, siguen mandando a Marketing → Tarjetas → Marca como antes. La app puede sumar pestañas propias con `window.DwMarcaTabs.push({ id, label, icon, mount(host, { me, can }) })`.
- **Identidad:** descripción de lo que hace el negocio (máx. 600) y lema (máx. 80). `PUT /api/marca { descripcion, lema }`; entran al kit (`identidad`), a la guía de marca y a todos los prompts de la IA («Qué hace el negocio: …»).
- **Logos por uso:** horizontal, vertical, solo ícono, solo letras y para fondo oscuro (`GET /api/marca/logos`, `PUT|DELETE /api/marca/logos/:tipo`). El kit los lista (`logos`) y con `?logo=1` incluye la imagen. El logo único de la app no cambia.
- **Tarjetas:** la pestaña muestra cada tarjeta con su enlace público `/c/<slug>` y sus visitas; las rutas `/c/…`, `/l/…` y el conteo de entradas no cambian y se siguen administrando en Marketing.
- Herramienta de IA nueva `marca.cambiar_identidad`. Migración `0022_marca_identidad.sql` (`mc_marca.descripcion`, `mc_marca.lema`, tabla `mc_logos`).

## 1.3.0 · 2026-10-17
- **Reemplaza a «Configuración» de las apps:** la pantalla trae Marca (color de la app, modo claro/oscuro, logo, fondo, tipografía y tono), Asistente IA
  (plantillas), Conexiones (tokens MCP) y Bitácora. Usa las rutas estándar de la app (`/api/settings/apariencia`, `/api/settings/logo`, `/api/ia/tokens`,
  `/api/settings/bitacora`), así que sirve igual en cualquier app de la Plantilla.
- **Módulo base** (`"base": true`): la app lo mantiene siempre activo, sin depender del plan.
- El color de la marca es siempre el de la app (se elige aquí y la app lo guarda); se quitó el «color propio».
- **Logo:** se sube aquí; la app lo guarda para su menú y el módulo guarda una copia para el kit (`GET|PUT|DELETE /api/marca/logo`, `logo` en el kit con `?logo=1`, y en el RPC `marca()`).
- Migración `0008_marca_fondo.sql` incluye `mc_marca.logo`.

## 1.2.0 · 2026-10-17
- **Fondo de la marca:** negro, blanco o «igual que mi app» (sigue el modo claro/oscuro que el negocio tiene en Apariencia). Por defecto negro, como siempre.
- La tarjeta pública se pinta con ese fondo (versión clara con textos, botones y hoja de instalación adaptados) y el kit de marca trae
  `fondo` y `--marca-fondo-actual` / `--marca-tinta-actual`, que el CSS ya usa en `body`.
- Migración `0008_marca_fondo.sql`: `mc_marca.fondo` y `orgs.modo` (la app envía `business.modo` en cada llamada).

## 1.1.0 · 2026-10-17
- **Paleta de la marca:** varias tonalidades del color (50 a 900, con el 500 como principal), un fondo claro y un fondo oscuro, y colores de texto.
  Se calculan del color principal —el que la app guarda en Apariencia— y no se guardan en el módulo: si la app cambia de color, la paleta cambia sola.
- El kit de marca (`color.paleta` y el CSS con `--marca-50` … `--marca-900`, `--marca-fondo`, `--marca-fondo-oscuro`) y la pestaña Marca muestran la paleta.
- La tarjeta pública usa el fondo oscuro de la paleta (antes un negro fijo).

## 1.0.0 · 2026-10-17
- **Marca del negocio:** color (por defecto «el color de mi app», que sigue a Apariencia; o uno de los 9 temas), tipografía (6 de lista
  cerrada) y tono de conversación (cercano, formal, amable, directo o divertido, con indicaciones propias).
- **Plantillas de la IA:** instrucciones para el chat del negocio (`canal: chat`) y para asistentes externos (`canal: mcp`), con
  plantillas de ejemplo para empezar. `GET /api/marca/ia/contexto?canal=` devuelve el texto que debe recibir la IA (tono + plantillas activas).
- **Tercer canal de plantillas, `agente`:** instrucciones para automatizaciones y agentes de IA (con ejemplos: seguimiento de leads, recordatorios y cobros, publicaciones).
- **Kit de marca** (color con CSS de variables, tipografía con su link de Google Fonts, tono y prompts listos para chat, MCP y agentes) para construir webs, apps, chats o agentes
  que se vean y hablen como el negocio. Cuatro entradas: la pestaña «Usar en otros lados» (copiar o descargar), `GET /api/marca/kit`, la herramienta MCP
  `marca.kit_de_marca` y el RPC `marca(app, businessId)` del Worker (para otro Worker de Diwilo, p. ej. un generador de webs o de agentes).
- **Herramientas de IA (MCP):** `marca.guia_de_marca` y `marca.kit_de_marca` (lectura), `marca.cambiar_tono` y `marca.crear_plantilla` (escritura, admin).
- Las tarjetas de Marketing leen la marca (color y tipografía) con `brandOf()`.
- Migración `0007_marca.sql`: `mc_marca`, `mc_plantillas`, `orgs.tema` y tarjetas predeterminadas con color «de la app».

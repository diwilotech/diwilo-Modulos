# IA (`ai`) — cambios

## 1.6.1 · 2026-10-23
- Las claves de Gemini del formato nuevo de Google (`AQ.…`) también se aceptan, además de las `AIza…`.

## 1.6.0 · 2026-10-23
- **Claves de IA desde Diwilo Admin**: en «Modelo de IA» se pegan las claves de Claude y Gemini, varias por proveedor (la primera es la principal y las otras, respaldo si falla o llega al límite). Se guardan cifradas (AES-GCM) en `ia_claves_prov`; hace falta crear UNA vez el secreto maestro `CLAVES_KEK`. Se pueden probar y quitar una a una. Los secretos `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` de Cloudflare siguen valiendo como última opción. Diwilo Web Admin las pide por `GET /api/ai/proveedor/claves-uso` (solo llamada del sistema, nunca una persona).
- Migración `0021_ia_claves_proveedor.sql`.

## 1.4.3 · 2026-10-23
- **Chat del sitio diwilo.com en Diwilo Admin**: dentro de «Chats y conversaciones» (solo en el panel de Diwilo) vuelven las conversaciones del chat del sitio, con su detalle y borrado, y su configuración (chat activo e instrucciones del asistente). Los datos nunca se borraron: viven en la base del panel.

## 1.4.2 · 2026-10-23
- **IA Diwilo en celulares**: el botón flotante es un círculo con el logo y la ventana sube desde abajo con altura segura (la anterior medía el 100 % con la barra del navegador y el botón de cerrar quedaba oculto). Cierra con un botón de 40 px o tocando fuera; texto de 16 px para que el iPhone no haga zoom.

## 1.4.1 · 2026-10-23
- Las secciones quedan: **Agentes · IA Diwilo · Consumo · Chats y conversaciones · Conexiones y API** (y Modelo de IA solo en Diwilo Admin). Los chats con sus ajustes y sus conversaciones van en el mismo lugar; se quitan Plantillas y Bitácora de esta pantalla.
- Las plantillas para empezar un agente vienen de `GET /api/ai/starters` (antes de la API de Marca, que no existe en todos los contextos y daba «método no permitido»).

## 1.4.0 · 2026-10-23
- **Diseño de «IA» de Diwilo Admin en el módulo** (igual en todas las apps): agentes en tarjetas con icono y chips, plantillas al empezar, IA Diwilo en cuatro tarjetas (abrir, qué puede hacer, modelo, flujos), y Consumo con indicadores, gráfico de 30 días, quién gasta, topes y protecciones.

## 1.3.1 · 2026-10-23
- **Igual que «IA» de Diwilo Admin**: «Ejecutar ahora» de un agente pide un pedido puntual opcional y muestra su paso a paso en vivo (queda al terminar); IA Diwilo muestra «Qué puede hacer» según las herramientas de los módulos activos. La sección **Modelo de IA** aparece dentro de Diwilo Admin (que ahora muestra esta misma página) y las conexiones funcionan sin tokens MCP.

## 1.3.0 · 2026-10-23
- **Funciona con Claude (Anthropic)** además de Gemini y Workers AI, por la API de mensajes (tipo chat; modelo por defecto `claude-sonnet-5-5`). Necesita el secreto `ANTHROPIC_API_KEY`.
- **El modelo lo elige Diwilo Admin** (Integraciones e IA → Modelo de IA) y aplica a todas las apps: automático, Claude, Gemini o Workers AI, y el modelo de cada uno. Se guarda en `ia_plataforma` (migración 0016) y solo responde al negocio de Diwilo (`GET/PUT /api/ai/proveedor`, `POST /api/ai/proveedor/probar`); cualquier otro negocio recibe 403. Si el elegido falla, el respaldo es Gemini o Workers AI (Claude nunca es respaldo). El consumo cuenta a Claude con su propio precio estimado.

## 1.2.0 · 2026-10-23
- **Secciones en el orden de Diwilo Admin**: Agentes · IA Diwilo · Consumo · Conversaciones del chat · Ajustes del chat · Conexiones y API (MCP, claves, webhooks) · Plantillas · Bitácora. Abre en Agentes. Cada conversación se abre en una ventana (modal).
- **Paso a paso visible**: al preguntar, el botón flotante y la sección IA Diwilo muestran en vivo lo que el asistente va haciendo (qué módulo consulta o qué cambia) y la lista queda debajo de la respuesta. Se guarda en `ia_progreso` y la pantalla lo consulta cada segundo (`GET /api/ai/asistente/progreso`).
- **Flujos de trabajo entre módulos** (`src/lib/flujos.js`): lead → cuenta de cobro, cobranza con seguimiento, campaña con la voz de la marca, informe general, chat → contacto, y los de la academia (matricular y cobrar, cartera de estudiantes, clases y reposiciones). Solo salen los que el negocio puede hacer con sus módulos y su rol. Los usan el asistente, los agentes, las sugerencias y `GET /api/ai/guias` (`entre`).
- **Consumo como en «Integraciones e IA» de Diwilo Admin**: tokens de hoy y del mes, costo estimado en pesos y dólares, proyección del mes, cuota gratis de Cloudflare (neuronas), gráfico de 30 días y tabla «Quién gasta este mes» con tokens y costo por origen.
- **Topes por negocio** (los cambia el administrador en Consumo): tokens por día (por defecto 500.000; 0 = sin tope), tokens por ejecución de un agente (100.000) y dólar en pesos. Al llegar al tope diario la IA se pausa y los chats pasan a WhatsApp. Migración 0015 (`ia_ajustes`).
- **Agentes más seguros**: hasta 16 pasos, se detienen y entregan lo que alcanzaron al llegar a su tope de tokens, recortan los resultados viejos para no pagarlos otra vez, no corren dos veces a la vez (409) y las ejecuciones cortadas se cierran solas a los 15 minutos.

## 1.1.1 · 2026-10-20
- Las secciones de IA (Chats, Conversaciones, Asistente, Agentes, Plantillas, Consumo, Conexiones, Bitácora) se muestran como botones pequeños con ícono, como en «Integraciones e IA» de Diwilo Admin; en celular se desplazan de lado.

## 1.1.0 · 2026-10-20
- **Botón flotante «IA Diwilo»** para todas las apps: `/m/iafab.js` (igual al de Diwilo Admin). Cada app lo carga una vez en su panel con `<script src="/m/iafab.js"></script>` después de `shell.js`; usa el asistente del módulo (`/api/ai/asistente`), propone y pide «Confirmar» antes de cambiar datos, y sugiere los flujos de los módulos activos.

## 1.0.0 · 2026-10-17
- **Módulo general de IA** (base: siempre activo). Reúne todo lo de «Integraciones e IA» de Diwilo, por negocio:
  - **Chats de clientes:** varios por negocio, cada uno con su dirección `/chat/<slug>` en el dominio de la app, su saludo, instrucciones, WhatsApp de respaldo,
    webhook y tope diario. Se despliegan en tarjetas, webs y demás con `<script src="/chat/<slug>/widget.js">` o un iframe. Aplican el tono y las plantillas de la marca
    y, si se activa, guardan como lead en Marketing a quien deja sus datos.
  - **Conversaciones** guardadas y consultables; **ajustes** por chat.
  - **Asistente del negocio** (consulta y propone con las herramientas de los módulos activos) y **agentes** (manual, diario o semanal; proponen o ejecutan).
  - **Consumo** con tope diario por negocio (200 llamadas), **plantillas** de IA, **conexiones MCP**, **claves de API** (`/v1/conversaciones`, `/v1/contactos`) y **webhooks**.
  - Herramientas de IA: `ai.ver_chats`, `ai.ver_conversaciones`, `ai.leer_conversacion`, `ai.resumen_uso`, `ai.crear_chat`.
- Modo de prueba sin gastar IA: un mensaje que empieza por «[prueba]» responde sin llamar al modelo.
- Migración `0009_ia.sql`.

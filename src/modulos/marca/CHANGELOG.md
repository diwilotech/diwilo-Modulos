# Marca e IA — cambios

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

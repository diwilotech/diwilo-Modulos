# IA (`ai`) — cambios

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

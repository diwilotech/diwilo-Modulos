# Diwilo Modulos — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
Worker central `diwilo-modulos` con los módulos horizontales (Finanzas, Marketing + Tarjetas y Marca, IA) para todas las apps Diwilo.
- Sin dominio público (`workers_dev: false`). Las apps lo usan por service binding `MODULOS` → entrypoint `Modulos` (RPC).
- D1 `diwilo-modulos-db` (id d4969edc-4280-438f-a19d-e5a1ac07c33c). Assets en `public/` (páginas `/m/<modulo>.{html,js}`).
- Datos por `business_id = "<app>:<negocio>"`. Diwilo propio = `diwilo:diwilo`; Academia = `cdacademia:<id>`.

## Mapa
- `src/index.js` clase `Modulos`: catalog, call(ctx,req), tools, tool, asset, link/click, validar, tarjeta, chat (chats públicos `/chat/…`), apiPublica (`/v1/…`), marca (kit), uso, purge.
- IA (`src/modulos/ai/`): `api.js` (chats, conversaciones, agentes, asistente, uso, claves), `chat.js` (chat público), `agentes.js` (bucle de herramientas), `publica.js` (`/v1`). Motor y tope diario en `src/lib/ia.js` (binding `AI`; Gemini si hay `GEMINI_API_KEY`). Las pruebas NO gastan IA: un mensaje que empieza por `[prueba]` responde sin llamar al modelo, y `[[GUION]]…[[/GUION]]` guioniza a un agente.
- Estándar de IA: `src/lib/guias.js` (guía de módulo v1 desde el bloque `mcp` del manifiesto) + `src/lib/registro.js` (`herramientasDe`, `ejecutarHerramienta`, `ctx.propias` con las herramientas propias de la app). Lo usan el MCP (vía RPC `guias`), el asistente y los agentes del módulo `ai`.
- Módulos BASE (`"base": true`): `marca` (sin pantalla) e `ai`; las apps los mantienen siempre activos.
- `src/lib/contexto.js` (ctx, orgs, permisos tenant/manager, 402 solo lectura), `src/lib/audit.js`.
- `src/modulos/<id>/{api.js, ia.js, modulo.json, CHANGELOG.md}`; Marketing además `tarjeta.js` (HTML público) y `tarjetas.js` (CRUD, predeterminada, publicCard).
- `migrations/000N_*.sql` (solo agregar, nunca editar una ya aplicada).

## Comandos
- `npm test` → debe decir "Todo bien" (usa `../Control de Academia` como app base).
- Publicar: `CI=1 npx wrangler d1 migrations apply diwilo-modulos-db --remote < /dev/null && npx wrangler deploy`.

## Reglas
- Cambios compatibles: agregar rutas/campos opcionales; no renombrar ni borrar lo que una app usa.
- Subir versión en `modulo.json` y anotar en `CHANGELOG.md`.
- Publicar o escribir en producción solo con confirmación del usuario.
- Apps consumidoras: Control de Academia (`src/lib/central.js`), Diwilo Web Admin (`worker/src/central.js`).

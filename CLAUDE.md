# Diwilo Modulos — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
Worker central `diwilo-modulos` con los módulos horizontales (Finanzas, Marketing + Tarjetas y Marca, Nómina Colombia, IA) para todas las apps Diwilo.
- Sin dominio público (`workers_dev: false`). Las apps lo usan por service binding `MODULOS` → entrypoint `Modulos` (RPC).
- D1 `diwilo-modulos-db` (id d4969edc-4280-438f-a19d-e5a1ac07c33c). Assets en `public/` (páginas `/m/<modulo>.{html,js}`).
- Datos por `business_id = "<app>:<negocio>"`. Diwilo propio = `diwilo:diwilo`; Academia = `cdacademia:<id>`.

## Mapa
- `src/index.js` clase `Modulos`: catalog, call(ctx,req), tools, tool, asset, link/click, validar, tarjeta, chat (chats públicos `/chat/…`), apiPublica (`/v1/…`), marca (kit), uso, purge.
- IA (`src/modulos/ai/`): `api.js` (chats, conversaciones, agentes, asistente, uso, claves), `chat.js` (chat público), `agentes.js` (bucle de herramientas), `publica.js` (`/v1`). Motor y tope diario en `src/lib/ia.js` (binding `AI`; Gemini si hay `GEMINI_API_KEY`). Las pruebas NO gastan IA: un mensaje que empieza por `[prueba]` responde sin llamar al modelo, y `[[GUION]]…[[/GUION]]` guioniza a un agente.
- Estándar de IA: `src/lib/guias.js` (guía de módulo v1 desde el bloque `mcp` del manifiesto) + `src/lib/registro.js` (`herramientasDe`, `ejecutarHerramienta`, `ctx.propias` con las herramientas propias de la app). Lo usan el MCP (vía RPC `guias`), el asistente y los agentes del módulo `ai`.
- Control total por IA: `src/modulos/{finanzas,marketing}/control.js` (junto a `ia.js`) llaman a las MISMAS rutas de la API con `llamar()` de `src/lib/interno.js` (mismos permisos, validaciones y bitácora); CRUD con `crudHerramientas`. Herramienta nueva = una línea `herramienta({... ruta: [MÉTODO, '/api/…/:param']})` + guía en `modulo.json`. Fuera de MCP: subir archivos y páginas/PDF.
- Nómina (`src/modulos/nomina/`): `calculo.js` = reglas de Colombia en funciones puras (parámetros por año, IBC, salud/pensión/FSP, retención art. 383, aportes con exoneración, provisiones, prima, cesantías, liquidación final); `api.js` corridas (borrador → aprobada → pagada) y, al pagar, egresos en Finanzas por `ref nomina:run:<id>:…` (SQL directo a `fin_movements`, solo si el negocio tiene Finanzas activo). Parámetros 2024-2026 en `PARAMS_LEY`: revisarlos cada enero.
- Módulos BASE (`"base": true`): `marca` e `ai`; las apps los mantienen siempre activos. `marca` tiene pantalla propia (`/m/marca.{html,js}`: Identidad, Logos, Color y letra, Tarjetas, Kit) en las apps que activan `window.DW_MARCA_PROPIA = 1` y suman pestañas con `window.DwMarcaTabs`; las demás siguen viéndola en Marketing → Tarjetas → Marca. Las tarjetas públicas (`/c/…`) y los links de rastreo (`/l/…`) no se mueven: se administran en Marketing.
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

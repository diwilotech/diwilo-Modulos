# Diwilo Modulos — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
Worker central `diwilo-modulos` con los módulos horizontales (Finanzas, Marketing + Tarjetas, Marca e IA) para todas las apps Diwilo.
- Sin dominio público (`workers_dev: false`). Las apps lo usan por service binding `MODULOS` → entrypoint `Modulos` (RPC).
- D1 `diwilo-modulos-db` (id d4969edc-4280-438f-a19d-e5a1ac07c33c). Assets en `public/` (páginas `/m/<modulo>.{html,js}`).
- Datos por `business_id = "<app>:<negocio>"`. Diwilo propio = `diwilo:diwilo`; Academia = `cdacademia:<id>`.

## Mapa
- `src/index.js` clase `Modulos`: catalog, call(ctx,req), tools, tool, asset, link/click, validar, tarjeta, uso, purge.
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

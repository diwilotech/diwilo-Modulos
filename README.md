# Diwilo Modulos

Worker central de los **módulos horizontales** de Diwilo (Finanzas, Marketing y los que vengan) para **todas las apps**
(CD Academia, CD Citas, CD Nutrición…). Una mejora o un arreglo se publica una vez aquí y llega a todas las apps.

- Worker `diwilo-modulos`, base D1 `diwilo-modulos-db`. **Sin dominio ni workers.dev:** solo lo llaman las apps (y Diwilo Web)
  por service binding con `"entrypoint": "Modulos"` (RPC).
- Los datos de cada negocio van con `business_id = «<app>:<id del negocio>»`: dos apps nunca comparten datos.
- **Las pantallas siguen en cada app** (su shell, su tema, su login). Aquí está el código de cada página (`public/m/<id>.html`
  con su `<main>` y `public/m/<id>.js`); la app lo sirve en `/staff/<id>.html` y `/m/<id>.js`.
- La app verifica sesión, negocio, rol, que el módulo esté activo y CSRF; aquí se revisa el nivel de cada ruta
  (`tenant`/`manager`), la suscripción vencida (solo lectura) y que cada referencia sea del mismo negocio.
- Lo que un módulo registra en la bitácora vuelve a la app y queda en su `audit_log` (con el usuario y si fue la app o la IA).
- Tareas diarias (3:00 a. m. Colombia): gastos recurrentes de Finanzas y automatizaciones de Marketing de todos los negocios.

## Módulos

| Módulo | Versión | Qué hace |
|---|---|---|
| Finanzas (`finanzas`) | 1.1.0 | El Finance Hub de Diwilo por negocio: ingresos y gastos (COP o USD con TRM), cuentas de cobro en PDF con QR de validación, cartera, recurrentes, centros de costo, presupuestos, conciliación, exportación, informes y 15 herramientas de IA. |
| Marketing (`marketing`) | 1.3.0 | El Marketing Hub de Diwilo por negocio: clientes y leads, embudo, campañas con links de rastreo y QR, tareas y automatizaciones, listas con revisión de sitios, informes y 18 herramientas de IA. |
| Marca (`marca`) | 2.0.0 | Servicio de marca del negocio, **sin pantalla propia** (módulo base): color de su app con su paleta, fondo negro/blanco/igual que la app, tipografía, tono, logo, plantillas de IA y kit de marca. Se edita en **Marketing → Tarjetas → Marca**; las tarjetas, los chats y el kit leen de aquí. 3 herramientas de IA. |
| IA (`ai`) | 1.0.0 | **Módulo general de IA** (base; reemplaza a Configuración): chats de clientes públicos (`/chat/<slug>`, burbuja `widget.js` para webs y tarjetas, leads a Marketing, tope diario), conversaciones, asistente del negocio, agentes (propone o ejecuta con las herramientas de los demás módulos), plantillas, consumo (200 llamadas/día por negocio), conexiones MCP, claves de API (`/v1/*`), webhooks y bitácora. 5 herramientas de IA. |

Cada uno tiene su `CHANGELOG.md` en `src/modulos/<id>/`.

## Cómo lo usa una app

1. En `wrangler.jsonc` de la app (ya viene en la Plantilla App Diwilo):
   `"services": [{ "binding": "MODULOS", "service": "diwilo-modulos", "entrypoint": "Modulos" }]` y `"/m/*"` en `run_worker_first`.
2. En `modulos.app.json`: `"centrales": ["finanzas", "marketing"]`. Aparecen en el menú, en el dashboard (widgets), en el MCP
   de la app y en el catálogo que lee Diwilo → Módulos (para planes y excepciones por negocio).
3. Nada más: sin copiar código ni migraciones a la app.

## RPC (`export class Modulos` en `src/index.js`)

| Método | Para qué |
|---|---|
| `catalog()` | Manifiestos (`src/modulos/<id>/modulo.json`): nombre, versión, ícono, menú, permisos, widgets, tablas, dependencias. |
| `call(ctx, { method, path, query, body })` | API `/api/<modulo>/…` → `{ status, headers, body, audit }`. |
| `tools()` · `tool(ctx, name, args)` | Herramientas de IA (las publica el MCP de cada app). |
| `asset(path)` | Código de las páginas (`/m/<id>.html`, `/m/<id>.js`). |
| `link(app, slug)` · `click(app, id)` | Links de rastreo públicos (`/l/:slug` en el dominio de la app). |
| `validar(app, code, origin)` | Validación pública de cuentas de cobro (`/validar/:código` en el dominio de la app). |
| `chat(app, rest, opts)` · `apiPublica(app, clave, path, query)` | Chats de clientes públicos (`/chat/<slug>…`) y API pública con clave (`/v1/…`) en el dominio de la app. |
| `marca(app, businessId)` | Kit de marca del negocio (color, CSS, tipografía, tono y prompts de IA por canal) para otro Worker: un generador de webs o apps, agentes… |
| `uso(app, businessId)` | Registros por módulo (Diwilo avisa antes de quitar un módulo). |
| `purge(app, businessIds)` | Borra los datos de los negocios que la app borró (lo llama Diwilo Web). |

`ctx` = `{ app, business: { id, name, logo, tema, modo }, user: { id, email, name }, role, readOnly, origin, via: 'app'|'mcp', modulos }`.

## Estándar de uso de los módulos por IA (MCP, asistente y agentes)

Un solo estándar para todo lo que use las herramientas de los módulos. Cada módulo declara su bloque `mcp` (guía, ejemplos y flujos) y sus herramientas (`ia.js`);
`src/lib/guias.js` arma de ahí la **guía de módulo v1** y `src/lib/registro.js` el **catálogo único de herramientas** (`herramientasDe`) y su ejecución (`ejecutarHerramienta`).
- **MCP del negocio** (en la app): `GET /api/<módulo>/mcp`, recursos `diwilo://<módulo>/guia` y prompts `<módulo>_<flujo>`; la app pide las guías por RPC `guias(ctx)`.
- **Asistente y agentes** (módulo `ai`): su prompt lleva el resumen de las guías de los módulos que usan, pueden leer la guía completa (acción `guia`), se crean desde un flujo
  (`GET /api/ai/guias`) y usan el mismo catálogo y la misma ejecución que el MCP.
- **Herramientas propias de la app** (Academia: estudiantes, cuotas, cursos…): la app las entrega en `ctx.propias` (manifiestos, catálogo y una función `ejecutar` por RPC) y las
  EJECUTA ELLA con la sesión de quien llamó (mismo rol, módulo activo, solo lectura y bitácora). Solo en llamadas hechas desde la app (asistente y agentes ejecutados a mano):
  los agentes programados (cron) usan únicamente las herramientas centrales.

## Crear un módulo nuevo

1. `src/modulos/<id>/`: `modulo.json` (manifiesto, con `tablas` y el bloque `mcp`: guía de uso, ejemplos y flujos que la app publica en `GET /api/<id>/mcp`, en los recursos `diwilo://<id>/guia` y en los prompts del MCP), `api.js` (`routes(r)` y, si hace falta, `daily(env)`),
   `ia.js` (herramientas), `CHANGELOG.md`. Toda consulta filtra por `c.businessId`.
2. Su migración en `migrations/` (siempre con `business_id`, sin llaves foráneas a tablas de las apps).
3. Su página en `public/m/<id>.html` (empieza con `<main class="dw-main" …>`) y `public/m/<id>.js` (usa `App`, `App.Crud` y el tema de la app).
4. Su línea en `src/modulos/index.js` y sus pruebas en `tests/<id>.test.mjs` (incluida una de aislamiento entre negocios).
5. `npm test` → «Todo bien». Luego publicar y agregarlo a `"centrales"` en las apps que lo usen.

## Probar

`npm install && npm test`: copia la Plantilla App Diwilo a una carpeta temporal, la conecta con este Worker, aplica las
migraciones de las dos bases y corre las pruebas de la app y las de `tests/` de punta a punta.

## Desplegar

1. `npx wrangler d1 create diwilo-modulos-db` y pegar el `database_id` en `wrangler.jsonc`.
2. Repo `diwilotech/diwilo-modulos` conectado a Workers Builds: cada push a `main` aplica las migraciones y despliega.
3. Desplegar **este Worker antes** que las apps que lo usan (su service binding debe existir).

> **Reglas:** Fábrica de Apps Diwilo · **Estado:** Revisión · 2026-10-15

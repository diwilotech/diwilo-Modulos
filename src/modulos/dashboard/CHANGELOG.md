# Dashboard (`dashboard`) — cambios

## 1.3.0 · 2026-10-29
- **«Así funciona tu negocio»:** bloque del Inicio con la figura isométrica de la línea de negocio (educación, propiedad horizontal, servicios), con los números reales de cada etapa, nodos que abren su módulo y paquetes que viajan por la cinta cuando pasa algo (`GET /api/dashboard/figura`, tabla `inicio_eventos`, 30 días, solo el tipo del evento). Código en `/m/inicio.js`; las apps entregan valores propios con `window.DwInicioValores` y anotan movimientos con el RPC `inicioEvento`.
- Migración `0040_inicio_eventos.sql`.

## 1.2.0 · 2026-10-26
- **Apps con varias sedes** (conjuntos, edificios, sucursales; p. ej. Residentes): la app declara `window.DwDashboardAmbito = { etiqueta, plural, items(), actual(), elegir(id) }`. Aparece un selector junto al saludo; sin sede elegida el Inicio es el del **portafolio** (una tarjeta por sede con sus indicadores, más lo de toda la empresa: alertas, Finanzas, Marketing…); con una sede elegida se muestran sus indicadores propios (`mount(host, { me, sede })`). Los módulos centrales son de la empresa, no de cada sede. `ctx.sede` opcional se devuelve en `negocio.sede`.

## 1.1.1 · 2026-10-26
- **Se llama «Inicio»** en todas las apps y en Diwilo Admin.
- Arreglo: `dashboard.js` solo pinta en la pantalla de Inicio (`main[data-modulo=dashboard|inicio]`). Las apps arman todas sus páginas con el mismo shell, y el script pintaba el Inicio encima de Marca y de los demás módulos.

## 1.1.0 · 2026-10-26
- Las apps suman sus propios indicadores con `window.DwDashboard.push({ id, titulo, mount(host, { me }) })` (Academia: métricas, semana y últimos 6 meses). Se muestran entre los indicadores centrales y los accesos directos.

## 1.0.0 · 2026-10-26
- **Módulo base nuevo: el inicio de todas las apps.** `GET /api/dashboard` junta los indicadores (widgets) de los módulos centrales activos, calcula las alertas (tareas vencidas, contactos nuevos, cartera por cobrar y por pagar vencida, tope de IA, marca incompleta, suscripción vencida) y arma los accesos directos.
- Pantalla `/m/dashboard.{html,js}`: saludo con el logo y el nombre de la marca, alertas que se pueden ocultar y llevan a donde se resuelven, indicadores clicables, accesos directos, carga con esqueleto, actualización cada 90 s con la pestaña a la vista, cuadrícula que se adapta a celular y respeta «reducir movimiento».
- Las alertas se mandan a la campana del panel/app (`postMessage {dw:'avisos'}`); los enlaces cambian de pestaña dentro de Diwilo Admin (`{dw:'go'}`).
- Herramienta de IA `dashboard.resumen_del_dia`.
- Las apps suman sus indicadores propios en su Inicio; el módulo solo conoce los centrales.

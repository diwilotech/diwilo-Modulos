# Dashboard (`dashboard`) — cambios

## 1.1.0 · 2026-10-26
- Las apps suman sus propios indicadores con `window.DwDashboard.push({ id, titulo, mount(host, { me }) })` (Academia: métricas, semana y últimos 6 meses). Se muestran entre los indicadores centrales y los accesos directos.

## 1.0.0 · 2026-10-26
- **Módulo base nuevo: el inicio de todas las apps.** `GET /api/dashboard` junta los indicadores (widgets) de los módulos centrales activos, calcula las alertas (tareas vencidas, contactos nuevos, cartera por cobrar y por pagar vencida, tope de IA, marca incompleta, suscripción vencida) y arma los accesos directos.
- Pantalla `/m/dashboard.{html,js}`: saludo con el logo y el nombre de la marca, alertas que se pueden ocultar y llevan a donde se resuelven, indicadores clicables, accesos directos, carga con esqueleto, actualización cada 90 s con la pestaña a la vista, cuadrícula que se adapta a celular y respeta «reducir movimiento».
- Las alertas se mandan a la campana del panel/app (`postMessage {dw:'avisos'}`); los enlaces cambian de pestaña dentro de Diwilo Admin (`{dw:'go'}`).
- Herramienta de IA `dashboard.resumen_del_dia`.
- Las apps suman sus indicadores propios en su Inicio; el módulo solo conoce los centrales.

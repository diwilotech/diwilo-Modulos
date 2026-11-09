# Auditoría de profundidad de los módulos

Estándar: `~/.claude/skills/diwilo-nueva-app/profundidad.md` (7 niveles, 1 punto cada uno). Kit visual: `public/m/dwviz.js`.
Niveles: **T** tablero con KPIs y gráficas · **F** ficha 360 + línea de tiempo · **K** kanban/embudo · **X** acciones entre módulos · **S** salida PDF/CSV · **I** IA que actúa y sugiere · **U** estados vacíos/carga/celular.

Fecha de la auditoría: 2026-11-08 (antes de la oleada 1).

| Módulo | T | F | K | X | S | I | U | Nota | Antes → ahora |
|---|---|---|---|---|---|---|---|---|---|
| Finanzas | ✔ resumen con flujo de caja, presupuesto vs real, cartera (ahora con `dwviz`) | ✘ → **✔ ficha por cliente/proveedor** | ✘ → **✔ tablero de cobros** | ✔ (Proyectos, Nómina) | ✔ PDF + CSV | ✔ | ✔ | 4/7 → 7/7 | 4 → 7 |
| Marketing | ✔ resumen con embudo, canales, ROI | ✘ → **✔ ficha 360 del contacto** | ✔ oportunidades | ✔ (Mensajes, Proyectos) | ✔ CSV | ✔ | ◐ | 5/7 → 6/7 | 5 → 6 |
| Proyectos | ✘ → **✔ tablero** | ✔ ficha de la empresa | ✘ → **✔ embudo de cotizaciones** | ✔ (Finanzas, Mensajes, Marketing) | ✔ PDF | ✔ | ✔ | 4/7 → 7/7 | 4 → 7 |
| Mensajes | ✘ → **✔ tablero** (volumen, tiempos, canales, sin atender) | ◐ chat con datos del contacto | ✘ | ✔ | ✘ | ✔ | ✔ | 3/7 → 4/7 | 3 → 4 |
| Nómina | ◐ resumen + calendario, sin gráficas | ◐ por empleado | ✘ (corridas por estado en lista) | ✔ (Finanzas) | ✔ PDF/CSV | ✔ | ✔ | 4/7 | 4 |
| Marca | ✘ | n/a | n/a | ◐ | ◐ kit | ✔ | ◐ | 2/5 aplicables | 2 |
| IA | ◐ uso y costos | ◐ conversaciones | n/a | ✔ | ✘ | ✔ | ◐ | 3/6 aplicables | 3 |
| Inicio | ✔ módulos + calendario + figura | n/a | n/a | ✔ | n/a | ✔ | ✔ | 4/4 aplicables | 4 |

## Oleadas
1. **Hecha**: kit `dwviz.js`; Proyectos (tablero + embudo); Marketing (ficha 360 del contacto con línea de tiempo).
2. **Hecha**: Finanzas (clientes y proveedores con ficha, tablero de cobros, resumen con `dwviz`); Mensajes (tablero). Falta en Mensajes: kanban de chats por etapa y exportar conversaciones.
3. **Siguiente**: Nómina (gráficas de costo laboral por mes, ficha de empleado con línea de tiempo y kanban de corridas); IA (gráfica de uso y costo por agente).
4. Cada oleada: calificar de nuevo, subir versión y CHANGELOG del módulo, publicar y registrar aquí el antes → ahora.

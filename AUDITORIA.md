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
| Nómina | ✘ → **✔ tablero de costo laboral** | ✘ → **✔ ficha del empleado** | ✘ → **✔ corridas por estado** | ✔ (Finanzas) | ✔ PDF/CSV | ✔ | ✔ | 4/7 → 7/7 | 4 → 7 |
| Marca | ✘ → **✔ resumen** (completitud y tarjetas más vistas) | n/a | n/a | ◐ | ◐ kit | ✔ | ✔ | 2/5 → 4/5 aplicables | 2 → 4 |
| IA | ✘ → **✔ tablero** (costo, agentes, conversaciones) | ◐ conversaciones | n/a | ✔ | ✘ | ✔ | ✔ | 3/6 → 5/6 aplicables | 3 → 5 |
| Inicio | ✔ módulos + calendario + figura | n/a | n/a | ✔ | n/a | ✔ | ✔ | 4/4 aplicables | 4 |

## Oleadas
1. **Hecha**: kit `dwviz.js`; Proyectos (tablero + embudo); Marketing (ficha 360 del contacto con línea de tiempo).
2. **Hecha**: Finanzas (clientes y proveedores con ficha, tablero de cobros, resumen con `dwviz`); Mensajes (tablero). Falta en Mensajes: kanban de chats por etapa y exportar conversaciones.
3. **Hecha**: Nómina, IA y Marca (módulos centrales de Diwilo Modulos, todos con tablero).
4. **Siguiente**: las apps (Control de Academia, Control de Residentes, Diwilo Web Admin): sus módulos propios al mismo estándar.
5. Cada oleada: calificar de nuevo, subir versión y CHANGELOG del módulo, publicar y registrar aquí el antes → ahora.

## Apps (módulos propios) — oleada 4
Las apps usan los módulos centrales de arriba (ya al estándar) y además tienen módulos propios. Estado tras esta oleada:

| App | Qué ya tenía | Qué se sumó |
|---|---|---|
| Control de Academia | Inicio con agentes y gráficas, ficha del estudiante, cartera y mora, calendario | **Tablero** en Estudiantes (recaudo y matrículas de 6 meses, cartera por antigüedad, morosos con acceso a su ficha, `GET /api/academia/tablero`) |
| Control de Residentes | Cartera con antigüedad y recaudo, detalle de unidad, portería con pestañas por estado, reservas con calendario | **PQRS en tablero** (arrastrar cambia el estado, abiertas por categoría, cerradas por semana) e **historia de cada unidad** (pagos, mora, PQRS, solicitudes, reservas) |
| Diwilo Web Admin | Negocios con suscripciones, módulos y pagos; Resumen en vivo del sitio | **Tablero de la plataforma** en Negocios (al día / por vencer / solo lectura, cobrado del mes, negocios por app, próximos vencimientos) |

Pendiente en las apps: kanban de solicitudes de Portería y de matrículas por curso, ficha 360 del estudiante con línea de tiempo, tablero de Mascotas y de Cursos (cupos), y blog/contenido del panel de Diwilo.
Otros repos en la carpeta (Control de Citas, HCosto, Inventario, Nutricion, Pedidos) todavía no están en la arquitectura común (sin páginas `/staff` ni módulos centrales): primero hay que migrarlos y después se les aplica este estándar.

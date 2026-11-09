# Auditoría de profundidad de los módulos

Estándar: `~/.claude/skills/diwilo-nueva-app/profundidad.md` (7 niveles, 1 punto cada uno). Kit visual: `public/m/dwviz.js`.
Niveles: **T** tablero con KPIs y gráficas · **F** ficha 360 + línea de tiempo · **K** kanban/embudo · **X** acciones entre módulos · **S** salida PDF/CSV · **I** IA que actúa y sugiere · **U** estados vacíos/carga/celular.

Fecha de la auditoría: 2026-11-08 (antes de la oleada 1).

| Módulo | T | F | K | X | S | I | U | Nota | Antes → ahora |
|---|---|---|---|---|---|---|---|---|---|
| Finanzas | ✔ resumen con flujo de caja, presupuesto vs real, cartera (ahora con `dwviz`) | ✘ → **✔ ficha por cliente/proveedor** | ✘ → **✔ tablero de cobros** | ✔ (Proyectos, Nómina) | ✔ PDF + CSV | ✔ | ✔ | 4/7 → 7/7 | 4 → 7 |
| Marketing | ✔ resumen con embudo, canales, ROI | ✘ → **✔ ficha 360 del contacto** | ✔ oportunidades | ✔ (Mensajes, Proyectos) | ✔ CSV | ✔ | ◐ | 5/7 → 6/7 | 5 → 6 |
| Proyectos | ✘ → **✔ tablero** | ✔ ficha de la empresa | ✘ → **✔ embudo de cotizaciones** | ✔ (Finanzas, Mensajes, Marketing) | ✔ PDF | ✔ | ✔ | 4/7 → 7/7 | 4 → 7 |
| Mensajes | ✘ → **✔ tablero** (volumen, tiempos, canales, sin atender) | ◐ chat con datos del contacto | ✘ → **✔ embudo de chats** | ✔ | ✘ → **✔ CSV de chats y conversaciones** | ✔ | ✔ | 3/7 → 6/7 | 3 → 6 |
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

Segunda tanda (hecha): **Residentes** → Portería en tablero (solicitudes por estado, arrastrar cambia el estado) y gráficas de Mascotas (especie y vacunación); **Academia** → ficha del estudiante con KPIs e historia en línea de tiempo y «Cursos con más gente» en el tablero.
Tercera tanda (hecha, oleada 5): **Academia** → pestaña «Embudo» de Matrículas (activas · terminadas · retiradas, filtro por curso, arrastrar cambia el estado) y vista «Cupos» en Cursos (campo `cupo`, migración 0023, ocupación por curso, llenos y por llenar); **Web Admin** → Blog con tablero (lo más leído, publicadas por mes, categorías), embudo de entradas (arrastrar publica o vuelve a borrador, `PATCH /admin/api/blog/:id`) y CSV; **Mensajes** → Embudo de chats y exportar a CSV.
Cuarta tanda (oleada 6, 2026-11-08): **Residentes** → Equipo con módulos por persona (`PATCH /api/admin/team/:id`, catálogo asignable, prueba incluida) y Cartera con `dwviz`; la rama `migracion-comun` ya estaba fusionada y publicada.
Pendiente en Residentes: reescribir el interior de unidades/conjuntos/mascotas con los componentes comunes (hoy se ven bien con el tema por CSS) y el portal de propietarios, que usa su propio `app.js`.

### Apps fuera de la arquitectura común: profundidad dentro de su panel actual (oleada 6)
Se les aplicó el estándar SIN migrarlas (la migración cambia URLs, sesiones y portales públicos y exige revisión visual). Cada una lleva su copia de `dwviz.js`.

| App | Se sumó |
|---|---|
| Citas | Flujo con ranking de especialistas, días de la semana, mejores clientes y **embudo de citas** (arrastrar a «Completada»); CSV de citas y clientes |
| Nutrición | **Tablero** (consultas y pacientes nuevos por mes, asistencia, pacientes que llevan 60+ días sin volver, quiénes más han avanzado), **embudo de citas** (`POST /appointments/:id/status`) y CSV de pacientes, consultas y citas |
| Pedidos | Lo que más se vende, horas pico, stock bajo, sin rotación en 30 días y CSV de ventas, inventario y por cobrar |

**Migración a la arquitectura común (pendiente, un proyecto por app).** Nutrición es la más cercana: comparte linaje con Residentes (usuarios globales + `memberships`, `tenantDb`, `authenticate`), así que el delta es mecánico (`modulos.app.json`, `modules.js`, `central.js`, `me.js`, `platform-modules.js`, `mcp.js`, `ia/*`, migración de `business_modules`/`audit_log`/`mcp_tokens`, shell con `panel.html` y páginas en `/staff/*`). El obstáculo es de URLs: hoy `/<slug>` es la tarjeta pública y el panel vive en `/<slug>/admin`, y el portal del paciente en `/<slug>/p/`; el shell común espera el panel en `/<slug>`. Citas tiene usuarios por negocio (no globales) y sesiones propias: migrar implica pasar `users` a global con `memberships`. Pedidos guarda su estado como JSON clave/valor (`estado`) con un dashboard propio: migrar implica modelar tablas reales antes de poder usar los módulos centrales.
**HCosto e Inventario** siguen siendo prototipos de un solo HTML; se construyen como apps nuevas con la skill `diwilo-nueva-app` (la skill pide ficha y plan antes de escribir código).
### Otras apps (no están en la arquitectura común)
- **Citas, Nutrición, Pedidos**: apps funcionales con su propio panel (`/admin`, HTML sueltos), conectadas a Diwilo por RPC pero sin el shell común, sin `/staff/<módulo>.html`, sin módulos centrales (Finanzas, Marketing, Mensajes…) y sin Inicio por módulos. Migrarlas es un proyecto por app (mover sus pantallas al shell, activar módulos centrales, decidir qué hacer con lo que ya duplican: p. ej. inventario y clientes de Pedidos, pacientes y agenda de Nutrición). Después se les aplica el estándar de profundidad.
- **HCosto (Brújula) e Inventario**: prototipos de un solo HTML sin backend; se construyen como apps nuevas con la skill `diwilo-nueva-app`.

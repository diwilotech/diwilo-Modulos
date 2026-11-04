# Proyectos — cambios

## 1.5.1 — Envío desde la dirección del negocio
- El correo sale por defecto desde la bandeja cuya dirección coincide con la de tus datos de cobro (p. ej. hola@), y el modal muestra la dirección de cada bandeja y recuerda la última que usaste.

## 1.5.0 — Varias cuentas de cobro por cotización y razón social
- Una cotización puede tener varias cuentas de cobro (anticipo, saldo…) hasta cubrir su total: se cobran líneas o un valor, y las líneas ya cobradas no se repiten (`fin_invoices.quote_id`, `quote_lines`, migración 0047).
- La empresa guarda su nombre y su razón social con S.A.S.; los PDF usan la razón social. Marketing también la guarda en sus contactos (con NIT).

## 1.4.1 — PDF más compacto
- Cotización y cuenta de cobro con espacios y letras más compactos: la cuenta de cobro cabe en una hoja; la cotización, en una o dos bien repartidas (sin cortar tarjetas ni filas).
- El PDF adjunto al correo sale en una sola hoja si cabe con un ajuste pequeño; si no, en hojas cortadas entre bloques.

## 1.4.0 — Correo con adjuntos y firma corregida
- Al enviar por correo se adjuntan el PDF del documento (armado en el navegador) y, a elección, el RUT y la certificación bancaria. Mensajes acepta `adjuntos` en `/api/whatsapp/correo/enviar` (Gmail multipart y Cloudflare Email).
- La firma de la cuenta de cobro y de la cotización quedaba al lado de la línea: ahora va encima.

## 1.3.0 — RUT y certificación bancaria
- Se suben desde Proyectos → «RUT y certificado bancario» (PDF o imagen, 4 MB; R2, tabla `pr_docs`, migración 0046).
- El enlace público de cada cotización y cuenta de cobro los ofrece para descargar (`/validar/<código>/rut` y `/banco`) y el borrador del correo los menciona.
- Herramienta de IA `proyectos.ver_documentos`.

## 1.2.1 — Pantalla como Mensajes
- Proyectos usa el mismo diseño de Mensajes: empresas a la izquierda, detalle con cotizaciones como tarjetas a la derecha (en celular, lista y detalle con botón volver).
- Si se borra la cuenta de cobro de una cotización, la cotización vuelve a poder cobrarse.

## 1.2.0 — Proyectos = empresas, envío por correo y cuenta de cobro con el diseño nuevo
- Un proyecto es una empresa (solo su nombre), enlazada a su contacto de Marketing (`pr_projects.contact_id`, migración 0045). Editar su NIT, correo o ciudad actualiza sus cotizaciones y cuentas de cobro.
- Pantalla en dos paneles: empresas a la izquierda y, a la derecha, sus cotizaciones con Ver, Cuenta de cobro (modal de líneas) y Enviar.
- Envío por correo desde Mensajes con redacción y enlace público al PDF (`/validar/<código>/documento`).
- Las sugerencias de una cotización salen aparte, sin sumar al total.
- La cuenta de cobro (Finanzas) usa el mismo diseño del PDF. Herramientas de IA nuevas: editar_cotizacion, preparar_correo y enviar_por_correo.

## 1.1.0 — Cotización con diseño de propuesta
- El PDF de la cotización usa un diseño nuevo: encabezado con degradado de la marca, indicadores, secciones, inversión, «sugerido», «lo que necesitamos», condiciones, firma y pie con numeración de páginas.
- `pr_quotes.extra` (JSON, migración 0044) guarda secciones, indicadores, sugerido, necesitamos y plazo; sin él, el PDF se arma solo con el resumen, las líneas y las condiciones.
- La IA puede pasar `incluye`, `necesitamos` y `plazo` al crear la cotización.

## 1.0.0 · 2026-11-03
- **Módulo nuevo:** proyectos/clientes, cotizaciones (consecutivo COT-0001, líneas en pesos o dólares, vigencia de 15 días, condiciones) y PDF con tu firma y tus datos de Finanzas (mismo diseño de las cuentas de cobro).
- **Aprobar y cobrar:** una cotización aprobada crea su cuenta de cobro (sin pagar) en Finanzas, ligada al proyecto (`fin_invoices.project_id`); solo una vez.
- **IA:** 9 herramientas (`proyectos.*`): cotizar con un valor o con líneas, listar, cambiar estado, convertir en cuenta de cobro y enlace al PDF. `finanzas.crear_cuenta_cobro` acepta `proyecto_id`.

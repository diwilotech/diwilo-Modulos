# WhatsApp — cambios

## 2.2.0 · 2026-10-27
- **De dónde escribe cada persona:** en los chats web, país y dispositivo (ej. «CO · escritorio», «US · móvil») y la página; en WhatsApp, el país por el indicativo del teléfono (+57 → CO). Instagram y Messenger no entregan ubicación y quedan sin ella. El webhook acepta `pais`, `dispositivo` (o `ua`) y `pagina`.
- **Pestaña «Todos los mensajes»:** cada mensaje de todos los canales, con búsqueda y filtros por canal y bandeja; al tocar uno se abre su chat. El filtro «Todos» de Chats ahora siempre aparece.
- **Los chats de IA pasan a Mensajes:** las conversaciones de los chats de clientes del módulo IA (y las ya guardadas) se ven y se atienden en Mensajes, en una bandeja web «Chat: <nombre>» por chat. En IA queda solo su configuración, con un enlace a Mensajes (si el negocio no tiene Mensajes, todo sigue como antes).
- **Chat del sitio de diwilo.com:** cada mensaje se registra en Mensajes (bandeja «Chat del sitio»); el chat sigue respondiendo como siempre. Nuevo RPC `mensajesRegistrar(app, negocio, datos)`.
- Migración `0026_mensajes_origen.sql` (país, dispositivo y página por chat; pasa los chats de IA existentes de los negocios con Mensajes).

## 2.1.0 · 2026-10-27
- **El agente se elige por chat:** botón con el nombre del agente en cada chat (en la lista, bajo la hora, y en la cabecera). Se quita el «agente activo» por bandeja de la pestaña Agentes; los chats nuevos empiezan con el primer agente de su bandeja y se puede elegir «Sin agente». Un agente puede servir en una bandeja o en todas (`bandeja_id` 0).
- **Datos que pide el agente:** al crear el agente se marca qué pide además del nombre (correo, teléfono, negocio, persona o negocio, ciudad, qué necesita) y hasta 5 preguntas propias. Se guardan en Marketing (empresa y notas), sin duplicar por teléfono.
- **Canal «Web / Webhook»:** para el chat de tu web, n8n u otro sistema. Se crean las bandejas que se necesiten, cada una con su nombre, URL y token; `POST /wa/<código>?token=…` con `{ contacto, mensaje, nombre?, rol?, id?, responder? }`. Con `responder: true` el agente contesta en la misma llamada; con `rol: "assistant"` se guarda lo que contestó tu propio agente. URL de salida opcional para recibir las respuestas del equipo.
- **Filtros en Chats:** por canal (WhatsApp, Instagram, Messenger, Web) y por bandeja con su nombre.
- Migración `0025_agente_por_chat.sql`. La herramienta de IA `activar_agente` pasa a `asignar_agente_al_chat`.

## 2.0.0 · 2026-10-27
- **El módulo pasa a llamarse «Mensajes»** (conserva el id `whatsapp` y las activaciones): ahora es multicanal, con bandejas de **WhatsApp, Instagram y Messenger**. Los tres usan la misma URL de webhook y token; cada evento se enruta por el ID del número / página / cuenta de Instagram.
- **Chats como WhatsApp Web:** lista de chats a la izquierda (con canal, sin leer y filtro) y la conversación a la derecha; se actualiza sola. En celular se abre uno a la vez.
- **Interruptor de IA por chat**: apaga o enciende al agente en un chat concreto. Cuando una persona responde, la IA se apaga en ese chat.
- **Contactos en Marketing:** el agente pide y guarda los datos de quien quiere compra (nombre, correo, teléfono, interés) como contacto de Marketing, sin duplicar por teléfono; el equipo también puede guardarlos o editarlos desde el chat. Si el negocio no tiene Marketing, el chat funciona igual.
- **Plantillas de WhatsApp:** se envían desde un chat o a varios contactos de Marketing a la vez (hasta 50), con variables y `{nombre}`.
- Nuevas herramientas de IA: cambiar la IA de un chat; las de lectura ahora son por chat.
- Migración `0024_mensajes_canales.sql` (canal en las bandejas, tabla de chats; reparte los chats ya existentes).
- Nota: Instagram y Messenger solo atienden clientes reales cuando Meta aprueba los permisos de la app (`instagram_manage_messages`, `pages_messaging`); antes funcionan con cuentas de prueba.

## 1.1.1 · 2026-10-27
- El verificador ya no usa «hello_world» (Meta solo la deja en números de prueba): fuera de las 24 h manda una plantilla aprobada de la cuenta sin variables; si no hay, explica cómo probar con texto.

## 1.1.0 · 2026-10-27
- El verificador explica cómo corregir el ID de la cuenta equivocado y la falta de acceso del usuario del sistema.
- **Probar conexión** (como el verificador de Chatwoot): comprueba la clave API, el ID del número, que el teléfono coincida y que la cuenta sea dueña del número; con un número de destino manda un mensaje de prueba (plantilla hello_world) y muestra el error exacto de Meta si falla.

## 1.0.0 · 2026-10-27
- Módulo nuevo: bandejas de entrada de WhatsApp (Cloud API de Meta) con nombre, teléfono +57, id del número, id de la cuenta de negocio y clave API (cifrada).
- URL de webhook (`/wa/<slug>` en el dominio de la app) y token de verificación por bandeja; si se guarda el secreto de la app, se valida la firma del webhook.
- Agentes de IA por bandeja, con interruptor activar/desactivar (solo uno responde por bandeja).
- Conversaciones por contacto y respuesta manual del equipo.
- Migración `0023_whatsapp.sql`. La app debe reenviar `/wa/*` al RPC `whatsapp()` (ver README).

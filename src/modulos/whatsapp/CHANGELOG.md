# WhatsApp — cambios

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

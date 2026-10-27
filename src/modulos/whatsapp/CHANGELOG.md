# WhatsApp — cambios

## 1.1.0 · 2026-10-27
- **Probar conexión** (como el verificador de Chatwoot): comprueba la clave API, el ID del número, que el teléfono coincida y que la cuenta sea dueña del número; con un número de destino manda un mensaje de prueba (plantilla hello_world) y muestra el error exacto de Meta si falla.

## 1.0.0 · 2026-10-27
- Módulo nuevo: bandejas de entrada de WhatsApp (Cloud API de Meta) con nombre, teléfono +57, id del número, id de la cuenta de negocio y clave API (cifrada).
- URL de webhook (`/wa/<slug>` en el dominio de la app) y token de verificación por bandeja; si se guarda el secreto de la app, se valida la firma del webhook.
- Agentes de IA por bandeja, con interruptor activar/desactivar (solo uno responde por bandeja).
- Conversaciones por contacto y respuesta manual del equipo.
- Migración `0023_whatsapp.sql`. La app debe reenviar `/wa/*` al RPC `whatsapp()` (ver README).

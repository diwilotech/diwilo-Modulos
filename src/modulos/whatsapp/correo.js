// Canal de correo: Cloudflare Email Routing entrega cada correo a esta función (handler email() del Worker); también lo puede llamar un webhook
// (bandeja de correo + POST /wa/<slug>?token=… con { contacto: <correo>, mensaje, asunto, nombre }). Cada remitente es un chat de la bandeja
// (dirección de correo = bandeja); el asunto y el Message-ID quedan en el chat para responder en el mismo hilo.
// La IA queda apagada en los chats nuevos de correo (el correo trae mucha publicidad y avisos automáticos): se enciende por chat con el interruptor.
import PostalMime from 'postal-mime';
import { one, now } from '../../lib/crud.js';
import { orgUsa } from '../../lib/contexto.js';
import { guardarMensaje, tocarChat, responder } from './webhook.js';
import { sincronizarGmail } from './google.js';

const AUTOMATICO = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce|notifications?@)/i;
const CITA = /^(>|on .{5,80} wrote:|el .{5,80} escribi[oó]:|-{2,}\s*(original message|mensaje original)|de:\s.+@|from:\s.+@)/i;

// Solo lo nuevo del correo: se corta donde empieza la cita de lo anterior
export function soloLoNuevo(texto) {
  const lineas = String(texto || '').replace(/\r/g, '').split('\n'), out = [];
  for (const l of lineas) { if (CITA.test(l.trim())) break; out.push(l); }
  return out.join('\n').trim().slice(0, 4000);
}
const sinHtml = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n');

// Guarda un correo en el chat del remitente de esa bandeja. datos: { de, nombre, asunto, texto, id, ref, ts }
export async function registrarCorreo(env, bandeja, datos, { responderIA = true } = {}) {
  const org = bandeja.business_id, de = String(datos.de || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(de) || de === String(bandeja.phone_number_id).toLowerCase()) return { ok: false, motivo: 'remitente no válido' };
  const asunto = String(datos.asunto || '').trim().slice(0, 200) || '(sin asunto)', cuerpo = soloLoNuevo(datos.texto) || '(sin texto)';
  const previo = await one(env, 'SELECT asunto FROM wa_conversaciones WHERE bandeja_id = ? AND contacto = ?', bandeja.id, de);
  // El asunto se ve en el chat cuando cambia (un tema nuevo); en las respuestas del mismo hilo solo va el texto
  const contenido = !previo || String(previo.asunto || '').replace(/^\s*(re|rv|fwd?):\s*/i, '') !== asunto.replace(/^\s*(re|rv|fwd?):\s*/i, '') ? `Asunto: ${asunto}\n\n${cuerpo}` : cuerpo;
  const ts = Number(datos.ts) || now();
  const nuevo = await guardarMensaje(env, { org, bandeja: bandeja.id, contacto: de, nombre: datos.nombre || null, rol: 'user', contenido, wamid: datos.id ? `mail:${bandeja.id}:${String(datos.id).slice(0, 200)}` : null, ts });
  if (!nuevo) return { ok: true, duplicado: true };
  const conv = await tocarChat(env, { org, bandeja, contacto: de, nombre: datos.nombre ? String(datos.nombre).slice(0, 120) : null, rol: 'user', contenido, ts, leido: false, iaInicial: 0 });
  await env.DB.prepare('UPDATE wa_conversaciones SET asunto = ?, ref_correo = COALESCE(?, ref_correo) WHERE id = ?').bind(asunto, datos.ref ? String(datos.ref).slice(0, 300) : null, conv.id).run();
  conv.asunto = asunto; conv.ref_correo = datos.ref || conv.ref_correo;
  const respuesta = responderIA ? await responder(env, { bandeja, conv }) : null;   // solo si ese chat tiene la IA encendida
  return { ok: true, chat_id: conv.id, respuesta };
}

// Handler email() del Worker: Cloudflare Email Routing entrega aquí los correos de las direcciones cuya regla apunta a este Worker.
// Siempre termina reenviando una copia (a la dirección «reenviar a» de la bandeja o al respaldo) para que ningún correo se pierda.
export async function recibirCorreo(message, env, ctx) {
  const para = String(message.to || '').trim().toLowerCase();
  const bandeja = await one(env, "SELECT * FROM wa_bandejas WHERE canal = 'correo' AND lower(phone_number_id) = ? AND activo = 1", para).catch(() => null);
  const destino = bandeja?.reenviar_a || env.CORREO_RESPALDO || null;
  const reenviar = async () => { if (destino) { try { await message.forward(destino); } catch (e) { console.error('correo reenviar', e.message); } } else message.setReject('Buzón no disponible'); };
  if (!bandeja || !(await orgUsa(env, bandeja.business_id, 'whatsapp').catch(() => false))) { await reenviar(); return; }
  try {
    const raw = await new Response(message.raw).arrayBuffer();
    const p = await PostalMime.parse(raw);
    const h = (n) => String(message.headers.get(n) || '').toLowerCase();
    const de = String(p.from?.address || message.from || '').toLowerCase();
    // Avisos automáticos, listas y rebotes no son conversaciones: se reenvían y no se guardan
    const auto = (h('auto-submitted') && h('auto-submitted') !== 'no') || /bulk|list|junk|auto_reply/.test(h('precedence')) || h('list-id') || h('x-auto-response-suppress') || AUTOMATICO.test(de) || AUTOMATICO.test(String(message.from || ''));
    if (!auto) {
      const texto = p.text || sinHtml(p.html), adj = (p.attachments || []).length;
      await registrarCorreo(env, bandeja, { de, nombre: p.from?.name || null, asunto: p.subject, texto: adj ? `${texto}\n\n[${adj} archivo${adj === 1 ? '' : 's'} adjunto${adj === 1 ? '' : 's'}: ábrelo en el correo original]` : texto, id: p.messageId || message.headers.get('message-id'), ref: p.messageId || message.headers.get('message-id') });
    }
  } catch (e) { console.error('correo recibir', e.message); }
  await reenviar();
}

// Cada 2 minutos: los correos nuevos de Gmail dirigidos a cada bandeja de correo entran como chats (los que ya entraron por Email Routing no se repiten: mismo Message-ID)
export const sincronizarCorreos = (env) => sincronizarGmail(env, (bandeja, datos) => registrarCorreo(env, bandeja, datos));

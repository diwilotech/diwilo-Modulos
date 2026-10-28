// Modo administrador por WhatsApp: los números autorizados (pestaña «Administrador») que escriben a una bandeja de WhatsApp no son clientes: hablan con el asistente
// del negocio, que consulta y controla lo que sus herramientas permiten (chats, contactos, citas, finanzas…) y manda resúmenes. Lo que cambia datos se PROPONE y solo se hace
// cuando el administrador responde «sí». Seguridad: el número (Meta autentica al remitente; valida la firma del webhook con el secreto de la app), PIN opcional con bloqueo
// tras 5 fallos y la confirmación de cada acción.
import { all, one, now } from '../../lib/crud.js';
import { ctxDeOrg } from '../../lib/contexto.js';
import { ejecutarHerramienta } from '../../lib/registro.js';
import { asistente } from '../ai/agentes.js';
import { enviarTexto } from './canales.js';
import { guardarMensaje, tocarChat } from './webhook.js';

export const hashPin = async (org, pin) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${org}|${String(pin).trim()}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const adminDe = (env, org, numero) => one(env, 'SELECT * FROM wa_admins WHERE business_id = ? AND numero = ? AND activo = 1', org, String(numero).replace(/\D/g, ''));

const AYUDA = `*Modo administrador* 🛠️
Escríbeme como a una persona. Ejemplos:
• *resumen* — cómo va el día: chats nuevos, sin responder, en rojo y citas
• ¿Qué chats necesitan un asesor?
• Lee el chat de Ana
• Apaga la IA en el chat de Ana
• Envíale a Ana: "Hola, te llamo en 10 min"
• Cancela la cita de Ana
• ¿Cómo van las ventas del mes? / ¿Cuánto me deben?
Lo que cambia datos o escribe a clientes te lo propongo y lo hago cuando respondas *SÍ* (o *NO* para cancelar).
Comandos: *ayuda* · *salir* (cierra la sesión)`;

const SI = /^\s*(s[ií]|si|ok|dale|confirmo|hazlo|aprobado|listo|adelante)\s*[!.¡]*\s*$/i, NO = /^\s*(no|cancela|cancelar|nada|rechazo|mejor no)\s*[!.¡]*\s*$/i;

export async function procesarAdmin(env, { bandeja, conv, admin, texto }) {
  const org = bandeja.business_id, t = String(texto || '').trim();
  const decir = async (msg) => {
    const r = String(msg).slice(0, 3800), { estado } = await enviarTexto(env, bandeja, conv.contacto, r, { rol: 'assistant' });
    await guardarMensaje(env, { org, bandeja: bandeja.id, contacto: conv.contacto, rol: 'assistant', contenido: r, estado });
    await tocarChat(env, { org, bandeja, contacto: conv.contacto, rol: 'assistant', contenido: r });
  };
  try {
    // PIN: sin sesión abierta, solo se acepta el PIN; 5 fallos bloquean 30 minutos
    if (admin.pin_hash && admin.desbloqueado_hasta < now()) {
      if (admin.bloqueado_hasta > now()) return await decir('🔒 Demasiados intentos. Espera unos minutos.');
      if ((await hashPin(org, t)) === admin.pin_hash) {
        await env.DB.prepare('UPDATE wa_admins SET desbloqueado_hasta = ?, fallos = 0, updated_at = ? WHERE id = ?').bind(now() + 12 * 3600000, now(), admin.id).run();
        return await decir('✅ Modo administrador activado por 12 horas. Escribe *ayuda* para ver qué puedo hacer.');
      }
      const fallos = admin.fallos + 1;
      await env.DB.prepare('UPDATE wa_admins SET fallos = ?, bloqueado_hasta = ?, updated_at = ? WHERE id = ?').bind(fallos >= 5 ? 0 : fallos, fallos >= 5 ? now() + 30 * 60000 : 0, now(), admin.id).run();
      return await decir('🔒 Escribe tu PIN para entrar al modo administrador.');
    }
    if (/^\s*(ayuda|help|men[uú]|\?)\s*$/i.test(t)) return await decir(AYUDA);
    if (/^\s*(salir|bloquear|cerrar sesi[oó]n)\s*$/i.test(t)) {
      await env.DB.batch([env.DB.prepare('UPDATE wa_admins SET desbloqueado_hasta = 0 WHERE id = ?').bind(admin.id), env.DB.prepare('DELETE FROM wa_admin_pend WHERE business_id = ? AND numero = ?').bind(org, admin.numero)]);
      return await decir(admin.pin_hash ? '🔒 Sesión cerrada. Para volver a entrar, escribe tu PIN.' : 'Listo. Sigo aquí cuando me escribas.');
    }
    const ctx = await ctxDeOrg(env, org, { role: 'admin', user: { id: null, email: null, name: `Administrador por WhatsApp${admin.nombre ? ` (${admin.nombre})` : ''}` } });
    if (!ctx) return await decir('No pude abrir el negocio: intenta de nuevo en un momento.');
    // Respuesta a una propuesta pendiente
    const pend = await one(env, 'SELECT * FROM wa_admin_pend WHERE business_id = ? AND numero = ? AND expira > ? ORDER BY id DESC LIMIT 1', org, admin.numero, now());
    if (pend && NO.test(t)) { await env.DB.prepare('DELETE FROM wa_admin_pend WHERE business_id = ? AND numero = ?').bind(org, admin.numero).run(); return await decir('Listo, no hice nada.'); }
    if (pend && SI.test(t)) {
      await env.DB.prepare('DELETE FROM wa_admin_pend WHERE business_id = ? AND numero = ?').bind(org, admin.numero).run();
      const res = [];
      for (const p of JSON.parse(pend.pasos)) { const r = await ejecutarHerramienta(env, ctx, p.herramienta, p.args); res.push(r.ok ? '✅ Hecho' : `⚠️ No se pudo: ${String(r.error || 'error').slice(0, 160)}`); }
      return await decir(res.join('\n'));
    }
    // Pregunta o pedido nuevo: el asistente del negocio (con la conversación reciente como contexto)
    const hist = (await all(env, 'SELECT rol, contenido FROM wa_mensajes WHERE business_id = ? AND bandeja_id = ? AND contacto = ? ORDER BY ts DESC, id DESC LIMIT 10', org, bandeja.id, conv.contacto)).reverse().map((m) => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.contenido }));
    const r = await asistente(env, { org, ctx, mensajes: hist });
    if (r.status !== 200) return await decir(r.error || 'No pude responder: intenta de nuevo.');
    const props = (r.pasos || []).filter((p) => p.estado === 'propuesta').map((p) => ({ herramienta: p.herramienta, args: p.args }));
    await env.DB.prepare('DELETE FROM wa_admin_pend WHERE business_id = ? AND numero = ?').bind(org, admin.numero).run();
    if (props.length) await env.DB.prepare('INSERT INTO wa_admin_pend (business_id, numero, pasos, expira) VALUES (?, ?, ?, ?)').bind(org, admin.numero, JSON.stringify(props), now() + 15 * 60000).run();
    await decir(`${r.respuesta}${props.length ? '\n\n¿Lo hago? Responde *SÍ* o *NO*.' : ''}`);
  } catch (e) {
    console.error('admin whatsapp', e.message);
    await decir(/cuota|tope|IA_CUOTA/i.test(e.message) ? 'La IA llegó a su tope de hoy. Intenta más tarde.' : 'Tuve un problema al consultar. Intenta de nuevo en un momento.').catch(() => {});
  }
}

// Motor de IA de los módulos: llama al modelo (Gemini si hay GEMINI_API_KEY; si no, Workers AI), cuenta el consumo por negocio
// y aplica el tope diario. Todo lo que gasta IA en Diwilo Modulos pasa por llamarIA().
//   Modo de prueba (sin gastar IA): si el mensaje o las instrucciones empiezan por «[prueba]», responde sin llamar al modelo.
//   Con «[[GUION]]salida 1\n---\nsalida 2[[/GUION]]» entrega esas salidas, una por paso (así se prueban los agentes).
import { HttpError } from './http.js';

export const TOPE_DIA = 200;                           // llamadas de IA por negocio y día
export const dayCo = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const MODELO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ---- Proveedor de IA de la plataforma: lo elige Diwilo Admin (tabla ia_plataforma) y aplica a TODAS las apps ----
// 'auto' = como antes (Gemini si hay clave, si no Workers AI). Cada proveedor necesita su secreto: ANTHROPIC_API_KEY, GEMINI_API_KEY o el binding AI.
export const PROVEEDORES = {
  claude: { nombre: 'Claude (Anthropic)', secreto: 'ANTHROPIC_API_KEY', modelo: 'claude-sonnet-5-5', modelos: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] },
  gemini: { nombre: 'Gemini (Google)', secreto: 'GEMINI_API_KEY', modelo: 'gemini-2.5-flash', modelos: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  'workers-ai': { nombre: 'Workers AI (Cloudflare)', secreto: 'binding AI', modelo: MODELO, modelos: [MODELO] },
};
// Claves: las puestas desde Diwilo Admin (tabla ia_claves_prov, cifradas con CLAVES_KEK) van primero y el secreto de Cloudflare queda de última opción
const b64 = (u8) => btoa(String.fromCharCode(...u8)), deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const kek = async (env) => crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.CLAVES_KEK)), 'AES-GCM', false, ['encrypt', 'decrypt']);
export async function cifrarClave(env, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kek(env), new TextEncoder().encode(texto)));
  return b64(new Uint8Array([...iv, ...ct]));
}
export async function descifrarClave(env, t) { const u = deB64(t); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, await kek(env), u.slice(12))); }
export const clavesDe = (env, plat, p) => [...(plat?.claves?.[p] || []).map((k) => k.valor), ...(p === 'claude' ? [env.ANTHROPIC_API_KEY] : p === 'gemini' ? [env.GEMINI_API_KEY] : []).filter(Boolean)];
export const hayProveedor = (env, p, plat) => (p === 'workers-ai' ? !!env.AI : p === 'claude' || p === 'gemini' ? clavesDe(env, plat, p).length > 0 : false);
let cachePlat = { at: 0, v: null };
export async function plataformaIA(env, fresco = false) {
  if (!fresco && cachePlat.v && Date.now() - cachePlat.at < 20000) return cachePlat.v;
  const v = { proveedor: 'auto', modelo_claude: '', modelo_gemini: '', claves: { claude: [], gemini: [], higgsfield: [] } };
  try { for (const r of (await env.DB.prepare('SELECT k, v FROM ia_plataforma').all()).results || []) if (r.k in v && r.k !== 'claves') v[r.k] = r.v; } catch (_) {}
  if (env.CLAVES_KEK) try {
    for (const r of (await env.DB.prepare('SELECT id, proveedor, cifrada FROM ia_claves_prov ORDER BY id').all()).results || [])
      try { if (v.claves[r.proveedor]) v.claves[r.proveedor].push({ id: r.id, valor: await descifrarClave(env, r.cifrada) }); } catch (_) {}
  } catch (_) {}
  cachePlat = { at: Date.now(), v };
  return v;
}
export const olvidarPlataforma = () => { cachePlat = { at: 0, v: null }; };
// Orden en que se intenta: el elegido primero y, si falla, los más baratos como respaldo (Claude nunca es respaldo: cuesta más)
export function ordenIA(env, plat) {
  const base = plat.proveedor === 'claude' ? ['claude', 'gemini', 'workers-ai'] : plat.proveedor === 'gemini' ? ['gemini', 'workers-ai'] : plat.proveedor === 'workers-ai' ? ['workers-ai'] : ['gemini', 'workers-ai'];
  return base.filter((p) => hayProveedor(env, p, plat));
}
export const modeloDe = (env, plat, p) => (p === 'claude' ? plat.modelo_claude || env.CLAUDE_MODEL || PROVEEDORES.claude.modelo : p === 'gemini' ? plat.modelo_gemini || env.GEMINI_MODEL || PROVEEDORES.gemini.modelo : env.AI_MODEL || MODELO);

// Claude por la API de mensajes de Anthropic. Los turnos seguidos del mismo rol se juntan y siempre empieza un turno del usuario.
export async function viaClaude(env, { system, history, maxTokens, temperature, modelo, clave = env.ANTHROPIC_API_KEY }) {
  const msgs = [];
  for (const m of history) { const role = m.role === 'assistant' ? 'assistant' : 'user', c = String(m.content ?? ''); if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n\n${c}`; else msgs.push({ role, content: c }); }
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '.' });
  const pedir = (conTemp) => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system, messages: msgs, ...(conTemp ? { temperature } : {}) }) });
  let r = await pedir(true);
  if (r.status === 400) { const t = await r.clone().text(); if (/temperature/i.test(t)) r = await pedir(false); }
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json(), text = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('Claude no respondió');
  return { text, tin: d.usage?.input_tokens ?? 0, tout: d.usage?.output_tokens ?? 0 };
}

export async function usoDelDia(env, org, day = dayCo()) {
  return (await env.DB.prepare('SELECT COALESCE(SUM(calls), 0) n, COALESCE(SUM(tin), 0) tin, COALESCE(SUM(tout), 0) tout FROM ia_uso WHERE business_id = ? AND day = ?').bind(org, day).first()) || { n: 0, tin: 0, tout: 0 };
}
// Topes y precios (los mismos que en IA Diwilo de Diwilo Admin): tokens por día y por ejecución de un agente, dólar en pesos; el negocio puede cambiarlos.
export const PRECIOS = { claude: { in: 3, out: 15 }, gemini: { in: 0.30, out: 2.50 }, 'workers-ai': { in: 0.29, out: 2.25 } };   // US$ por millón de tokens (estimados)
export const AJUSTES_BASE = { tope_tokens: 500000, tope_ejecucion: 100000, usd_cop: 4000 };
export const NEURONAS_GRATIS = 10000;
export async function ajustesDe(env, org) {
  const s = { ...AJUSTES_BASE };
  try { for (const r of (await env.DB.prepare('SELECT k, v FROM ia_ajustes WHERE business_id = ?').bind(org).all()).results || []) if (r.k in s && Number.isFinite(Number(r.v))) s[r.k] = Number(r.v); } catch (_) {}
  return s;
}
export const costoUsd = (filas) => filas.reduce((t, r) => { const p = PRECIOS[r.proveedor] || { in: 0, out: 0 }; return t + ((r.tin || 0) * p.in + (r.tout || 0) * p.out) / 1e6; }, 0);
// Neuronas de Workers AI (con las que Cloudflare mide su cuota gratis diaria): Llama 3.3 70B ≈ 26.668 por millón leído y 204.805 por millón escrito
export const neuronas = (filas) => Math.round(filas.filter((r) => r.proveedor === 'workers-ai').reduce((t, r) => t + ((r.tin || 0) * 26668 + (r.tout || 0) * 204805) / 1e6, 0));
export async function revisarTope(env, org, limite = TOPE_DIA) {
  const { n, tin, tout } = await usoDelDia(env, org), aj = await ajustesDe(env, org);
  if (aj.tope_tokens > 0 && tin + tout >= aj.tope_tokens) throw new HttpError(429, 'La IA del negocio llegó a su tope de tokens de hoy. Se reanuda mañana o súbelo en IA → Consumo.', 'IA_TOPE');
  if (n >= Math.min(limite || TOPE_DIA, TOPE_DIA)) throw new HttpError(429, 'La IA del negocio llegó a su tope de hoy. Vuelve mañana o continúa por otro medio.', 'IA_TOPE');
}
export async function registrarUso(env, org, { fuente, proveedor, tin = 0, tout = 0 }) {
  await env.DB.prepare(`INSERT INTO ia_uso (business_id, day, fuente, proveedor, calls, tin, tout) VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(business_id, day, fuente, proveedor) DO UPDATE SET calls = calls + 1, tin = tin + excluded.tin, tout = tout + excluded.tout`).bind(org, dayCo(), fuente, proveedor, tin, tout).run();
}

const est = (t) => Math.ceil(String(t || '').length / 4);
export const motor = (env, plat) => (clavesDe(env, plat, 'gemini').length ? 'Gemini' : env.AI ? 'Workers AI' : 'sin configurar');
export async function motorActivo(env) { const plat = await plataformaIA(env), p = ordenIA(env, plat)[0]; return p ? `${PROVEEDORES[p].nombre.split(' ')[0]} · ${modeloDe(env, plat, p)}` : 'sin configurar'; }

// history: [{ role: 'user'|'assistant', content }]. Devuelve el texto.
export async function llamarIA(env, org, system, history, { fuente = 'chat', maxTokens = 500, temperature = 0.5, limite } = {}) {
  await revisarTope(env, org, limite);
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const todo = system + '\n' + history.map((m) => m.content).join('\n');
  if (/^\s*\[prueba\]/.test(lastUser) || /^\s*\[prueba\]/.test(system) || /\[\[GUION\]\]/.test(todo)) {
    const g = /\[\[GUION\]\]([\s\S]*?)\[\[\/GUION\]\]/.exec(todo);
    await registrarUso(env, org, { fuente, proveedor: 'prueba' });
    if (g) { const salidas = g[1].trim().split(/\n---\n/); const paso = history.filter((m) => m.role === 'assistant').length; return (salidas[paso] ?? '{"accion":"fin","respuesta":"Listo."}').trim(); }
    if (/\[\[VER_SISTEMA\]\]/.test(lastUser)) return system;   // solo pruebas: devuelve las instrucciones que recibe el agente
    return `Respuesta de prueba: ${lastUser.replace(/^\s*\[prueba\]\s*/, '')}`;
  }
  const plat = await plataformaIA(env), orden = ordenIA(env, plat);
  for (const p of orden) {
    if (p === 'workers-ai') break;
    for (const clave of clavesDe(env, plat, p)) try {   // varias claves por proveedor: si una falla (límite, revocada) sigue con la siguiente
      if (p === 'claude') {
        const o = await viaClaude(env, { system, history, maxTokens, temperature, modelo: modeloDe(env, plat, 'claude'), clave });
        await registrarUso(env, org, { fuente, proveedor: 'claude', tin: o.tin || est(system), tout: o.tout || est(o.text) }); return o.text;
      }
      const model = modeloDe(env, plat, 'gemini');
      const generationConfig = { maxOutputTokens: maxTokens, temperature };
      if (/flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig }),
      });
      if (r.ok) {
        const d = await r.json(), text = d.candidates?.[0]?.content?.parts?.map((p2) => p2.text).join('').trim(), u = d.usageMetadata || {};
        if (text) { await registrarUso(env, org, { fuente, proveedor: 'gemini', tin: u.promptTokenCount ?? est(system), tout: (u.candidatesTokenCount ?? est(text)) + (u.thoughtsTokenCount || 0) }); return text; }
      }
    } catch (e) { console.error(p, e.message); }
    // si falla seguimos con el siguiente de la lista y, al final, con Workers AI
  }
  if (!env.AI) throw new HttpError(503, 'La IA no está configurada');
  let out;
  try { out = await env.AI.run(env.AI_MODEL || MODELO, { messages: [{ role: 'system', content: system }, ...history], max_tokens: maxTokens, temperature }); }
  catch (e) {
    if (/4006|daily free allocation/i.test(e.message)) throw new HttpError(429, 'La IA de Diwilo llegó a su cuota diaria. Intenta de nuevo más tarde.', 'IA_CUOTA');
    throw e;
  }
  // Workers AI devuelve `response` ya convertido en objeto cuando el modelo contesta un JSON: se vuelve a texto
  const raw = out?.response ?? out?.result?.response ?? '';
  const text = (typeof raw === 'object' && raw !== null ? JSON.stringify(raw) : String(raw)).trim();
  if (!text) throw new HttpError(502, 'La IA no respondió');
  await registrarUso(env, org, { fuente, proveedor: 'workers-ai', tin: out?.usage?.prompt_tokens ?? est(system) + history.reduce((n, m) => n + est(m.content), 0), tout: out?.usage?.completion_tokens ?? est(text) });
  return text;
}

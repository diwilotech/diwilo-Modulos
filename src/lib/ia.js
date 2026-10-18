// Motor de IA de los módulos: llama al modelo (Gemini si hay GEMINI_API_KEY; si no, Workers AI), cuenta el consumo por negocio
// y aplica el tope diario. Todo lo que gasta IA en Diwilo Modulos pasa por llamarIA().
//   Modo de prueba (sin gastar IA): si el mensaje o las instrucciones empiezan por «[prueba]», responde sin llamar al modelo.
//   Con «[[GUION]]salida 1\n---\nsalida 2[[/GUION]]» entrega esas salidas, una por paso (así se prueban los agentes).
import { HttpError } from './http.js';

export const TOPE_DIA = 200;                           // llamadas de IA por negocio y día
export const dayCo = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const MODELO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export async function usoDelDia(env, org, day = dayCo()) {
  return (await env.DB.prepare('SELECT COALESCE(SUM(calls), 0) n, COALESCE(SUM(tin), 0) tin, COALESCE(SUM(tout), 0) tout FROM ia_uso WHERE business_id = ? AND day = ?').bind(org, day).first()) || { n: 0, tin: 0, tout: 0 };
}
export async function revisarTope(env, org, limite = TOPE_DIA) {
  const { n } = await usoDelDia(env, org);
  if (n >= Math.min(limite || TOPE_DIA, TOPE_DIA)) throw new HttpError(429, 'La IA del negocio llegó a su tope de hoy. Vuelve mañana o continúa por otro medio.', 'IA_TOPE');
}
export async function registrarUso(env, org, { fuente, proveedor, tin = 0, tout = 0 }) {
  await env.DB.prepare(`INSERT INTO ia_uso (business_id, day, fuente, proveedor, calls, tin, tout) VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(business_id, day, fuente, proveedor) DO UPDATE SET calls = calls + 1, tin = tin + excluded.tin, tout = tout + excluded.tout`).bind(org, dayCo(), fuente, proveedor, tin, tout).run();
}

const est = (t) => Math.ceil(String(t || '').length / 4);
export const motor = (env) => (env.GEMINI_API_KEY ? 'Gemini' : env.AI ? 'Workers AI' : 'sin configurar');

// history: [{ role: 'user'|'assistant', content }]. Devuelve el texto.
export async function llamarIA(env, org, system, history, { fuente = 'chat', maxTokens = 500, temperature = 0.5, limite } = {}) {
  await revisarTope(env, org, limite);
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const todo = system + '\n' + history.map((m) => m.content).join('\n');
  if (/^\s*\[prueba\]/.test(lastUser) || /^\s*\[prueba\]/.test(system) || /\[\[GUION\]\]/.test(todo)) {
    const g = /\[\[GUION\]\]([\s\S]*?)\[\[\/GUION\]\]/.exec(todo);
    await registrarUso(env, org, { fuente, proveedor: 'prueba' });
    if (g) { const salidas = g[1].trim().split(/\n---\n/); const paso = history.filter((m) => m.role === 'assistant').length; return (salidas[paso] ?? '{"accion":"fin","respuesta":"Listo."}').trim(); }
    return `Respuesta de prueba: ${lastUser.replace(/^\s*\[prueba\]\s*/, '')}`;
  }
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const generationConfig = { maxOutputTokens: maxTokens, temperature };
    if (/flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig }),
      });
      if (r.ok) {
        const d = await r.json(), text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim(), u = d.usageMetadata || {};
        if (text) { await registrarUso(env, org, { fuente, proveedor: 'gemini', tin: u.promptTokenCount ?? est(system), tout: (u.candidatesTokenCount ?? est(text)) + (u.thoughtsTokenCount || 0) }); return text; }
      }
    } catch (e) { console.error('gemini', e.message); }
    // si Gemini falla seguimos con Workers AI
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

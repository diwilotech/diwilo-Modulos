// Marketing (Marketing Hub de Diwilo, por negocio). Ver: todo el equipo; borrar: propietario y administrador.
//   CRUD   /api/marketing/{contacts|deals|campaigns|spend|tasks|automations|lists|list_items|tools}
//   GET    /api/marketing/summary?from=&to=             leads, embudo, campañas (gasto, costo por lead, ROI, clics), tareas
//   GET    /api/marketing/resumen                       widget del dashboard
//   GET    /api/marketing/campaigns/:id/links           links de rastreo de la campaña · POST { platform, target }
//   DELETE /api/marketing/links/:id
//   POST   /api/marketing/lists/:id/check               revisa los sitios o feeds de una lista (p. ej. blogs de competidores)
//   CRUD   /api/marketing/reports                       informes del analista (los escribe el asistente de IA del negocio por MCP)
//   GET    /api/marketing/reports/datos                 datos del periodo para escribir un informe
//   CRUD   /api/marketing/cards                         tarjetas de presentación (tarjetas.js; la del negocio se crea sola)
//   /l/:slug (público, en el dominio de cada app): link() y click() de src/index.js
// Automatizaciones: «llega un lead nuevo» corre al instante; «sin contacto», «presupuesto de campaña», «factura vencida»
// (si el negocio usa Finanzas) y «semanal» (lunes), cada día (daily). «informe_ia» deja la tarea de pedir el informe al
// asistente o, si la app tiene Workers AI (binding AI), lo escribe solo.
import { json, readJson, HttpError } from '../../lib/http.js';
import { crud, today, now, addDays, all, one, DATE } from '../../lib/crud.js';
import { audit } from '../../lib/audit.js';
import { readFeed } from './web.js';
import { orgUsa } from '../../lib/contexto.js';
import { CARD_ENTITY, cardRoutes } from './tarjetas.js';

const MOD = 'marketing';
const B = '/api/marketing';
export const STAGES_CONTACT = ['lead', 'cliente', 'perdido'];
export const STAGES_DEAL = ['nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'];

const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
// utm_campaign único dentro del negocio (los links de rastreo y los leads se asocian por él).
async function uniqueUtm(c, wanted, exceptId = 0) {
  const base = slugify(wanted) || 'campana';
  for (let i = 1; i < 50; i++) {
    const u = i === 1 ? base : `${base}-${i}`;
    if (!(await one(c.env, 'SELECT 1 FROM mk_campaigns WHERE business_id = ? AND utm_campaign = ? AND id <> ?', c.businessId, u, exceptId))) return u;
  }
  return `${base}-${Date.now().toString(36)}`;
}
// Plataforma -> nombre, utm_source, utm_medium
export const PLATFORMS = {
  instagram: ['Instagram', 'instagram', 'social'], facebook: ['Facebook', 'facebook', 'social'], tiktok: ['TikTok', 'tiktok', 'social'],
  whatsapp: ['WhatsApp', 'whatsapp', 'mensajeria'], google: ['Google Ads', 'google', 'cpc'], youtube: ['YouTube', 'youtube', 'video'],
  linkedin: ['LinkedIn', 'linkedin', 'social'], correo: ['Correo', 'email', 'email'], qr: ['QR impreso', 'qr', 'offline'], otro: ['Otro', 'otro', 'referido'],
};

/* ---------------- automatizaciones ---------------- */
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
function stepsOf(a, fallback) {
  try { const v = JSON.parse(a.task_title); if (Array.isArray(v) && v.length) return v.slice(0, 20).map((x) => ({ t: String(x.t || '').slice(0, 300), d: Math.max(0, Math.min(365, Number(x.d) || 0)) })).filter((x) => x.t); } catch {}
  return [{ t: a.task_title || fallback, d: a.trigger === 'lead_nuevo' ? a.days || 0 : 0 }];
}
async function addTask(env, biz, title, { due, contact_id = null, deal_id = null, source }) {
  if (source && await one(env, 'SELECT 1 FROM mk_tasks WHERE business_id = ? AND source = ? AND done = 0', biz, source)) return false; // no duplicar
  const t = now();
  await env.DB.prepare('INSERT INTO mk_tasks (business_id, title, due_date, contact_id, deal_id, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(biz, title.slice(0, 300), due || today(), contact_id, deal_id, source || 'manual', t, t).run();
  return true;
}
async function addSteps(env, a, fallback, vars, link, key) {
  let did = false;
  for (const [i, st] of stepsOf(a, fallback).entries()) did = (await addTask(env, a.business_id, fill(st.t, vars), { due: addDays(today(), st.d), ...link, source: `auto:${a.id}:${key}:${i}` })) || did;
  return did;
}
const bump = (env, a) => env.DB.prepare('UPDATE mk_automations SET runs = runs + 1, last_run_at = ? WHERE id = ?').bind(now(), a.id).run();

async function onNewContact(env, biz, contact) {
  const autos = await all(env, "SELECT * FROM mk_automations WHERE business_id = ? AND active = 1 AND trigger = 'lead_nuevo'", biz);
  for (const a of autos) {
    const vars = { nombre: contact.name || 'el lead' };
    if (a.action === 'crear_oportunidad') {
      const t = now();
      await env.DB.prepare("INSERT INTO mk_deals (business_id, title, contact_id, campaign_id, value, stage, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'nuevo', ?, ?)")
        .bind(biz, fill(stepsOf(a, 'Oportunidad: {nombre}')[0].t, vars).slice(0, 300), contact.id, contact.campaign_id || null, t, t).run();
    } else await addSteps(env, a, 'Contactar a {nombre}', vars, { contact_id: contact.id }, `c${contact.id}`);
    await bump(env, a);
  }
}

// Tarea diaria (3:00 a. m.): leads sin contacto y campañas que pasan el % del presupuesto.
export async function daily(env) {
  const autos = await all(env, "SELECT * FROM mk_automations WHERE active = 1 AND trigger <> 'lead_nuevo'");
  const t = today();
  for (const a of autos) {
    let did = false;
    if (a.trigger === 'sin_contacto') {
      const days = a.days || 3, limitMs = now() - days * 86400000;
      const rows = await all(env, `SELECT id, name FROM mk_contacts WHERE business_id = ? AND stage = 'lead' AND created_at < ?
        AND (last_contact_at IS NULL OR last_contact_at < ?) LIMIT 50`, a.business_id, limitMs, addDays(t, -days));
      for (const ct of rows) did = (await addSteps(env, a, 'Hacer seguimiento a {nombre}', { nombre: ct.name }, { contact_id: ct.id }, `c${ct.id}`)) || did;
    } else if (a.trigger === 'presupuesto_campana') {
      const pct = a.percent || 80;
      const rows = await all(env, `SELECT k.id, k.name, k.budget, COALESCE(SUM(s.amount), 0) spend FROM mk_campaigns k LEFT JOIN mk_spend s ON s.campaign_id = k.id AND s.business_id = k.business_id
        WHERE k.business_id = ? AND k.status = 'activa' AND k.budget > 0 GROUP BY k.id HAVING spend * 100 >= k.budget * ?`, a.business_id, pct);
      for (const k of rows) did = (await addSteps(env, a, 'La campaña {campana} va en {porcentaje}% del presupuesto', { campana: k.name, porcentaje: Math.round(k.spend * 100 / k.budget) }, {}, `k${k.id}`)) || did;
    } else if (a.trigger === 'factura_vencida') {
      // Solo si el negocio también usa Finanzas (la tabla existe y el módulo está activo)
      if (!(await orgUsa(env, a.business_id, 'finanzas'))) continue;
      const rows = await all(env, "SELECT id, number, counterparty, kind FROM fin_invoices WHERE business_id = ? AND status = 'pendiente' AND due_date < ? LIMIT 50", a.business_id, t).catch(() => []);
      for (const i of rows) did = (await addSteps(env, a, i.kind === 'emitida' ? 'Cobrar factura {factura} a {tercero}' : 'Pagar factura {factura} de {tercero}', { factura: i.number || '#' + i.id, tercero: i.counterparty }, {}, `f${i.id}`)) || did;
    } else if (a.trigger === 'semanal' && new Date(Date.now() - 5 * 3600000).getUTCDay() === 1) {
      const last = a.last_run_at ? new Date(a.last_run_at - 5 * 3600000).toISOString().slice(0, 10) : null;
      if (last === t) continue;
      if (a.action === 'informe_ia') did = (await weeklyReport(env, a)) || did;
      else did = (await addSteps(env, a, 'Revisión semanal de marketing', {}, {}, `w${t}`)) || did;
    }
    if (did) await bump(env, a);
  }
}

// Informe semanal: con Workers AI (binding AI) lo escribe solo; sin él, deja la tarea de pedírselo al asistente.
const SYSTEM_INFORME = (name) => `Eres el analista de marketing de ${name}. Escribe en español de Colombia un informe breve para el dueño:
1) qué pasó (con cifras en pesos colombianos), 2) qué preocupa, 3) tres acciones concretas para esta semana.
Usa solo los datos que te doy; si faltan datos, dilo y sugiere qué registrar. Máximo 220 palabras, con títulos cortos y viñetas.`;
async function weeklyReport(env, a) {
  if (!env.AI) return addTask(env, a.business_id, 'Pídele a tu asistente de IA el informe semanal de marketing (herramienta marketing_datos_informe)', { source: `auto:${a.id}:informe:${today()}` });
  const c = { env, businessId: a.business_id };
  const data = await marketingSummary(c);
  const name = (await one(env, 'SELECT name FROM orgs WHERE id = ?', a.business_id))?.name || 'el negocio';
  const r = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: [{ role: 'system', content: SYSTEM_INFORME(name) }, { role: 'user', content: 'Datos (JSON):\n' + JSON.stringify(data).slice(0, 12000) }], max_tokens: 900 }).catch(() => null);
  if (!r?.response) return false;
  await saveReport(env, a.business_id, { title: `Marketing · ${today()}`, content: r.response, origen: 'automatico' });
  return true;
}
export async function reportData(c, from, to) {
  const name = (await one(c.env, 'SELECT name FROM orgs WHERE id = ?', c.businessId))?.name || 'el negocio';
  return { instruccion: SYSTEM_INFORME(name), datos: await marketingSummary(c, from, to) };
}
export async function saveReport(env, biz, { title, content, origen = 'ia', by = null }) {
  const t = now();
  const res = await env.DB.prepare('INSERT INTO mk_reports (business_id, title, content, origen, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(biz, String(title || 'Informe de marketing').slice(0, 200), String(content || '').slice(0, 20000), origen, by, t, t).run();
  return { id: res.meta.last_row_id };
}

/* ---------------- links públicos (/l/:slug en el dominio de cada app) ---------------- */
// Busca el link de esa app; la app revisa que el negocio esté activo y con Marketing, y después cuenta el clic.
export async function linkBySlug(env, app, slug) {
  const l = await one(env, 'SELECT * FROM mk_links WHERE slug = ? AND business_id LIKE ?', String(slug || '').toLowerCase().slice(0, 80), `${app}:%`);
  if (!l) return null;
  const u = new URL(l.target);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (l[k] && !u.searchParams.has(k)) u.searchParams.set(k, l[k]);
  return { id: l.id, business_id: l.business_id.slice(app.length + 1), url: u.toString() };
}
export const countClick = (env, app, id) => env.DB.prepare('UPDATE mk_links SET clicks = clicks + 1, last_click_at = ? WHERE id = ? AND business_id LIKE ?').bind(now(), Number(id), `${app}:%`).run();

/* ---------------- listas: revisar sitios y feeds ---------------- */
export async function checkList(c, listId) {
  const list = await one(c.env, 'SELECT * FROM mk_lists WHERE id = ? AND business_id = ?', listId, c.businessId);
  if (!list) throw new HttpError(404, 'Lista no encontrada');
  const items = await all(c.env, "SELECT * FROM mk_list_items WHERE business_id = ? AND list_id = ? AND status <> 'descartado' AND (url IS NOT NULL OR feed_url IS NOT NULL) ORDER BY updated_at DESC LIMIT 15", c.businessId, listId);
  const out = [];
  await Promise.all(items.map(async (it) => {
    try {
      const f = await readFeed(it.feed_url || it.url, 6);
      const latest = f.items.length ? f.items.map(({ titulo, url, fecha }) => ({ titulo, url, fecha })) : (f.articulos_en_pagina || []).map(({ titulo, url }) => ({ titulo, url }));
      await c.env.DB.prepare('UPDATE mk_list_items SET data = ?, feed_url = COALESCE(feed_url, ?), last_checked_at = ?, updated_at = ? WHERE id = ? AND business_id = ?')
        .bind(JSON.stringify({ ultimas: latest.slice(0, 6) }), f.items.length ? f.url : null, now(), now(), it.id, c.businessId).run();
      out.push({ id: it.id, nombre: it.title, sitio: it.url, ultimas: latest.slice(0, 6) });
    } catch (e) { out.push({ id: it.id, nombre: it.title, sitio: it.url, error: e.message }); }
  }));
  await audit(c, `Revisó los sitios de la lista «${list.name}»`, { modulo: MOD });
  return { lista: list.name, revisados: out.length, sitios: out };
}

/* ---------------- entidades ---------------- */
export const ENTITIES = {
  contacts: { table: 'mk_contacts', label: 'el contacto', title: 'name', search: ['name', 'email', 'company', 'phone'], order: 'updated_at DESC',
    fields: { name: 'text!', email: 'email', phone: 'text', company: 'text', stage: STAGES_CONTACT, source: 'text', campaign_id: 'int', owner: 'text', tags: 'text', notes: 'long', last_contact_at: 'date' },
    refs: { campaign_id: 'mk_campaigns' },
    async afterCreate(c, id, row) { if (row.stage === 'lead' || !row.stage) await onNewContact(c.env, c.businessId, { id, ...row }); } },
  deals: { table: 'mk_deals', label: 'la oportunidad', title: 'title', search: ['title', 'notes'], order: 'updated_at DESC',
    fields: { title: 'text!', contact_id: 'int', campaign_id: 'int', value: 'money', stage: STAGES_DEAL, expected_close: 'date', notes: 'long' },
    refs: { contact_id: 'mk_contacts', campaign_id: 'mk_campaigns' },
    beforeCreate(c, row) { if (['ganado', 'perdido'].includes(row.stage)) row.closed_at = now(); },
    beforeUpdate(c, row, before) { if (row.stage && row.stage !== before.stage) row.closed_at = ['ganado', 'perdido'].includes(row.stage) ? now() : null; } },
  campaigns: { table: 'mk_campaigns', label: 'la campaña', title: 'name', search: ['name', 'utm_campaign'], order: "CASE status WHEN 'activa' THEN 0 WHEN 'pausada' THEN 1 ELSE 2 END, start_date DESC",
    fields: { name: 'text!', channel: ['meta_ads', 'google_ads', 'whatsapp', 'correo', 'organico', 'otro'], status: ['activa', 'pausada', 'terminada'], start_date: 'date', end_date: 'date', budget: 'money', goal_leads: 'int', utm_campaign: 'text', notes: 'long' },
    async beforeCreate(c, row) { row.utm_campaign = await uniqueUtm(c, row.utm_campaign || row.name); },
    async beforeUpdate(c, row, before) { if ('utm_campaign' in row) row.utm_campaign = await uniqueUtm(c, row.utm_campaign || before.name, before.id); },
    async afterDelete(c, before) { await c.env.DB.prepare('DELETE FROM mk_links WHERE campaign_id = ? AND business_id = ?').bind(before.id, c.businessId).run(); } },
  spend: { table: 'mk_spend', label: 'el gasto de campaña', search: ['note'], order: 'date DESC',
    fields: { campaign_id: 'int!', date: 'date!', amount: 'money!', leads: 'int', clicks: 'int', impressions: 'int', note: 'text' },
    refs: { campaign_id: 'mk_campaigns' } },
  tasks: { table: 'mk_tasks', label: 'la tarea', title: 'title', search: ['title', 'notes', 'assignee'], order: "done, COALESCE(due_date, '9999'), created_at DESC", borrar: 'tenant',
    fields: { title: 'text!', due_date: 'date', done: 'bool', contact_id: 'int', deal_id: 'int', assignee: 'text', notes: 'long', source: ['manual', 'plantilla'] },
    refs: { contact_id: 'mk_contacts', deal_id: 'mk_deals' },
    beforeUpdate(c, row) { if ('done' in row) row.done_at = row.done ? now() : null; } },
  automations: { table: 'mk_automations', label: 'la automatización', title: 'name', search: ['name'], order: 'created_at DESC', crear: 'manager',
    fields: { name: 'text!', trigger: ['lead_nuevo', 'sin_contacto', 'presupuesto_campana', 'factura_vencida', 'semanal'], action: ['crear_tarea', 'crear_oportunidad', 'informe_ia'], days: 'int', percent: 'int', task_title: 'long', active: 'bool+' } },
  lists: { table: 'mk_lists', label: 'la lista', title: 'name', search: ['name', 'description'], order: 'name',
    fields: { name: 'text!', kind: ['otra', 'competidores', 'fuentes', 'temas', 'tendencias', 'prospectos'], description: 'long' },
    async afterDelete(c, before) { await c.env.DB.prepare('DELETE FROM mk_list_items WHERE list_id = ? AND business_id = ?').bind(before.id, c.businessId).run(); } },
  list_items: { table: 'mk_list_items', label: 'el elemento de la lista', title: 'title', search: ['title', 'url', 'notes'], order: "CASE status WHEN 'descartado' THEN 1 ELSE 0 END, updated_at DESC", borrar: 'tenant',
    fields: { list_id: 'int!', title: 'text!', url: 'url', feed_url: 'url', notes: 'long', status: ['activo', 'revisado', 'descartado'], score: 'int' },
    refs: { list_id: 'mk_lists' },
    decorate(c, rows) { return rows.map((r) => { let d = null; try { d = JSON.parse(r.data || 'null'); } catch {} return { ...r, data: undefined, ultimas: d?.ultimas || null }; }); } },
  reports: { table: 'mk_reports', label: 'el informe', title: 'title', search: ['title', 'content'], order: 'created_at DESC', crear: 'manager',
    fields: { title: 'text!', content: 'long!', origen: ['manual', 'ia', 'automatico'] } },
  tools: { table: 'mk_tools', label: 'la herramienta', title: 'name', search: ['name', 'vendor', 'account_email'], order: "CASE status WHEN 'cancelada' THEN 1 ELSE 0 END, name",
    fields: { name: 'text!', category: ['marketing', 'crm', 'infraestructura', 'software', 'api', 'ia', 'otro'], vendor: 'text', plan: 'text', cost: 'money', cycle: ['mensual', 'anual', 'por uso'], renews_on: 'date', url: 'url', account_email: 'email', status: ['activa', 'prueba', 'cancelada'], cost_center_id: 'int', notes: 'long' },
    async beforeCreate(c, row) { await centroDeFinanzas(c, row); }, async beforeUpdate(c, row) { await centroDeFinanzas(c, row); } },
};

// El centro de costo de una suscripción es de Finanzas: solo se acepta uno del mismo negocio (si usa Finanzas).
async function centroDeFinanzas(c, row) {
  if (row.cost_center_id == null) return;
  const ok = await one(c.env, 'SELECT 1 FROM fin_cost_centers WHERE id = ? AND business_id = ?', row.cost_center_id, c.businessId).catch(() => null);
  if (!ok) throw new HttpError(400, 'Ese centro de costo no existe en Finanzas');
}

/* ---------------- resumen ---------------- */
export async function marketingSummary(c, fromP, toP) {
  const biz = c.businessId, env = c.env;
  const to = DATE.test(toP || '') ? toP : today();
  const from = DATE.test(fromP || '') ? fromP : addDays(to, -29);
  const fromMs = Date.parse(from + 'T05:00:00Z'), toMs = Date.parse(to + 'T05:00:00Z') + 86400000;
  const [contacts, newContacts, bySource, pipeline, won, lost, camps, spendRows, contactsByCamp, wonByCamp, tasks, tools, clicks] = await Promise.all([
    all(env, 'SELECT stage, COUNT(*) n FROM mk_contacts WHERE business_id = ? GROUP BY stage', biz),
    one(env, 'SELECT COUNT(*) n FROM mk_contacts WHERE business_id = ? AND created_at >= ? AND created_at < ?', biz, fromMs, toMs),
    all(env, "SELECT COALESCE(NULLIF(source, ''), '(sin dato)') k, COUNT(*) n FROM mk_contacts WHERE business_id = ? AND created_at >= ? AND created_at < ? GROUP BY k ORDER BY n DESC LIMIT 8", biz, fromMs, toMs),
    all(env, "SELECT stage, COUNT(*) n, COALESCE(SUM(value), 0) v FROM mk_deals WHERE business_id = ? AND stage NOT IN ('ganado', 'perdido') GROUP BY stage", biz),
    one(env, "SELECT COUNT(*) n, COALESCE(SUM(value), 0) v FROM mk_deals WHERE business_id = ? AND stage = 'ganado' AND closed_at >= ? AND closed_at < ?", biz, fromMs, toMs),
    one(env, "SELECT COUNT(*) n FROM mk_deals WHERE business_id = ? AND stage = 'perdido' AND closed_at >= ? AND closed_at < ?", biz, fromMs, toMs),
    all(env, 'SELECT id, name, channel, status, budget, goal_leads, start_date, end_date, utm_campaign FROM mk_campaigns WHERE business_id = ?', biz),
    all(env, 'SELECT campaign_id, COALESCE(SUM(amount), 0) spend, COALESCE(SUM(leads), 0) leads, COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN amount END), 0) spend_period FROM mk_spend WHERE business_id = ? GROUP BY campaign_id', from, to, biz),
    all(env, 'SELECT campaign_id, COUNT(*) n FROM mk_contacts WHERE business_id = ? AND campaign_id IS NOT NULL GROUP BY campaign_id', biz),
    all(env, "SELECT campaign_id, COUNT(*) n, COALESCE(SUM(value), 0) v FROM mk_deals WHERE business_id = ? AND stage = 'ganado' AND campaign_id IS NOT NULL GROUP BY campaign_id", biz),
    one(env, 'SELECT COUNT(*) open, SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) overdue FROM mk_tasks WHERE business_id = ? AND done = 0', today(), biz),
    one(env, "SELECT COUNT(*) n, COALESCE(SUM(CASE cycle WHEN 'anual' THEN cost / 12 WHEN 'mensual' THEN cost ELSE 0 END), 0) monthly FROM mk_tools WHERE business_id = ? AND status <> 'cancelada'", biz),
    all(env, 'SELECT campaign_id, COUNT(*) links, COALESCE(SUM(clicks), 0) clicks FROM mk_links WHERE business_id = ? GROUP BY campaign_id', biz),
  ]);
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.campaign_id, r]));
  const sp = by(spendRows), cc = by(contactsByCamp), wc = by(wonByCamp), ck = by(clicks);
  const campaigns = camps.map((k) => {
    const spend = sp[k.id]?.spend || 0, leads = Math.max(sp[k.id]?.leads || 0, cc[k.id]?.n || 0), revenue = wc[k.id]?.v || 0;
    return { ...k, spend, spend_period: sp[k.id]?.spend_period || 0, leads, won: wc[k.id]?.n || 0, revenue, links: ck[k.id]?.links || 0, clicks: ck[k.id]?.clicks || 0,
      cpl: leads ? Math.round(spend / leads) : null, roi: spend ? Math.round(((revenue - spend) / spend) * 100) : null, budget_used: k.budget ? Math.round((spend / k.budget) * 100) : null };
  });
  const channels = {};
  for (const k of campaigns) { channels[k.channel] ||= { channel: k.channel, spend: 0, leads: 0, revenue: 0 }; channels[k.channel].spend += k.spend; channels[k.channel].leads += k.leads; channels[k.channel].revenue += k.revenue; }
  const totals = campaigns.reduce((a, k) => ({ budget: a.budget + (k.budget || 0), spend: a.spend + k.spend, spend_period: a.spend_period + k.spend_period, leads: a.leads + k.leads, revenue: a.revenue + k.revenue }), { budget: 0, spend: 0, spend_period: 0, leads: 0, revenue: 0 });
  return {
    from, to,
    contacts: { by_stage: Object.fromEntries(contacts.map((r) => [r.stage, r.n])), new: newContacts.n, by_source: bySource },
    deals: { pipeline: STAGES_DEAL.slice(0, 4).map((s) => ({ stage: s, n: pipeline.find((p) => p.stage === s)?.n || 0, value: pipeline.find((p) => p.stage === s)?.v || 0 })),
      won: won.n, won_value: won.v, lost: lost.n, win_rate: won.n + lost.n ? Math.round((won.n / (won.n + lost.n)) * 100) : null },
    campaigns, channels: Object.values(channels),
    totals: { ...totals, cpl: totals.leads ? Math.round(totals.spend / totals.leads) : null, roi: totals.spend ? Math.round(((totals.revenue - totals.spend) / totals.spend) * 100) : null },
    tasks: { open: tasks.open || 0, overdue: tasks.overdue || 0 },
    tools: { active: tools.n, monthly: Math.round(tools.monthly) },
  };
}

export function routes(r) {
  cardRoutes(r); // antes del CRUD: la lista de tarjetas crea la predeterminada
  // Contactos que llegan de otro sistema (formulario del sitio, otro módulo de la app…): no se duplican por `ref`.
  //   POST /api/marketing/contacts/externo  { ref, name, email?, phone?, source?, utm_campaign?, notes?, stage?, fecha? } -> { id, nuevo }
  //   PATCH /api/marketing/contacts/externo { ref, stage }
  r.post(`${B}/contacts/externo`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), ref = String(b.ref || '').slice(0, 120);
    if (!ref) throw new HttpError(400, 'Falta ref');
    const prev = await one(c.env, 'SELECT id FROM mk_contacts WHERE business_id = ? AND ref = ?', c.businessId, ref);
    if (prev) return json({ id: prev.id, nuevo: false });
    const camp = b.utm_campaign ? await one(c.env, 'SELECT id FROM mk_campaigns WHERE business_id = ? AND utm_campaign = ?', c.businessId, String(b.utm_campaign)) : null;
    const stage = STAGES_CONTACT.includes(b.stage) ? b.stage : 'lead', t = now(), created = Number(b.fecha) > 0 ? Number(b.fecha) : t;
    const res = await c.env.DB.prepare(`INSERT OR IGNORE INTO mk_contacts (business_id, name, email, phone, stage, source, campaign_id, notes, ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(c.businessId, String(b.name || b.email || 'Lead').slice(0, 300), b.email ? String(b.email).slice(0, 254) : null, b.phone ? String(b.phone).slice(0, 60) : null, stage,
        b.source ? String(b.source).slice(0, 300) : null, camp?.id || null, b.notes ? String(b.notes).slice(0, 2000) : null, ref, created, t).run();
    if (!res.meta.changes) return json({ id: (await one(c.env, 'SELECT id FROM mk_contacts WHERE business_id = ? AND ref = ?', c.businessId, ref))?.id, nuevo: false });
    const id = res.meta.last_row_id;
    if (stage === 'lead') await onNewContact(c.env, c.businessId, { id, name: b.name, campaign_id: camp?.id || null });
    await audit(c, `Llegó el lead «${String(b.name || b.email || 'Lead').slice(0, 60)}»${b.source ? ` (${String(b.source).slice(0, 40)})` : ''}`, { modulo: MOD });
    return json({ id, nuevo: true }, 201);
  });
  r.patch(`${B}/contacts/externo`, `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    if (!STAGES_CONTACT.includes(b.stage)) throw new HttpError(400, 'Etapa no válida');
    await c.env.DB.prepare('UPDATE mk_contacts SET stage = ?, updated_at = ? WHERE business_id = ? AND ref = ?').bind(b.stage, now(), c.businessId, String(b.ref || '')).run();
    return json({ ok: true });
  });
  const api = crud(r, { base: B, modulo: MOD, entities: { ...ENTITIES, cards: CARD_ENTITY } });

  r.get(`${B}/summary`, `tenant:${MOD}`, async (c) => json(await marketingSummary(c, c.url.searchParams.get('from'), c.url.searchParams.get('to'))));
  r.get(`${B}/resumen`, `tenant:${MOD}`, async (c) => {
    const s = await marketingSummary(c);
    return json({ titulo: 'Leads nuevos (30 días)', valor: s.contacts.new, detalle: `${s.contacts.by_stage.lead || 0} abiertos · ${s.tasks.open} tareas${s.tasks.overdue ? ` (${s.tasks.overdue} vencidas)` : ''}`, icono: 'bi-megaphone', ruta: '/staff/marketing.html' });
  });

  // Revisar los sitios de una lista (feeds o páginas) y guardar sus últimas publicaciones
  r.post(`${B}/lists/:id/check`, `tenant:${MOD}`, async (c) => json(await checkList(c, Number(c.params.id))));
  // Datos para que el asistente escriba el informe (y la instrucción del analista de Diwilo)
  r.get(`${B}/reports/datos`, `tenant:${MOD}`, async (c) => json(await reportData(c, c.url.searchParams.get('from'), c.url.searchParams.get('to'))));

  // Links de rastreo por campaña y plataforma
  r.get(`${B}/campaigns/:id/links`, `tenant:${MOD}`, async (c) => {
    const k = await api.get(c, 'campaigns', Number(c.params.id));
    const links = await all(c.env, 'SELECT id, slug, platform, title, target, utm_source, utm_medium, utm_campaign, clicks, last_click_at, created_at FROM mk_links WHERE business_id = ? AND campaign_id = ? ORDER BY created_at', c.businessId, k.id);
    return json({ campaign: { id: k.id, name: k.name, utm_campaign: k.utm_campaign }, links });
  });
  r.post(`${B}/campaigns/:id/links`, `tenant:${MOD}`, async (c) => {
    const k = await api.get(c, 'campaigns', Number(c.params.id));
    const body = await readJson(c.req);
    const key = PLATFORMS[body.platform] ? body.platform : 'otro', p = PLATFORMS[key];
    const target = String(body.target || '').trim();
    try { if (!/^https?:$/.test(new URL(target).protocol)) throw 0; } catch { throw new HttpError(400, 'La dirección de destino debe empezar por https://'); }
    const base = slugify(`${k.utm_campaign || k.name}-${p[1]}`).slice(0, 60) || 'link';
    let slug = base;
    for (let i = 2; await one(c.env, 'SELECT 1 FROM mk_links WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
    const t = now();
    const res = await c.env.DB.prepare('INSERT INTO mk_links (business_id, campaign_id, slug, platform, title, target, utm_source, utm_medium, utm_campaign, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, k.id, slug, key, String(body.title || `${k.name} · ${p[0]}`).slice(0, 200), target.slice(0, 1000), p[1], p[2], k.utm_campaign, t, t).run();
    await audit(c, `Creó el link de rastreo /l/${slug} (${p[0]}) de la campaña «${k.name}»`, { modulo: MOD });
    return json({ id: res.meta.last_row_id, slug }, 201);
  });
  r.delete(`${B}/links/:id`, `manager:${MOD}`, async (c) => {
    const l = await one(c.env, 'SELECT slug FROM mk_links WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!l) throw new HttpError(404, 'No encontrado');
    await c.env.DB.prepare('DELETE FROM mk_links WHERE id = ? AND business_id = ?').bind(Number(c.params.id), c.businessId).run();
    await audit(c, `Borró el link de rastreo /l/${l.slug}`, { modulo: MOD });
    return json({ ok: true });
  });
  // Público: cuenta el clic y redirige con los UTM. Un negocio archivado o sin el módulo activo no redirige.
}

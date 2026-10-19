// Pruebas de la guía de uso por módulo para el MCP: GET /api/<módulo>/mcp (propios y centrales) y, por MCP, resources (diwilo://<módulo>/guia) y prompts.
export default async function ({ check, diwilo, newBusiness, newMember, mcp }) {
  const A = await newBusiness('Guía MCP A', { login: true });
  const staff = await newMember(A.id, 'staff');

  // Ruta de un módulo central y de uno propio
  const mk = await A.app('/api/marketing/mcp');
  check('MCP: cada módulo central tiene su ruta de guía', mk.status === 200 && mk.data.modulo === 'marketing' && mk.data.nombre === 'Marketing' && /\/mcp$/.test(mk.data.conexion.mcp), JSON.stringify(mk.data).slice(0, 200));
  check('MCP: la guía trae el texto de uso, ejemplos y flujos con herramientas en formato del MCP', /Antes de crear/.test(mk.data.guia) && mk.data.ejemplos.length >= 2 && mk.data.flujos.some((f) => f.id === 'informe' && f.pasos.includes('marketing_datos_informe')));
  const h = mk.data.herramientas;
  check('MCP: las herramientas dicen si leen o escriben, si piden confirmación y sus argumentos', h.some((t) => t.nombre === 'marketing_resumen' && t.tipo === 'lectura' && !t.confirmar) && h.some((t) => t.nombre === 'marketing_crear_contacto' && t.tipo === 'escritura' && t.confirmar && t.argumentos.some((a) => a.nombre === 'nombre' && a.obligatorio)));
  const es = await A.app('/api/estudiantes/mcp');
  check('MCP: los módulos propios de la app también tienen su ruta', es.status === 200 && es.data.modulo === 'estudiantes' && es.data.herramientas.some((t) => t.nombre === 'estudiantes_buscar') && /duplicar|busca antes/i.test(es.data.guia), JSON.stringify(es.data).slice(0, 200));
  const ma = await A.app('/api/material/mcp');
  check('MCP: un módulo sin bloque «mcp» recibe una guía básica', ma.status === 200 && ma.data.guia.length > 5 && Array.isArray(ma.data.herramientas));
  check('MCP: la guía de IA y de Marca existen', (await A.app('/api/ai/mcp')).data.flujos.some((f) => f.id === 'revision') && (await A.app('/api/marca/mcp')).data.herramientas.some((t) => t.nombre === 'marca_kit_de_marca'));

  // Rol: el personal no ve las herramientas de administrador; sin acceso al módulo, 403
  check('MCP: el propietario ve la herramienta de administrador', (await A.app('/api/marca/mcp')).data.herramientas.some((t) => t.nombre === 'marca_cambiar_tono'));
  check('MCP: el personal no ve las herramientas que no puede usar', !(await staff.app('/api/marca/mcp')).data.herramientas.some((t) => t.nombre === 'marca_cambiar_tono') && (await staff.app('/api/marca/mcp')).data.herramientas.some((t) => t.nombre === 'marca_guia_de_marca'));
  check('MCP: el personal sin acceso al módulo recibe 403', (await staff.app('/api/finanzas/mcp')).status === 403);

  // Por MCP: recursos y prompts
  const tk = (await A.app('/api/ia/tokens', { method: 'POST', body: { name: 'Prueba guía' } })).data.token;
  const rpc = async (method, params) => (await mcp(tk, { jsonrpc: '2.0', id: 1, method, params })).data;
  const ini = await rpc('initialize', {});
  check('MCP: anuncia recursos y prompts', !!ini.result?.capabilities?.resources && !!ini.result?.capabilities?.prompts && /guía de uso/i.test(ini.result.instructions));
  const rl = (await rpc('resources/list')).result.resources;
  check('MCP: lista una guía por módulo activo', rl.some((r) => r.uri === 'diwilo://marketing/guia' && r.mimeType === 'text/markdown') && rl.some((r) => r.uri === 'diwilo://estudiantes/guia') && rl.some((r) => r.uri === 'diwilo://finanzas/guia'));
  const rr = (await rpc('resources/read', { uri: 'diwilo://marketing/guia' })).result.contents[0];
  check('MCP: lee la guía de un módulo en Markdown', /^# Marketing/.test(rr.text) && /marketing_resumen/.test(rr.text) && /pide confirmación/.test(rr.text) && /## Flujos recomendados/.test(rr.text));
  check('MCP: un recurso que no existe da error', !!(await rpc('resources/read', { uri: 'diwilo://no-existe/guia' })).error && !!(await rpc('resources/read', { uri: 'http://x' })).error);
  const pl = (await rpc('prompts/list')).result.prompts;
  check('MCP: cada flujo es un prompt', pl.some((p) => p.name === 'marketing_informe') && pl.some((p) => p.name === 'finanzas_cierre_mes') && pl.some((p) => p.name === 'cuotas_cobranza'));
  const pg = (await rpc('prompts/get', { name: 'marketing_informe' })).result;
  check('MCP: el prompt trae las herramientas del flujo y pide confirmación', pg.messages?.[0]?.role === 'user' && /marketing_datos_informe → marketing_guardar_informe/.test(pg.messages[0].content.text) && /confirmación/.test(pg.messages[0].content.text));
  check('MCP: el prompt con texto propio lo usa tal cual', /cartera de la academia/.test((await rpc('prompts/get', { name: 'cuotas_cobranza' })).result.messages[0].content.text));
  check('MCP: un prompt que no existe da error', !!(await rpc('prompts/get', { name: 'marketing_nada' })).error);

  // Módulo inactivo = sin guía
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'marketing', activo: false }] });
  check('MCP: con el módulo inactivo la ruta da 403 y su guía desaparece de los recursos', (await A.app('/api/marketing/mcp')).status === 403 && !(await rpc('resources/list')).result.resources.some((r) => r.uri === 'diwilo://marketing/guia') && !(await rpc('prompts/list')).result.prompts.some((p) => p.name.startsWith('marketing_')));
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
}

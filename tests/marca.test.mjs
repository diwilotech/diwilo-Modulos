// Pruebas del módulo Marca e IA. Incluye aislamiento entre negocios y módulo inactivo = 403.
export default async function ({ check, diwilo, newBusiness, newMember, mcp, APP }) {
  const A = await newBusiness('Marca A', { login: true });
  const B = await newBusiness('Marca B', { login: true });
  const M = '/api/marca';

  // Marca por defecto: color de la app, Inter y tono cercano
  const g = (await A.app(M)).data;
  check('Marca: por defecto sigue el color de la app, Inter y tono cercano', g.marca?.color === 'app' && g.marca.tipografia === 'inter' && g.marca.tono === 'cercano' && !!g.marca.tema_app, JSON.stringify(g.marca));
  check('Marca: ofrece 9 temas, 6 tipografías y 5 tonos', g.opciones?.temas.length === 9 && g.opciones.fuentes.length === 6 && g.opciones.tonos.length === 5);

  // El color «de mi app» sigue a Apariencia
  await A.app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'verde', modo: 'light' } });
  check('Marca: «color de mi app» sigue al tema que se elige en Apariencia', (await A.app(M)).data.marca.tema_app === 'verde');

  // Tarjeta del negocio: color de la app en la página pública
  const pred = (await A.app('/api/marketing/cards')).data.rows.find((x) => x.predeterminada);
  check('Marca: la tarjeta del negocio nace con el color «de la app»', pred?.accent === 'app', pred?.accent);
  const pubTxt = async () => (await fetch(`${APP}/c/${pred.slug}`)).text();
  check('Marca: la tarjeta pública usa el tema de la app (verde)', (await pubTxt()).includes('--violet:#0f9f6e'));
  await A.app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'rojo', modo: 'light' } });
  await A.app(M); // cualquier llamada lleva el tema nuevo al módulo
  check('Marca: al cambiar Apariencia, la tarjeta cambia sola (rojo)', (await pubTxt()).includes('--violet:#dc2626'));

  // Color propio y tipografía
  check('Marca: color fuera de la lista se rechaza', (await A.app(M, { method: 'PUT', body: { color: '#ff00ff' } })).status === 400);
  check('Marca: tipografía fuera de la lista se rechaza', (await A.app(M, { method: 'PUT', body: { tipografia: 'comic' } })).status === 400);
  const up = await A.app(M, { method: 'PUT', body: { color: 'azul', tipografia: 'poppins', tono: 'formal', tono_notas: 'Despídete con «Cordialmente».' } });
  check('Marca: guarda color, tipografía y tono', up.status === 200 && up.data.marca.color_efectivo === 'azul' && up.data.marca.tono === 'formal');
  const html = await pubTxt();
  check('Marca: la tarjeta usa el color propio y la tipografía de la marca', html.includes('--violet:#2f6fed') && html.includes('family=Poppins'));
  check('Marca: B no ve la marca de A', (await B.app(M)).data.marca.tono === 'cercano' && (await B.app(M)).data.marca.color === 'app');

  // Plantillas de IA
  const pl = await A.app(`${M}/plantillas`, { method: 'POST', body: { nombre: 'Atención', canal: 'chat', instrucciones: 'No inventes precios.' } });
  check('Marca: crea una plantilla del chat', pl.status === 201);
  check('Marca: plantilla sin instrucciones se rechaza', (await A.app(`${M}/plantillas`, { method: 'POST', body: { nombre: 'x', canal: 'chat' } })).status === 400);
  check('Marca: instrucciones muy largas se rechazan', (await A.app(`${M}/plantillas`, { method: 'POST', body: { nombre: 'x', canal: 'mcp', instrucciones: 'a'.repeat(2001) } })).status === 400);
  await A.app(`${M}/plantillas`, { method: 'POST', body: { nombre: 'Informe', canal: 'mcp', instrucciones: 'Resume la semana.' } });
  const cx = (await A.app(`${M}/ia/contexto?canal=chat`)).data;
  check('Marca: el contexto del chat lleva el tono y la plantilla activa', /Formal/.test(cx.prompt) && /Cordialmente/.test(cx.prompt) && /No inventes precios/.test(cx.prompt) && !/Resume la semana/.test(cx.prompt), cx.prompt);
  await A.app(`${M}/plantillas/${pl.data.id}`, { method: 'PATCH', body: { activa: false } });
  check('Marca: una plantilla desactivada no llega a la IA', !/No inventes precios/.test((await A.app(`${M}/ia/contexto?canal=chat`)).data.prompt));
  check('Marca: canal no válido se rechaza', (await A.app(`${M}/ia/contexto?canal=sms`)).status === 400);
  check('Marca: B no ve las plantillas de A', (await B.app(`${M}/plantillas`)).data.rows?.length === 0);
  check('Marca: B no edita una plantilla de A', (await B.app(`${M}/plantillas/${pl.data.id}`, { method: 'PATCH', body: { nombre: 'x' } })).status === 404);
  check('Marca: B no borra una plantilla de A', (await B.app(`${M}/plantillas/${pl.data.id}`, { method: 'DELETE' })).status === 404);

  // Canal de agentes y kit de marca (para webs, apps, chats y agentes)
  await A.app(`${M}/plantillas`, { method: 'POST', body: { nombre: 'Seguimiento', canal: 'agente', instrucciones: 'Revisa los leads nuevos cada día.' } });
  const ag = (await A.app(`${M}/ia/contexto?canal=agente`)).data;
  check('Marca: el canal de agentes lleva el tono y su plantilla', /Formal/.test(ag.prompt) && /Revisa los leads nuevos/.test(ag.prompt) && !/Resume la semana/.test(ag.prompt));
  const kt = (await A.app(`${M}/kit`)).data;
  check('Marca: el kit trae color, CSS, tipografía, tono y prompts de los 3 canales', kt.color?.principal === '#1d4ed8' && /--marca:#1d4ed8/.test(kt.css) && /family=Poppins/.test(kt.tipografia.html) && kt.tono.id === 'formal'
    && ['chat', 'mcp', 'agente'].every((k) => /Formal/.test(kt.prompts[k])), JSON.stringify(kt).slice(0, 300));
  check('Marca: el prompt de cada canal solo lleva sus plantillas', /Revisa los leads nuevos/.test(kt.prompts.agente) && !/Revisa los leads nuevos/.test(kt.prompts.chat) && /Resume la semana/.test(kt.prompts.mcp));
  check('Marca: el kit de B no trae nada de A', (await B.app(`${M}/kit`)).data.plantillas.length === 0 && (await B.app(`${M}/kit`)).data.color.sigue_a_la_app === true);

  // Paleta: varias tonalidades del color y fondos, calculadas del color principal (no se guardan)
  const pal = kt.color.paleta;
  check('Marca: la paleta trae 10 tonalidades, fondo claro y fondo oscuro del color de la marca', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].every((n) => /^#[0-9a-f]{6}$/.test(pal[n])) && pal[500] === '#1d4ed8' && /^#[0-9a-f]{6}$/.test(pal.fondo) && /^#[0-9a-f]{6}$/.test(pal.fondo_oscuro), JSON.stringify(pal));
  check('Marca: el CSS del kit lleva la paleta y el fondo', /--marca-900:/.test(kt.css) && /--marca-50:/.test(kt.css) && kt.css.includes(`--marca-fondo:${pal.fondo}`) && kt.css.includes(`--marca-fondo-oscuro:${pal.fondo_oscuro}`));
  check('Marca: la tarjeta pública usa el fondo de la paleta', (await pubTxt()).includes(`background:${pal.fondo_oscuro}`));
  check('Marca: las opciones traen la paleta de cada tema', (await A.app(M)).data.opciones.temas.every((x) => x.paleta?.[500] === x.color));

  // Fondo: negro por defecto, blanco, o igual que el modo de la app
  check('Marca: el fondo por defecto es negro', g.marca.fondo === 'oscuro' && kt.fondo.efectivo === 'oscuro' && /--marca-fondo-actual:/.test(kt.css));
  check('Marca: fondo fuera de la lista se rechaza', (await A.app(M, { method: 'PUT', body: { fondo: 'gris' } })).status === 400);
  await A.app(M, { method: 'PUT', body: { fondo: 'claro' } });
  const kc = (await A.app(`${M}/kit`)).data;
  check('Marca: fondo blanco en el kit', kc.fondo.efectivo === 'claro' && kc.fondo.color === kc.color.paleta.fondo && kc.css.includes(`--marca-fondo-actual:${kc.color.paleta.fondo}`));
  const claroHtml = await pubTxt();
  check('Marca: la tarjeta pública se pinta con fondo blanco', claroHtml.includes(`background:${kc.color.paleta.fondo};`) && claroHtml.includes('--hi:#0f172a'));
  await A.app(M, { method: 'PUT', body: { fondo: 'app' } });
  await A.app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'verde', modo: 'dark' } });
  check('Marca: «igual que mi app» sigue el modo oscuro de la app', (await A.app(`${M}/kit`)).data.fondo.efectivo === 'oscuro' && (await A.app(M)).data.marca.modo_app === 'oscuro');
  await A.app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'verde', modo: 'light' } });
  check('Marca: «igual que mi app» pasa a blanco cuando la app pasa a modo claro', (await A.app(`${M}/kit`)).data.fondo.efectivo === 'claro' && (await pubTxt()).includes('--hi:#0f172a'));
  await A.app(M, { method: 'PUT', body: { fondo: 'oscuro' } });
  check('Marca: B no cambia con el fondo de A', (await B.app(M)).data.marca.fondo === 'oscuro' && (await B.app(M)).data.marca.modo_app === 'claro');

  // Logo: se sube con la marca; el kit lo trae solo si se pide
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  check('Marca: logo que no es imagen se rechaza', (await A.app(`${M}/logo`, { method: 'PUT', body: { dataUrl: 'data:text/html;base64,PGI+' } })).status === 400);
  check('Marca: guarda el logo', (await A.app(`${M}/logo`, { method: 'PUT', body: { dataUrl: PNG } })).status === 200 && (await A.app(M)).data.marca.tiene_logo === true);
  const kl = (await A.app(`${M}/kit`)).data;
  check('Marca: el kit dice que hay logo pero no lo incluye por defecto', kl.logo?.disponible === true && !kl.logo.data_url);
  check('Marca: el kit con ?logo=1 trae el logo', (await A.app(`${M}/kit?logo=1`)).data.logo?.data_url === PNG);
  check('Marca: B no ve el logo de A', (await B.app(`${M}/kit?logo=1`)).data.logo === null && (await B.app(`${M}/logo`)).data.data_url === null);
  check('Marca: se puede quitar el logo', (await A.app(`${M}/logo`, { method: 'DELETE' })).status === 200 && (await A.app(M)).data.marca.tiene_logo === false);

  // Identidad (descripción y lema) y logos por uso
  const idt = await A.app(M, { method: 'PUT', body: { descripcion: '  Academia de idiomas con clases presenciales.  ', lema: 'Aprende hablando' } });
  check('Marca: guarda la descripción y el lema', idt.status === 200 && idt.data.marca.descripcion === 'Academia de idiomas con clases presenciales.' && idt.data.marca.lema === 'Aprende hablando', JSON.stringify(idt.data));
  check('Marca: la descripción se corta a 600 letras', (await A.app(M, { method: 'PUT', body: { descripcion: 'x'.repeat(900) } })).data.marca.descripcion.length === 600);
  await A.app(M, { method: 'PUT', body: { descripcion: 'Academia de idiomas con clases presenciales.' } });
  const kid = (await A.app(`${M}/kit`)).data;
  check('Marca: el kit y el prompt traen la descripción', kid.identidad?.descripcion?.startsWith('Academia') && /Qué hace el negocio: Academia/.test(kid.prompts.chat) && /Lema: Aprende hablando/.test(kid.prompts.mcp));
  check('Marca: B no ve la descripción de A', (await B.app(M)).data.marca.descripcion === '');
  check('Marca: logo de un tipo que no existe se rechaza', (await A.app(`${M}/logos/inventado`, { method: 'PUT', body: { dataUrl: PNG } })).status === 400);
  check('Marca: guarda un logo horizontal y uno oscuro', (await A.app(`${M}/logos/horizontal`, { method: 'PUT', body: { dataUrl: PNG } })).status === 200 && (await A.app(`${M}/logos/oscuro`, { method: 'PUT', body: { dataUrl: PNG } })).status === 200);
  const lg = (await A.app(`${M}/logos`)).data;
  check('Marca: lista los logos por uso y los 5 tipos', lg.logos.length === 2 && lg.tipos.length === 5 && lg.logos.every((x) => x.data_url === PNG));
  const kl2 = (await A.app(`${M}/kit?logo=1`)).data;
  check('Marca: el kit trae los logos (con imagen solo si se pide)', kl2.logos.length === 2 && kl2.logos[0].data_url === PNG && !(await A.app(`${M}/kit`)).data.logos[0].data_url);
  check('Marca: B no ve los logos de A', (await B.app(`${M}/logos`)).data.logos.length === 0);
  check('Marca: se puede quitar un logo por uso', (await A.app(`${M}/logos/horizontal`, { method: 'DELETE' })).status === 200 && (await A.app(`${M}/logos`)).data.logos.length === 1);

  // Permisos: el personal ve pero no cambia
  const staff = await newMember(A.id, 'staff');
  // Cada app decide qué módulos ve el personal por defecto; Marca no es sensible: el personal la ve pero no la cambia
  // Es un módulo base: aunque al personal se le asigne una lista sin «marca», la sigue viendo
  await A.app(`/api/team/${staff.id}`, { method: 'PATCH', body: { modulos: [] } });
  check('Marca: módulo base, el personal lo ve aunque su lista de módulos esté vacía', (await staff.app(M)).status === 200);
  check('Marca: el personal ve la marca', (await staff.app(M)).status === 200);
  check('Marca: el personal no cambia la marca (403)', (await staff.app(M, { method: 'PUT', body: { tono: 'directo' } })).status === 403);
  check('Marca: el personal no cambia los logos por uso (403)', (await staff.app(`${M}/logos/icono`, { method: 'PUT', body: { dataUrl: PNG } })).status === 403 && (await staff.app(`${M}/logos`)).status === 200);
  check('Marca: el personal no cambia el logo (403)', (await staff.app(`${M}/logo`, { method: 'PUT', body: { dataUrl: PNG } })).status === 403);
  check('Marca: el personal no crea plantillas (403)', (await staff.app(`${M}/plantillas`, { method: 'POST', body: { nombre: 'x', canal: 'chat', instrucciones: 'y' } })).status === 403);

  // IA (MCP)
  const tk = (await A.app('/api/ia/tokens', { method: 'POST', body: { name: 'Prueba marca' } })).data.token;
  const T = async (name, args) => (await mcp(tk, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })).data.result;
  const gu = await T('marca_guia_de_marca', {});
  check('Marca: la IA lee la guía (tono, tipografía y plantillas del MCP)', gu.structuredContent?.tono?.id === 'formal' && gu.structuredContent.plantillas?.some((p) => p.nombre === 'Informe'), JSON.stringify(gu).slice(0, 200));
  const kk = await T('marca_kit_de_marca', {});
  check('Marca: la IA lee el kit de marca para construir una web', /--marca:/.test(kk.structuredContent?.css || '') && !!kk.structuredContent?.prompts?.agente, JSON.stringify(kk).slice(0, 200));
  check('Marca: la IA cambia el tono', !(await T('marca_cambiar_tono', { tono: 'divertido' })).isError && (await A.app(M)).data.marca.tono === 'divertido');
  check('Marca: la IA crea una plantilla', !(await T('marca_crear_plantilla', { nombre: 'Desde IA', canal: 'chat', instrucciones: 'Sé breve.' })).isError);
  check('Marca: la IA no toca la marca de B', (await B.app(M)).data.marca.tono === 'cercano');

  // Módulo base (reemplaza a Configuración): el plan de Diwilo no lo apaga
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'marca', activo: false }] });
  check('Marca: es un módulo base, el plan no lo apaga (sigue respondiendo 200)', (await A.app(M)).status === 200);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('Marca: sus datos siguen ahí', (await A.app(M)).data.marca.tono === 'divertido');
  check('Marca: la página /staff/marca.html abre', (await A.app('/staff/marca.html')).status === 200);

  // Suscripción vencida = solo lectura
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: '2020-01-01' });
  check('Marca: vencida no deja cambiar (402)', (await A.app(M, { method: 'PUT', body: { tono: 'directo' } })).status === 402);
  check('Marca: vencida deja consultar', (await A.app(M)).status === 200);
  await diwilo('PATCH', `/businesses/${A.id}`, { paid_until: null });
}

// Inicio isométrico («Así funciona tu negocio»): línea del negocio, movimientos sin datos personales, aislamiento y geometría de las figuras.
import { pathToFileURL } from 'node:url';
export default async function ({ check, newBusiness }) {
  const { LINEAS, escena, auditar } = await import(pathToFileURL(`${process.env.DIWILO_MODULOS}/public/m/inicio.js`).href);
  const A = await newBusiness('Inicio A', { login: true });
  const B = await newBusiness('Inicio B', { login: true });
  const f0 = await A.app('/api/dashboard/figura');
  check('Inicio: la app tiene su línea de negocio y empieza sin movimientos', f0.status === 200 && f0.data.linea === 'educacion' && f0.data.movimientos.length === 0, JSON.stringify(f0.data));
  const c = await A.app('/api/marketing/contacts', { method: 'POST', body: { name: 'Persona Privada', email: 'privada@ejemplo.co', stage: 'lead' } });
  const f1 = await A.app('/api/dashboard/figura');
  check('Inicio: un contacto nuevo mueve la figura (lead.nuevo) y el movimiento no trae datos personales', c.status === 201 && f1.data.movimientos.some((m) => m.tipo === 'lead.nuevo') && !/Privada|privada@/.test(JSON.stringify(f1.data)), JSON.stringify(f1.data));
  const f2 = await A.app(`/api/dashboard/figura?desde=${f1.data.ultimo}`);
  check('Inicio: pedir desde el último movimiento no repite los anteriores', f2.status === 200 && f2.data.movimientos.length === 0 && f2.data.ultimo === f1.data.ultimo);
  check('Inicio: otro negocio no ve los movimientos de este (aislamiento)', (await B.app('/api/dashboard/figura')).data.movimientos.length === 0);
  const todas = Object.entries(LINEAS).map(([k, l]) => [k, escena(l)]);
  check('Inicio: las figuras de todas las líneas tienen 10–25 piezas y ninguna se atraviesa', todas.every(([, p]) => p.length >= 10 && p.length <= 25 && auditar(p).length === 0), JSON.stringify(todas.map(([k, p]) => [k, p.length, auditar(p)])));
  check('Inicio: cada flujo de la figura une etapas que existen', Object.values(LINEAS).every((l) => Object.values(l.flujos).every(([d, a]) => l.nodos.some((n) => n.id === d) && l.nodos.some((n) => n.id === a)) && l.nodos.some((n) => n.id === l.luz)));
  // Agentes por módulo: solo actividad real del negocio, sin datos de ejemplo, y aislada por negocio
  const g0 = await A.app('/api/dashboard/agentes');
  check('Inicio: solo hay los agentes automáticos de módulo, sin actividad (nada de ejemplo)', g0.status === 200 && g0.data.agentes.length > 0 && g0.data.agentes.every((a) => a.auto && a.modulo && a.total === 0), JSON.stringify(g0.data).slice(0, 200));
  const ag = await A.app('/api/ai/agentes', { method: 'POST', body: { nombre: 'Agente de Marketing', instrucciones: 'Resume Marketing.', herramientas: ['marketing.resumen'], programacion: 'manual', autonomia: 'proponer', activo: true } });
  const g1 = await A.app('/api/dashboard/agentes'), a1 = g1.data.agentes.find((a) => !a.auto);
  check('Inicio: el agente creado aparece con su semana de 7 días en cero', ag.status === 201 && a1 && a1.herramientas[0] === 'marketing.resumen' && a1.semana.length === 7 && a1.total === 0 && a1.dias.length === 7, JSON.stringify(g1.data).slice(0, 200));
  check('Inicio: el agente de un negocio no aparece en otro', !(await B.app('/api/dashboard/agentes')).data.agentes.some((a) => a.id === ag.data.id));
  const t = await A.app('/api/dashboard');
  check('Inicio: manda la lista de módulos para sus agentes', t.status === 200 && Array.isArray(t.data.agentes) && t.data.agentes.every((m) => m.modulo && !m.agente));
  // Inicio pasivo: lee lo que los módulos empujaron (dashboard_estado); una escritura en el módulo actualiza su estado sin que Inicio lo busque
  check('Inicio: antes de la tarea vencida no hay alerta de tareas', !t.data.alertas.some((x) => x.id === 'tareas'));
  const tv = await A.app('/api/marketing/tasks', { method: 'POST', body: { title: 'Llamar al lead', due_date: '2020-01-01' } });
  await new Promise((r) => setTimeout(r, 300));   // el módulo se recalcula en segundo plano
  const t2 = await A.app('/api/dashboard');
  check('Inicio: la tarea vencida de Marketing aparece como alerta (empujada por el módulo)', tv.status === 201 && t2.data.alertas.some((x) => x.id === 'tareas' && x.nivel === 'mala'), JSON.stringify(t2.data.alertas));
  check('Inicio: otro negocio no ve esa alerta (aislamiento del estado empujado)', !(await B.app('/api/dashboard')).data.alertas.some((x) => x.id === 'tareas'));
}

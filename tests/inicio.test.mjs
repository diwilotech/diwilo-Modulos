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
  check('Inicio: sin agentes la lista sale vacía (nada de ejemplo)', g0.status === 200 && g0.data.agentes.length === 0, JSON.stringify(g0.data).slice(0, 200));
  const ag = await A.app('/api/ai/agentes', { method: 'POST', body: { nombre: 'Agente de Marketing', instrucciones: 'Resume Marketing.', herramientas: ['marketing.resumen'], programacion: 'manual', autonomia: 'proponer', activo: true } });
  const g1 = await A.app('/api/dashboard/agentes'), a1 = g1.data.agentes[0];
  check('Inicio: el agente creado aparece con su semana de 7 días en cero', ag.status === 201 && a1 && a1.herramientas[0] === 'marketing.resumen' && a1.semana.length === 7 && a1.total === 0 && a1.dias.length === 7, JSON.stringify(g1.data).slice(0, 200));
  check('Inicio: el agente de un negocio no aparece en otro', (await B.app('/api/dashboard/agentes')).data.agentes.length === 0);
  const t = await A.app('/api/dashboard');
  check('Inicio: manda la lista de módulos para sus agentes', t.status === 200 && Array.isArray(t.data.agentes) && t.data.agentes.every((m) => m.modulo && !m.agente));
}

// Cálculo de nómina para Colombia (funciones puras, sin base de datos). Los valores de cada año (SMMLV, auxilio, UVT) se pueden ajustar
// por negocio en «Parámetros»; aquí van los de la ley y las reglas vigentes. Todo en pesos enteros.
//   Fuentes: C.S.T. (arts. 127, 134, 159-168, 186, 249, 306), Ley 100/1993 y 797/2003 (seguridad social, FSP), Ley 1393/2010 (40 %),
//   art. 114-1 E.T. (exoneración), Ley 2101/2021 (jornada), Ley 2466/2025 (recargo dominical), arts. 383 y 387 E.T. (retención).

export const PARAMS_LEY = {   // año → valores oficiales (smmlv, auxilio de transporte, UVT)
  2024: { smmlv: 1300000, aux_transporte: 162000, uvt: 47065 },
  2025: { smmlv: 1423500, aux_transporte: 200000, uvt: 49799 },
  2026: { smmlv: 1750905, aux_transporte: 249095, uvt: 52374 },
};
export function paramsDe(year, over = {}) {
  const ys = Object.keys(PARAMS_LEY).map(Number), y = ys.includes(+year) ? +year : (+year > Math.max(...ys) ? Math.max(...ys) : Math.min(...ys));
  const base = PARAMS_LEY[y];
  return { year: +year, smmlv: over.smmlv || base.smmlv, aux_transporte: over.aux_transporte || base.aux_transporte, uvt: over.uvt || base.uvt,
    exonerado: over.exonerado === undefined || over.exonerado === null ? true : !!over.exonerado, horas_mes: over.horas_mes || null, estimado: y !== +year };
}

export const ARL_PCT = { 1: 0.522, 2: 1.044, 3: 2.436, 4: 4.35, 5: 6.96 };   // % sobre el IBC por clase de riesgo
export const KINDS = {   // novedades: etiqueta, unidad
  he_diurna: ['Hora extra diurna', 'horas'], he_nocturna: ['Hora extra nocturna', 'horas'], he_dom_diurna: ['Hora extra dominical/festiva diurna', 'horas'],
  he_dom_nocturna: ['Hora extra dominical/festiva nocturna', 'horas'], rec_nocturno: ['Recargo nocturno', 'horas'], rec_dominical: ['Recargo dominical/festivo', 'horas'],
  rec_nocturno_dominical: ['Recargo nocturno dominical/festivo', 'horas'],
  honorarios: ['Honorarios (clases, servicios)', 'pesos'], comision: ['Comisión (salarial)', 'pesos'], bonificacion_salarial: ['Bonificación salarial', 'pesos'], bonificacion_no_salarial: ['Bonificación no salarial', 'pesos'], otro_devengo: ['Otro devengo no salarial', 'pesos'],
  incapacidad_general: ['Incapacidad por enfermedad general', 'días'], incapacidad_laboral: ['Incapacidad por accidente de trabajo (ARL)', 'días'],
  licencia_maternidad: ['Licencia de maternidad o paternidad', 'días'], licencia_no_remunerada: ['Licencia no remunerada', 'días'], ausencia: ['Ausencia sin pago', 'días'], vacaciones: ['Vacaciones disfrutadas', 'días'],
  prestamo: ['Descuento: préstamo o libranza', 'pesos'], embargo: ['Descuento: embargo', 'pesos'], otro_descuento: ['Otro descuento', 'pesos'],
};
const DESCUENTOS = ['prestamo', 'embargo', 'otro_descuento'];

export const r0 = (n) => Math.round(Number(n) || 0);
const techo100 = (n) => Math.ceil((Number(n) || 0) / 100 - 1e-9) * 100;   // aportes a seguridad social: al múltiplo de 100 superior
const r1000 = (n) => Math.round((Number(n) || 0) / 1000) * 1000;

// Horas ordinarias del mes según la jornada semanal vigente (Ley 2101: 47 h desde jul-2023, 46 h jul-2024, 44 h jul-2025, 42 h jul-2026).
export function horasMes(fechaIso, over) {
  if (over) return over;
  const f = String(fechaIso || '9999');
  const semanal = f >= '2026-07-15' ? 42 : f >= '2025-07-15' ? 44 : f >= '2024-07-15' ? 46 : f >= '2023-07-15' ? 47 : 48;
  return semanal * 5;
}
// Recargo dominical/festivo (Ley 2466/2025): 80 % desde 1-jul-2025, 90 % desde 1-jul-2026, 100 % desde 1-jul-2027 (antes 75 %).
export const recDominical = (fechaIso) => { const f = String(fechaIso || ''); return f >= '2027-07-01' ? 1 : f >= '2026-07-01' ? 0.9 : f >= '2025-07-01' ? 0.8 : 0.75; };
export function factores(fechaIso) {
  const rd = recDominical(fechaIso);
  return { he_diurna: 1.25, he_nocturna: 1.75, he_dom_diurna: 1 + rd + 0.25, he_dom_nocturna: 1 + rd + 0.75, rec_nocturno: 0.35, rec_dominical: rd, rec_nocturno_dominical: rd + 0.35 };
}

// Días comerciales (mes de 30 días) entre dos fechas AAAA-MM-DD, inclusive.
export function dias360(a, b) {
  const [y1, m1, d1] = String(a).split('-').map(Number), [y2, m2, d2] = String(b).split('-').map(Number);
  return Math.max(0, (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30)) + 1);
}
// Días del periodo en que la persona estuvo vinculada (mes de 30 días; quincena = 15).
export function diasPeriodo(emp, period, half = 'M') {
  const ini = half === '2' ? 16 : 1, fin = half === '1' ? 15 : 30;
  let d1 = ini, d2 = fin;
  const [y, m] = period.split('-').map(Number);
  const sd = emp.start_date, ed = emp.end_date;
  const dentro = (f) => f && f.slice(0, 7) === period;
  if (sd && sd.slice(0, 7) > period) return 0;
  if (ed && ed.slice(0, 7) < period) return 0;
  if (dentro(sd)) d1 = Math.max(d1, Math.min(30, +sd.slice(8, 10)));
  if (dentro(ed)) d2 = Math.min(d2, Math.min(30, +ed.slice(8, 10)));
  void y; void m;
  return Math.max(0, d2 - d1 + 1);
}

// Fondo de Solidaridad Pensional según el IBC en SMMLV.
export function pctFsp(ibcEnSmmlv) {
  if (ibcEnSmmlv < 4) return 0;
  if (ibcEnSmmlv < 16) return 0.01;
  if (ibcEnSmmlv < 17) return 0.012;
  if (ibcEnSmmlv < 18) return 0.014;
  if (ibcEnSmmlv < 19) return 0.016;
  if (ibcEnSmmlv < 20) return 0.018;
  return 0.02;
}

// Retención en la fuente por rentas de trabajo, tabla del art. 383 E.T. (base en UVT → pesos de retención).
export function retencionUvt(baseUvt) {
  const b = baseUvt;
  if (b <= 95) return 0;
  if (b <= 150) return (b - 95) * 0.19;
  if (b <= 360) return (b - 150) * 0.28 + 10;
  if (b <= 640) return (b - 360) * 0.33 + 69;
  if (b <= 945) return (b - 640) * 0.35 + 162;
  if (b <= 2300) return (b - 945) * 0.37 + 268;
  return (b - 2300) * 0.39 + 770;
}
// Procedimiento 1 (mensual). `ingreso` = devengado del mes; `incrngo` = aportes obligatorios del empleado. Devuelve { retencion, baseUvt, ... }.
export function retencionMes({ ingreso, incrngo, dependientes, vivienda = 0, prepagada = 0 }, uvt) {
  const neto = Math.max(0, ingreso - incrngo);
  const dep = dependientes ? Math.min(neto * 0.1, 32 * uvt) : 0;
  const ded = dep + Math.min(vivienda, 100 * uvt) + Math.min(prepagada, 16 * uvt);
  const exenta = Math.min(0.25 * Math.max(0, neto - ded), (790 / 12) * uvt);
  const rebaja = Math.min(ded + exenta, neto * 0.4, (1340 / 12) * uvt);
  const base = Math.max(0, neto - rebaja);
  const baseUvt = base / uvt;
  return { retencion: r1000(retencionUvt(baseUvt) * uvt), baseUvt: Math.round(baseUvt * 100) / 100, base: r0(base), deducciones: r0(rebaja) };
}

// Una persona en un periodo. `nov` = sus novedades del periodo ([{ kind, quantity, amount }]); `p` = parámetros del año;
// `previa` = línea de la primera quincena del mismo mes (para la retención de la segunda).
export function liquidarEmpleado(emp, nov, p, { period, half = 'M', previa = null } = {}) {
  const dias = diasPeriodo(emp, period, half);
  const fechaFin = `${period}-${half === '1' ? '15' : '28'}`;
  const f = factores(fechaFin), horas = horasMes(fechaFin, p.horas_mes);
  const integral = emp.salary_type === 'integral', aprendiz = emp.contract_type === 'aprendizaje';
  const sal = +emp.salary || 0, dia = sal / 30;
  const sum = (kinds, campo) => nov.filter((n) => kinds.includes(n.kind)).reduce((s, n) => s + (+n[campo] || 0), 0);
  const dNoRem = Math.min(dias, sum(['licencia_no_remunerada', 'ausencia'], 'quantity'));
  const dIncap = sum(['incapacidad_general'], 'quantity'), dArl = sum(['incapacidad_laboral'], 'quantity');
  const dLic = sum(['licencia_maternidad'], 'quantity'), dVac = sum(['vacaciones'], 'quantity');
  const trabajados = Math.max(0, dias - dNoRem - dIncap - dArl - dLic - dVac);

  if (emp.contract_type === 'prestacion') {   // contratista: honorarios con retención; paga su propia seguridad social y no genera prestaciones
    const conceptosP = [], hon = r0(dia * trabajados) + r0(sum(['honorarios'], 'amount'));
    if (r0(dia * trabajados) > 0) conceptosP.push({ c: 'Honorarios mensuales', tipo: 'dev', salarial: false, valor: r0(dia * trabajados), nota: `${trabajados} días` });
    if (r0(sum(['honorarios'], 'amount')) > 0) conceptosP.push({ c: 'Honorarios por clases o servicios', tipo: 'dev', salarial: false, valor: r0(sum(['honorarios'], 'amount')) });
    const pct = emp.retencion_pct == null ? 10 : +emp.retencion_pct, retP = pct > 0 ? r1000((hon * pct) / 100) : 0, otrosP = r0(sum(DESCUENTOS, 'amount'));
    if (retP > 0) conceptosP.push({ c: `Retención en la fuente por honorarios (${pct} %)`, tipo: 'ded', valor: retP });
    for (const n of nov.filter((x) => DESCUENTOS.includes(x.kind) && x.amount > 0)) conceptosP.push({ c: KINDS[n.kind][0] + (n.note ? ` · ${n.note}` : ''), tipo: 'ded', valor: r0(n.amount) });
    const dedP = retP + otrosP;
    return { dias, trabajados, devengado: hon, salarial: 0, no_salarial: hon, aux: 0, ibc: 0, salud: 0, pension: 0, fsp: 0, retencion: retP, otros_descuentos: otrosP, deducciones: dedP, neto: hon - dedP, descuentos_ley: 0, retencion_base: null,
      aportes: { salud: 0, pension: 0, arl: 0, caja: 0, sena: 0, icbf: 0, total: 0, exonerado: false }, provisiones: { cesantias: 0, intereses: 0, prima: 0, vacaciones: 0, total: 0 }, costo: hon, conceptos: conceptosP,
      alertas: ['Contratista por prestación de servicios: paga su propia seguridad social (pide la planilla). Retención de honorarios estimada.'] };
  }
  const conceptos = [];   // desglose para el desprendible: { c, tipo: 'dev'|'ded', salarial, valor, nota }
  const dev = (c, valor, salarial, nota = '') => { valor = r0(valor); if (valor > 0) conceptos.push({ c, tipo: 'dev', salarial, valor, nota }); return valor; };
  const sueldo = dev(aprendiz ? 'Apoyo de sostenimiento' : 'Sueldo', dia * trabajados, true, `${trabajados} días`);
  const vacaciones = dev('Vacaciones disfrutadas', dia * dVac, true, `${dVac} días`);
  const incapGen = dev('Incapacidad general (66,67 %, mínimo 1 SMMLV)', Math.max(dia * (2 / 3), p.smmlv / 30) * dIncap, true, `${dIncap} días · desde el día 3 se cobra a la EPS`);
  const incapArl = dev('Incapacidad por accidente de trabajo', dia * dArl, true, `${dArl} días · se cobra a la ARL`);
  const licencia = dev('Licencia de maternidad/paternidad', dia * dLic, true, `${dLic} días · se cobra a la EPS`);
  let extras = 0;
  if (!integral) for (const k of Object.keys(f)) { const h = sum([k], 'quantity'); if (h > 0) extras += dev(KINDS[k][0], (sal / horas) * f[k] * h, true, `${h} h`); }
  const comisiones = dev('Comisiones', sum(['comision'], 'amount'), true);
  const bonifSal = dev('Bonificación salarial', sum(['bonificacion_salarial'], 'amount'), true);
  const noSal = dev('Bonificación no salarial', sum(['bonificacion_no_salarial'], 'amount'), false) + dev('Otros devengos no salariales', sum(['otro_devengo'], 'amount'), false);
  const conAux = !integral && !aprendiz && emp.aux_transporte && sal <= 2 * p.smmlv;
  const aux = conAux ? dev('Auxilio de transporte', (p.aux_transporte / 30) * trabajados, false, `${trabajados} días`) : 0;

  const salarial = sueldo + vacaciones + incapGen + incapArl + licencia + extras + comisiones + bonifSal;
  const devengado = salarial + noSal + aux;

  // IBC: salarial (70 % si es integral) + lo no salarial que exceda el 40 % del total (Ley 1393), entre 1 y 25 SMMLV
  const salIbc = integral ? salarial * 0.7 : salarial;
  const exceso = Math.max(0, noSal - 0.4 * (salIbc + noSal));
  const diasSS = Math.max(0, dias - dNoRem);
  const ibcMin = (p.smmlv / 30) * diasSS, ibcMax = ((25 * p.smmlv) / 30) * diasSS;
  const ibc = diasSS > 0 ? Math.min(ibcMax, Math.max(ibcMin, r0(salIbc + exceso))) : 0;
  const ibcMes = diasSS > 0 ? (ibc * 30) / diasSS : 0, enSmmlv = ibcMes / p.smmlv;

  // Descuentos de ley del empleado
  const salud = aprendiz ? 0 : techo100(ibc * 0.04), pension = aprendiz ? 0 : techo100(ibc * 0.04), fsp = aprendiz ? 0 : techo100(ibc * pctFsp(enSmmlv));
  const otros = sum(DESCUENTOS, 'amount');

  // Retención en la fuente: mensual; con quincenas solo en la segunda (sobre el mes completo menos lo ya retenido)
  let retencion = 0, retInfo = null;
  if (half !== '1') {
    const ingMes = devengado + (previa?.devengado || 0), apMes = salud + pension + fsp + (previa?.descuentos_ley || 0);
    retInfo = retencionMes({ ingreso: ingMes, incrngo: apMes, dependientes: emp.dependientes, vivienda: emp.deduc_vivienda, prepagada: emp.deduc_prepagada }, p.uvt);
    retencion = Math.max(0, retInfo.retencion - (previa?.retencion || 0));
  }
  const deducciones = salud + pension + fsp + retencion + otros;
  const neto = devengado - deducciones;

  // Aportes del empleador (sobre el IBC)
  const exo = p.exonerado && enSmmlv < 10;
  const apSalud = aprendiz ? techo100(ibc * 0.125) : exo ? 0 : techo100(ibc * 0.085), apPension = aprendiz ? 0 : techo100(ibc * 0.12);
  const apArl = techo100((ibc * (ARL_PCT[emp.arl_risk] || ARL_PCT[1])) / 100), apCaja = aprendiz ? 0 : techo100(ibc * 0.04);
  const apSena = aprendiz || exo ? 0 : techo100(ibc * 0.02), apIcbf = aprendiz || exo ? 0 : techo100(ibc * 0.03);
  const aportes = apSalud + apPension + apArl + apCaja + apSena + apIcbf;

  // Provisiones (causación mensual, no son pago en efectivo)
  const basePres = salarial + aux;   // cesantías y prima: salario + auxilio + variable
  const baseVac = sueldo + vacaciones + incapGen + incapArl + licencia + comisiones + bonifSal;   // vacaciones: sin horas extras ni auxilio
  const conPres = !integral && !aprendiz;
  const cesantias = conPres ? r0(basePres / 12) : 0, intereses = conPres ? r0(cesantias * 0.12) : 0, prima = conPres ? r0(basePres / 12) : 0;
  const vacProv = aprendiz ? 0 : r0((baseVac * 15) / 360);
  const provisiones = cesantias + intereses + prima + vacProv;

  const lineasDed = [['Salud (4 %)', salud], ['Pensión (4 %)', pension], ['Fondo de solidaridad pensional', fsp], ['Retención en la fuente', retencion]];
  for (const [c, v] of lineasDed) if (v > 0) conceptos.push({ c, tipo: 'ded', valor: v });
  for (const n of nov.filter((x) => DESCUENTOS.includes(x.kind) && x.amount > 0)) conceptos.push({ c: KINDS[n.kind][0] + (n.note ? ` · ${n.note}` : ''), tipo: 'ded', valor: r0(n.amount) });
  return {
    dias, trabajados, devengado, salarial, no_salarial: noSal, aux, ibc: r0(ibc), salud, pension, fsp, retencion, otros_descuentos: r0(otros), deducciones, neto,
    descuentos_ley: salud + pension + fsp, retencion_base: retInfo,
    aportes: { salud: apSalud, pension: apPension, arl: apArl, caja: apCaja, sena: apSena, icbf: apIcbf, total: aportes, exonerado: !!exo },
    provisiones: { cesantias, intereses, prima, vacaciones: vacProv, total: provisiones },
    costo: devengado + aportes + provisiones, conceptos,
    alertas: [...(sal > 0 && sal < p.smmlv && !aprendiz ? ['Salario por debajo del mínimo legal'] : []), ...(dIncap > 2 ? [`Incapacidad de ${dIncap} días: cobra a la EPS desde el día 3`] : [])],
  };
}

// Prima de servicios (semestre) o cesantías e intereses (año) a partir de los días de la persona en el rango.
export function prestacion(emp, p, tipo, { period, promedioVariable = 0 }) {
  const y = period.slice(0, 4);
  const [ini, fin] = tipo === 'cesantias' ? [`${y}-01-01`, `${y}-12-30`] : period.slice(5, 7) <= '06' ? [`${y}-01-01`, `${y}-06-30`] : [`${y}-07-01`, `${y}-12-30`];
  const desde = emp.start_date > ini ? emp.start_date : ini, hasta = emp.end_date && emp.end_date < fin ? emp.end_date : fin;
  const dias = desde > hasta ? 0 : dias360(desde, hasta);
  const sal = +emp.salary || 0, aux = !emp.salary_type.startsWith('integral') && emp.aux_transporte && sal <= 2 * p.smmlv ? p.aux_transporte : 0;
  const base = sal + aux + promedioVariable;
  const aplica = emp.salary_type !== 'integral' && !['aprendizaje', 'prestacion'].includes(emp.contract_type) && dias > 0;
  const valor = aplica ? r0((base * dias) / 360) : 0;
  return { dias, base: r0(base), valor, intereses: tipo === 'cesantias' && aplica ? r0((valor * dias * 0.12) / 360) : 0, desde, hasta };
}

// Liquidación de fin de contrato: cesantías, intereses, prima, vacaciones pendientes e indemnización si es sin justa causa.
export function liquidacionFinal(emp, p, { fin, motivo, promedioVariable = 0, vacacionesTomadas = 0 }) {
  const e = { ...emp, end_date: fin };
  const sal = +emp.salary || 0, y = fin.slice(0, 4);
  if (emp.contract_type === 'prestacion') return { fin, motivo, base: 0, items: [], total: 0, dias_trabajados: dias360(emp.start_date, fin), empleado: emp.name, nota: 'Contrato de prestación de servicios: no genera prestaciones ni indemnización de nómina.' };
  const aplica = emp.salary_type !== 'integral' && emp.contract_type !== 'aprendizaje';
  const aux = aplica && emp.aux_transporte && sal <= 2 * p.smmlv ? p.aux_transporte : 0, base = sal + aux + promedioVariable;
  const dCes = dias360(emp.start_date > `${y}-01-01` ? emp.start_date : `${y}-01-01`, fin);
  const semIni = fin.slice(5, 7) <= '06' ? `${y}-01-01` : `${y}-07-01`;
  const dPrima = dias360(emp.start_date > semIni ? emp.start_date : semIni, fin);
  const cesantias = aplica ? r0((base * dCes) / 360) : 0, intereses = aplica ? r0((cesantias * dCes * 0.12) / 360) : 0, prima = aplica ? r0((base * dPrima) / 360) : 0;
  const dTotal = dias360(emp.start_date, fin);
  const vacCausadas = (15 * dTotal) / 360, vacPend = Math.max(0, vacCausadas - vacacionesTomadas);
  const vacaciones = r0((sal / 30) * vacPend);
  let indemnizacion = 0, indemNota = '';
  if (motivo === 'sin_justa_causa') {
    const diaInd = (sal + promedioVariable) / 30;
    if (emp.contract_type === 'indefinido' || emp.contract_type === 'obra_labor' && !emp.contract_end) {
      const anios = dTotal / 360, primer = sal >= 10 * p.smmlv ? 20 : 30, extra = sal >= 10 * p.smmlv ? 15 : 20;
      const dias = primer + Math.max(0, anios - 1) * extra;
      indemnizacion = r0(diaInd * dias); indemNota = `${Math.round(dias * 10) / 10} días de salario (art. 64 C.S.T.)`;
    } else if (emp.contract_end && emp.contract_end > fin) {
      const dias = Math.max(emp.contract_type === 'obra_labor' ? 15 : 0, dias360(fin, emp.contract_end) - 1);
      indemnizacion = r0(diaInd * dias); indemNota = `${dias} días que faltaban del contrato (art. 64 C.S.T.)`;
    }
  }
  const items = [['Cesantías', cesantias, `${dCes} días`], ['Intereses sobre cesantías (12 %)', intereses, ''], ['Prima de servicios', prima, `${dPrima} días`],
    ['Vacaciones pendientes', vacaciones, `${Math.round(vacPend * 100) / 100} días`], ['Indemnización por despido sin justa causa', indemnizacion, indemNota]].filter((x) => x[1] > 0).map(([c, valor, nota]) => ({ c, valor, nota }));
  return { fin, motivo, base: r0(base), items, total: items.reduce((s, x) => s + x.valor, 0), dias_trabajados: dTotal, empleado: e.name };
}

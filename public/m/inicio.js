// «Así funciona tu negocio» — figura isométrica del Inicio, una por línea de negocio (skill diwilo-nueva-app/inicio-isometrico.md).
// Se carga desde el Dashboard (import('/m/inicio.js')). Kit isométrico de Diwilo (cámara, sólidos, orden de pintado demostrado, auditoría, viaje)
// + las figuras de cada línea (educacion, propiedad, servicios) + el montaje. Solo variables del tema; sin colores fijos.

const RAD = Math.PI / 180;

/** Cámara: mundo (x, y en el piso, z arriba) → pantalla. */
export function camera({ scale = 1, azimuth = 45, elevation = 30, origin = [0, 0] } = {}) {
  const a = azimuth * RAD, e = elevation * RAD, k = scale * Math.sqrt(1.6);
  const sa = Math.sin(a), ca = Math.cos(a), se = Math.sin(e), ce = Math.cos(e);
  return {
    a, sa, ca,
    p: (x, y, z = 0) => [origin[0] + (x * sa - y * ca) * k, origin[1] + ((x * ca + y * sa) * se - z * ce) * k],
    depth: (x, y, z = 0) => (x * ca + y * sa) * ce + z * se, // mayor = más cerca del observador
  };
}

/** Sólido rectangular: devuelve las caras visibles (arriba + laterales) con su tono 0..3 o 'top'. */
export function box(cam, { x, y, w, d, z = 0, h }) {
  const P = (px, py, pz) => cam.p(px, py, pz);
  const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const faces = [{ pts: top, tone: 'top' }];
  const luz = [-cam.sa, cam.ca]; // luz fija
  const lados = [ // normal 2D saliente y esquinas
    { n: [1, 0], q: [[x + w, y], [x + w, y + d]] },
    { n: [0, 1], q: [[x + w, y + d], [x, y + d]] },
    { n: [-1, 0], q: [[x, y + d], [x, y]] },
    { n: [0, -1], q: [[x, y], [x + w, y]] },
  ];
  for (const l of lados) {
    if (l.n[0] * cam.ca + l.n[1] * cam.sa <= 0.001) continue; // cara de espaldas
    const lit = (l.n[0] * luz[0] + l.n[1] * luz[1] + 1) / 2;
    const tone = Math.min(3, Math.max(0, Math.floor(lit * 4)));
    const [[x1, y1], [x2, y2]] = l.q;
    faces.push({ pts: [P(x1, y1, z), P(x2, y2, z), P(x2, y2, z + h), P(x1, y1, z + h)], tone });
  }
  return faces;
}

/** Auditoría de geometría: dos piezas no pueden atravesarse (sin solapes en planta y altura). */
export function auditar(piezas) {
  const mal = [];
  for (let i = 0; i < piezas.length; i++) for (let j = i + 1; j < piezas.length; j++) {
    const A = piezas[i].g, B = piezas[j].g, e = 0.01;
    const planta = A.x < B.x + B.w - e && B.x < A.x + A.w - e && A.y < B.y + B.d - e && B.y < A.y + A.d - e;
    const altura = (A.z ?? 0) < (B.z ?? 0) + B.h - e && (B.z ?? 0) < (A.z ?? 0) + A.h - e;
    if (planta && altura) mal.push(`${piezas[i].id} atraviesa ${piezas[j].id}`);
  }
  return mal; // debe quedar []
}

const f = (n) => Math.round(n * 10) / 10;
const path = (pts) => 'M' + pts.map((q) => f(q[0]) + ' ' + f(q[1])).join('L') + 'Z';

/** Orden de pintado de atrás hacia delante, demostrado por separación de ejes (no ajustado a ojo). */
export function ordenar(cam, piezas) {
  const e = 0.01, n = piezas.length;
  const antes = (A, B) => A.x + A.w <= B.x + e || A.y + A.d <= B.y + e || (A.z ?? 0) + A.h <= (B.z ?? 0) + e;
  const sig = piezas.map(() => []), grado = Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const ab = antes(piezas[i].g, piezas[j].g), ba = antes(piezas[j].g, piezas[i].g);
    if (ab && !ba) { sig[i].push(j); grado[j]++; } else if (ba && !ab) { sig[j].push(i); grado[i]++; }
  }
  const prof = (i) => cam.depth(piezas[i].g.x + piezas[i].g.w / 2, piezas[i].g.y + piezas[i].g.d / 2);
  const listo = [], res = [], visto = new Set();
  for (let i = 0; i < n; i++) if (!grado[i]) listo.push(i);
  while (listo.length) {
    listo.sort((a, b) => prof(a) - prof(b));
    const i = listo.shift(); res.push(i); visto.add(i);
    for (const j of sig[i]) if (--grado[j] === 0) listo.push(j);
  }
  for (let i = 0; i < n; i++) if (!visto.has(i)) res.push(i); // ciclo: no debería pasar; revisar la planta
  return res.map((i) => piezas[i]);
}

/**
 * Dibuja piezas de atrás hacia delante. pieza = { id, g:{x,y,w,d,z,h}, etiqueta?, nodo? }.
 * Si nodo=true la pieza es un botón (tabindex, aria-label) que el shell enlaza al módulo.
 */
export function svg(cam, piezas, { width, height, titulo = '' }) {
  const orden = ordenar(cam, piezas);
  const cuerpo = orden.map((pz) => {
    const caras = box(cam, pz.g).map((c) => `<path d="${path(c.pts)}" class="iso-${c.tone}"/>`).join('');
    const attr = pz.nodo
      ? ` data-nodo="${pz.id}" role="button" tabindex="0" aria-label="${(pz.etiqueta || pz.id).replace(/"/g, '')}"` : '';
    return `<g${attr}>${caras}</g>`;
  }).join('');
  return `<svg class="dw-iso" viewBox="0 0 ${width} ${height}" width="100%" role="group" aria-label="${titulo.replace(/"/g, '')}">${cuerpo}</svg>`;
}

/** Punto de pantalla sobre la cara superior de una pieza (para etiquetas, números y viajes). */
export const encima = (cam, g) => cam.p(g.x + g.w / 2, g.y + g.d / 2, (g.z ?? 0) + g.h);

/** Un paquete (cubo pequeño) viaja por los puntos de pantalla. Sin animación si el usuario la reduce. */
export function viaje(svgEl, puntos, { ms = 1200, tamano = 6 } = {}) {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!svgEl || typeof document === 'undefined' || puntos.length < 2) return;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'iso-paquete');
  g.innerHTML = `<rect x="${-tamano / 2}" y="${-tamano}" width="${tamano}" height="${tamano}" rx="1.5"/>`;
  svgEl.appendChild(g);
  const keys = puntos.map((q) => ({ transform: `translate(${f(q[0])}px, ${f(q[1])}px)` }));
  g.animate(keys, { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () => g.remove();
}

/** CSS del kit: solo variables del tema (nunca colores fijos de marca). */
export const ISO_CSS = `
.dw-iso{--iso-top:color-mix(in srgb,var(--bs-primary) 35%,#fff);--iso-3:color-mix(in srgb,var(--bs-primary) 70%,#fff);
--iso-2:var(--bs-primary);--iso-1:color-mix(in srgb,var(--bs-primary) 80%,#000);--iso-0:color-mix(in srgb,var(--bs-primary) 60%,#000);
--iso-line:color-mix(in srgb,var(--bs-body-color) 40%,transparent);display:block;max-width:100%;height:auto}
.dw-iso path{stroke:var(--iso-line);stroke-width:.6;stroke-linejoin:round}
.dw-iso .iso-top{fill:var(--iso-top)}.dw-iso .iso-3{fill:var(--iso-3)}.dw-iso .iso-2{fill:var(--iso-2)}
.dw-iso .iso-1{fill:var(--iso-1)}.dw-iso .iso-0{fill:var(--iso-0)}
.dw-iso [data-nodo]{cursor:pointer;outline:none}.dw-iso [data-nodo]:focus-visible path,.dw-iso [data-nodo]:hover path{stroke:var(--bs-body-color);stroke-width:1.4}
.dw-iso [data-apagado] path{filter:grayscale(1);opacity:.45}
.dw-iso .iso-paquete rect{fill:var(--bs-warning);stroke:var(--iso-line)}
@media (prefers-reduced-motion:reduce){.dw-iso *{animation:none!important;transition:none!important}}`;

/* ---------- Figuras por línea ---------- */
// Cada figura es la misma máquina: una CINTA que lleva a la persona de una etapa a la siguiente. Cada etapa es una pieza (nodo) pegada a la cinta
// por un brazo, con su placa de etiqueta encima. Etapas y módulos reales de cada línea; el nodo `luz` es el del dato principal.
//   nodo: { id, etiqueta, modulo (módulo que lo alimenta), widget? (módulo central cuyo indicador da el número), api? (indicador propio de la app), valor? (lo entrega window.DwInicioValores) , ruta }
export const LINEAS = {
  educacion: { nombre: 'Educación', frase: 'Una cinta lleva a cada aspirante por mensaje, matrícula, aula y caja.', luz: 'matricula',
    nodos: [
      { id: 'aspirante', etiqueta: 'Aspirantes', modulo: 'marketing', widget: 'marketing', ruta: '/staff/marketing.html' },
      { id: 'mensajes', etiqueta: 'Mensajes', modulo: 'whatsapp', widget: 'whatsapp', ruta: '/staff/whatsapp.html' },
      { id: 'matricula', etiqueta: 'Estudiantes', modulo: 'estudiantes', api: '/api/estudiantes/resumen', ruta: '/staff/estudiantes.html' },
      { id: 'clase', etiqueta: 'Cursos', modulo: 'cursos', api: '/api/cursos/resumen', ruta: '/staff/cursos.html' },
      { id: 'pago', etiqueta: 'Cuotas', modulo: 'cuotas', api: '/api/cuotas/resumen', ruta: '/staff/cuotas.html' }],
    flujos: { 'lead.nuevo': ['aspirante', 'mensajes'], 'chat.nuevo': ['mensajes', 'matricula'], 'matricula.creada': ['matricula', 'clase'], 'pago.recibido': ['clase', 'pago'] } },
  propiedad: { nombre: 'Propiedad horizontal', frase: 'Una cinta lleva cada solicitud del conjunto: del residente a la portería, la administración y la cartera.', luz: 'cartera',
    nodos: [
      { id: 'unidades', etiqueta: 'Unidades', modulo: 'conjuntos', valor: true, ruta: '/staff/conjuntos.html' },
      { id: 'mensajes', etiqueta: 'Mensajes', modulo: 'whatsapp', widget: 'whatsapp', ruta: '/staff/whatsapp.html' },
      { id: 'pqrs', etiqueta: 'PQRS', modulo: 'pqrs', valor: true, ruta: '/staff/pqrs.html' },
      { id: 'porteria', etiqueta: 'Visitas hoy', modulo: 'porteria', valor: true, ruta: '/staff/porteria.html' },
      { id: 'cartera', etiqueta: 'Cartera vencida', modulo: 'cartera', valor: true, ruta: '/staff/cartera.html' }],
    flujos: { 'chat.nuevo': ['mensajes', 'pqrs'], 'pqrs.creada': ['unidades', 'pqrs'], 'visita.registrada': ['unidades', 'porteria'], 'pago.recibido': ['unidades', 'cartera'] } },
  servicios: { nombre: 'Servicios', frase: 'Una cinta lleva cada contacto por mensaje, seguimiento, cobro y equipo.', luz: 'cobro',
    nodos: [
      { id: 'lead', etiqueta: 'Contactos', modulo: 'marketing', widget: 'marketing', ruta: '/staff/marketing.html' },
      { id: 'mensajes', etiqueta: 'Mensajes', modulo: 'whatsapp', widget: 'whatsapp', ruta: '/staff/whatsapp.html' },
      { id: 'cobro', etiqueta: 'Finanzas', modulo: 'finanzas', widget: 'finanzas', ruta: '/staff/finanzas.html' },
      { id: 'equipo', etiqueta: 'Nómina', modulo: 'nomina', widget: 'nomina', ruta: '/staff/nomina.html' }],
    flujos: { 'lead.nuevo': ['lead', 'mensajes'], 'chat.nuevo': ['mensajes', 'cobro'], 'pago.recibido': ['cobro', 'equipo'] } },
};

/** Arma las piezas de una línea: base, cinta, brazos y un nodo por etapa (alternados a ambos lados). Toda pieza descansa sobre otra. */
export function escena(linea) {
  const N = linea.nodos.length, L = N * 2.4 + 1.4, piezas = [];
  piezas.push({ id: 'base', g: { x: 0, y: 0, w: L, d: 9, z: 0, h: 1 } });
  piezas.push({ id: 'cinta', g: { x: 0.5, y: 3.6, w: L - 1, d: 1.8, z: 1, h: 0.5 } });
  linea.nodos.forEach((n, i) => {
    const arriba = i % 2 === 0, x = 0.5 + i * 2.4, y = arriba ? 0 : 6, h = n.id === linea.luz ? 2.8 : 2.2;
    piezas.push({ id: `brazo-${n.id}`, g: { x: x + 1, y: arriba ? 3 : 5.4, w: 1, d: 0.6, z: 1, h: 0.35 } });
    piezas.push({ id: n.id, nodo: true, etiqueta: n.etiqueta, g: { x, y, w: 3, d: 3, z: 1, h } });
    piezas.push({ id: `placa-${n.id}`, g: { x: x + 0.5, y: y + 0.5, w: 2, d: 2, z: 1 + h, h: 0.3 } });
  });
  return piezas;
}
/** Cámara que centra la figura en un lienzo de ancho W (ocupa ~90 % del ancho disponible). */
export function ajustar(piezas, W = 360) {
  const c0 = camera({ scale: 1 }), pts = [];
  for (const pz of piezas) for (const f of box(c0, pz.g)) pts.push(...f.pts);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const s = (W * 0.92) / (maxx - minx), pad = 26, H = Math.ceil((maxy - miny) * s + pad * 2);
  return { cam: camera({ scale: s, origin: [W / 2 - ((minx + maxx) / 2) * s, pad - miny * s] }), width: W, height: H };
}

/**
 * Pinta la figura en `host`. opts: { linea, valores: {nodoId: texto|null}, activos: Set de nodoId, ir(ruta), movimientos: [{de, a}] }.
 * Devuelve { actualizar(valores, activos), mover(de, a), parar() }.
 */
export function montar(host, { linea, valores = {}, activos = new Set(), ir = () => {} }) {
  const def = LINEAS[linea];
  if (!def) return null;
  if (!document.getElementById('dw-iso-css')) { const st = document.createElement('style'); st.id = 'dw-iso-css'; st.textContent = ISO_CSS + `
.dw-isob{display:grid;gap:10px}.dw-iso text{font:600 11px system-ui,sans-serif;fill:var(--bs-body-color);paint-order:stroke;stroke:var(--bs-body-bg);stroke-width:3px;text-anchor:middle;pointer-events:none}
.dw-iso text.n{font-size:13px;font-weight:800}.dw-iso [data-luz] path{filter:brightness(1.22) saturate(1.15)}.dw-isoc{font-size:.9rem}`; document.head.appendChild(st); }
  const piezas = escena(def), problemas = auditar(piezas);
  if (problemas.length) { console.warn('inicio: figura con piezas que se atraviesan', problemas); return null; }
  const { cam, width, height } = ajustar(piezas);
  host.innerHTML = `<div class="dw-isob"><div data-fig></div><div class="dw-isoc text-body-secondary" data-info aria-live="polite">${def.frase}</div></div>`;
  const fig = host.querySelector('[data-fig]'), info = host.querySelector('[data-info]');
  fig.innerHTML = svg(cam, piezas, { width, height, titulo: `Así funciona tu negocio: ${def.nombre}` });
  const el = fig.querySelector('svg'), pos = (id) => encima(cam, piezas.find((p) => p.id === id).g);
  let vals = valores, act = activos;
  function pintarDatos() {
    el.querySelectorAll('text').forEach((t) => t.remove());
    for (const n of def.nodos) {
      const g = el.querySelector(`[data-nodo="${n.id}"]`), [px, py] = pos(`placa-${n.id}`), on = act.has(n.id);
      g.toggleAttribute('data-apagado', !on); g.toggleAttribute('data-luz', on && n.id === def.luz);
      g.setAttribute('aria-label', `${n.etiqueta}${on && vals[n.id] != null ? `: ${vals[n.id]}` : on ? '' : ' (apagado)'}`);
      const v = document.createElementNS('http://www.w3.org/2000/svg', 'text'), t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      v.setAttribute('class', 'n'); v.setAttribute('x', px); v.setAttribute('y', py - 5); v.textContent = on && vals[n.id] != null ? String(vals[n.id]).slice(0, 12) : '';
      t.setAttribute('x', px); t.setAttribute('y', py - 19); t.textContent = n.etiqueta;
      el.append(v, t);
    }
  }
  function abrir(id) {
    const n = def.nodos.find((x) => x.id === id), on = act.has(id);
    info.innerHTML = on ? `<b>${n.etiqueta}</b>${vals[id] != null ? `: ${String(vals[id]).replace(/[<>&]/g, '')}` : ''} · <a href="${n.ruta}" data-ir>Abrir</a>` : `<b>${n.etiqueta}</b>: este módulo no está activo para tu negocio.`;
  }
  el.addEventListener('click', (e) => { const g = e.target.closest('[data-nodo]'); if (g) abrir(g.dataset.nodo); });
  el.addEventListener('keydown', (e) => { const g = (e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-nodo]'); if (g) { e.preventDefault(); abrir(g.dataset.nodo); } });
  info.addEventListener('click', (e) => { const a = e.target.closest('[data-ir]'); if (a) { e.preventDefault(); ir(a.getAttribute('href')); } });
  pintarDatos();
  // Paquete que viaja por la cinta de una etapa a otra (solo si están en la figura)
  const flujo = (tipo) => def.flujos?.[tipo] || null;
  const mover = (de, a) => { if (!de || !a || de === a || !piezas.some((p) => p.id === de) || !piezas.some((p) => p.id === a)) return; viaje(el, [pos(de), pos(a)], { ms: 1400 }); };
  return { actualizar(v, a) { vals = v; act = a; pintarDatos(); }, mover, flujo };
}

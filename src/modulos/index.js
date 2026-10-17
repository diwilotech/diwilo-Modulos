// Registro de los módulos horizontales. Para agregar uno: su carpeta en src/modulos/<id>/ (modulo.json, api.js, ia.js),
// su migración en migrations/, su página en public/m/<id>.html + .js, sus pruebas en tests/ y su línea aquí.
import * as finanzas from './finanzas/api.js';
import finanzasIa from './finanzas/ia.js';
import finanzasManifest from './finanzas/modulo.json';
import * as marketing from './marketing/api.js';
import marketingIa from './marketing/ia.js';
import marketingManifest from './marketing/modulo.json';
import * as marca from './marca/api.js';
import marcaIa from './marca/ia.js';
import marcaManifest from './marca/modulo.json';

export const MODULOS = [
  { manifest: finanzasManifest, api: finanzas, tools: finanzasIa },
  { manifest: marketingManifest, api: marketing, tools: marketingIa },
  { manifest: marcaManifest, api: marca, tools: marcaIa },
];

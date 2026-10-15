// Ids de los módulos (carpetas de src/modulos/). Lo usa el probador.
import { readdirSync, statSync } from 'node:fs';
export const MODULOS_IDS = readdirSync('src/modulos').filter((d) => statSync(`src/modulos/${d}`).isDirectory());

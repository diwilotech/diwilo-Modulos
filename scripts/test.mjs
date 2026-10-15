// Prueba los módulos centrales de punta a punta: una COPIA de la Plantilla App Diwilo (nunca la original) que los usa
// por RPC + este Worker, en local. Corre las pruebas de la app y las de tests/*.test.mjs. Debe terminar en «Todo bien».
//   npm test                       (base: ../Control de Academia o PLANTILLA_DIWILO)
import { cpSync, mkdtempSync, symlinkSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { MODULOS_IDS } from './ids.mjs';

const central = resolve('.');
const plantilla = resolve(process.env.PLANTILLA_DIWILO || '../Control de Academia');
const dir = mkdtempSync(join(tmpdir(), 'diwilo-modulos-'));
console.log(`Copia de la plantilla en ${dir}`);
cpSync(plantilla, dir, { recursive: true, filter: (s) => !/\/(node_modules|\.wrangler|\.git)(\/|$)/.test(s) && !s.endsWith('.dev.vars') });
if (existsSync(join(plantilla, 'node_modules'))) symlinkSync(join(plantilla, 'node_modules'), join(dir, 'node_modules'));
else execSync('npm install --silent --no-audit --no-fund', { cwd: dir, stdio: 'inherit' });

// La copia usa todos los módulos centrales y lleva sus pruebas
const man = JSON.parse(readFileSync(join(dir, 'modulos.app.json'), 'utf8'));
man.centrales = MODULOS_IDS;
writeFileSync(join(dir, 'modulos.app.json'), JSON.stringify(man, null, 2));
mkdirSync(join(dir, 'tests/modulos'), { recursive: true });
for (const f of readdirSync('tests').filter((x) => x.endsWith('.test.mjs'))) cpSync(join('tests', f), join(dir, 'tests/modulos', f));

const run = (cmd) => execSync(cmd, { cwd: dir, stdio: 'inherit', env: { ...process.env, DIWILO_MODULOS: central } });
run('npm run --silent db:migrate:local');
run('npm run --silent test');

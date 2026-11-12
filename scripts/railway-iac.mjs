// Lanza `railway config <plan|apply>` asegurándose de usar el EJECUTABLE REAL de la CLI.
//
// Uso (vía package.json):  npm run infra:plan   /   npm run infra:apply
//
// Por qué existe este script:
// El SDK de IaC (paquete `railway`) comprueba la versión de la CLI ejecutando `railway --version`
// SIN shell. En Windows eso solo encuentra archivos .exe, pero si instalaste la CLI con npm,
// `railway` es un script `railway.cmd` que arranca node → el SDK no encuentra nada y dice
// "requires Railway CLI 5.42.1 or newer" aunque tengas la última versión.
// El SDK acepta que le digamos dónde está el ejecutable con la variable de entorno `_`.
// Este script lo busca, lo descarga si npm bloqueó su instalación, y lo pasa en `_`.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const EXE = process.platform === 'win32' ? 'railway.exe' : 'railway';
const args = process.argv.slice(2);

if (!['plan', 'apply'].includes(args[0] ?? '')) {
  console.error('Uso: node scripts/railway-iac.mjs <plan|apply> [opciones de railway config]');
  process.exit(2);
}

/** Carpeta del paquete @railway/cli instalado con `npm i -g`, si existe. */
function npmCliPackageDir() {
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dir = path.join(root, '@railway', 'cli');
    return existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

/** Busca el ejecutable real de la CLI de Railway. */
function findRailwayBinary() {
  // 1. Si el usuario lo indicó explícitamente.
  if (process.env.RAILWAY_BIN && existsSync(process.env.RAILWAY_BIN)) return process.env.RAILWAY_BIN;

  // 2. Instalado con npm: el binario vive dentro del paquete, en bin/.
  const pkg = npmCliPackageDir();
  if (pkg) {
    const bin = path.join(pkg, 'bin', EXE);
    if (existsSync(bin)) return bin;

    // El paquete está, pero sin el binario: npm bloqueó el script `postinstall` que lo descarga
    // (aviso "allow-scripts" al instalar). Ejecutamos ese instalador oficial de Railway.
    const installer = path.join(pkg, 'npm-install', 'postinstall.js');
    if (existsSync(installer)) {
      console.log('La CLI de Railway está instalada sin su ejecutable (npm bloqueó su postinstall).');
      console.log('Descargándolo con el instalador oficial del paquete @railway/cli...\n');
      const res = spawnSync(process.execPath, [installer], { stdio: 'inherit', cwd: pkg });
      if (res.status === 0 && existsSync(bin)) return bin;
    }
  }

  // 3. Instalado de otra forma (Scoop, instalador oficial...): un railway(.exe) real en el PATH.
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, EXE);
    // En Linux/macOS el shim de npm en el PATH es un enlace al railway.js, no al binario: lo saltamos.
    if (existsSync(candidate) && !candidate.includes(`${path.sep}node_modules${path.sep}.bin`)) return candidate;
  }
  return null;
}

const bin = findRailwayBinary();
if (!bin) {
  console.error(
    'No encontré el ejecutable de la CLI de Railway.\n' +
      'Instálala con:  npm i -g @railway/cli@latest\n' +
      'o indica dónde está:  $env:RAILWAY_BIN = "C:\\ruta\\a\\railway.exe"',
  );
  process.exit(1);
}

const version = spawnSync(bin, ['--version'], { encoding: 'utf8' }).stdout?.trim();
console.log(`Usando ${bin} (${version || 'versión desconocida'})\n`);

// `_` es la variable que el SDK de IaC consulta para saber qué ejecutable de railway usar.
const result = spawnSync(bin, ['config', ...args], {
  stdio: 'inherit',
  env: { ...process.env, _: bin },
});
process.exit(result.status ?? 1);

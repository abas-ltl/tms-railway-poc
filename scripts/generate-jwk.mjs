// Genera el par de claves RSA con el que auth firma los JWT.
//
// Uso:  node scripts/generate-jwk.mjs
//
// - Escribe .env en la raíz con JWT_PRIVATE_JWK=... (docker compose lo lee solo).
// - Imprime el mismo valor para pegarlo en Railway como variable SELLADA del servicio auth.
//
// Usamos el formato JWK (JSON) en vez de PEM porque cabe en UNA línea:
// un PEM tiene saltos de línea y eso da guerra en archivos .env y en algunos paneles.
// Solo usa módulos de Node (sin npm install), así que funciona recién clonado el repo.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = privateKey.export({ format: 'jwk' });

// El kid ("key id") identifica esta clave. Los tokens lo llevan en su encabezado y los
// verificadores lo usan para elegir la clave pública correcta del JWKS.
const today = new Date().toISOString().slice(0, 10);
const value = JSON.stringify({ ...jwk, kid: `tms-${today}`, alg: 'RS256', use: 'sig' });

if (existsSync('.env') && !process.argv.includes('--force')) {
  console.error('Ya existe .env. Usa --force para reemplazarlo (los tokens emitidos con la clave vieja dejarán de valer).');
  process.exit(1);
}

// Comillas simples: docker compose toma el valor literal, sin interpretar el JSON.
writeFileSync('.env', `JWT_PRIVATE_JWK='${value}'\n`);
console.log('.env escrito. Valor para Railway (variable sellada JWT_PRIVATE_JWK del servicio auth):\n');
console.log(value);

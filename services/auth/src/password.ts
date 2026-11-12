import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Hash de contraseñas con scrypt, que viene incluido en Node (sin dependencias nativas
 * como bcrypt, que a veces dan problemas al compilar dentro de Docker).
 *
 * scrypt es deliberadamente lento y gasta memoria: si alguien roba la tabla,
 * probar millones de contraseñas le sale carísimo.
 */
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  // Una sal aleatoria por usuario: dos usuarios con la misma contraseña tienen hashes distintos.
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  // timingSafeEqual tarda lo mismo acierte o falle: no filtra pistas por el tiempo de respuesta.
  return timingSafeEqual(actual, expected);
}

/**
 * Hash de relleno. Cuando el email no existe, igual verificamos contra este hash
 * para que "usuario inexistente" y "contraseña incorrecta" tarden lo mismo.
 * Si no, midiendo el tiempo se podría averiguar qué emails están registrados.
 */
export const DUMMY_HASH = await hashPassword('dummy-password-never-used');

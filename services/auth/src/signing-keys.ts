import { importJWK, type CryptoKey, type JWK } from 'jose';

/**
 * El par de claves de firma, cargado una sola vez al arrancar.
 *
 * - privateKey: firma los tokens. Solo existe dentro de este servicio.
 * - publicJwk: lo que publicamos en /.well-known/jwks.json para que
 *   gateway y orders verifiquen. Se deriva de la privada quitando las partes secretas.
 */
export interface SigningKeys {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

export const SIGNING_KEYS = Symbol('SIGNING_KEYS');

/** Campos de una clave RSA en JWK que son SECRETOS. Nunca deben salir del servicio. */
const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi'] as const;

export async function loadSigningKeys(privateJwkJson: string): Promise<SigningKeys> {
  let jwk: JWK;
  try {
    jwk = JSON.parse(privateJwkJson) as JWK;
  } catch {
    throw new Error('JWT_PRIVATE_JWK no es un JSON válido. Genera uno con: node scripts/generate-jwk.mjs');
  }
  if (jwk.kty !== 'RSA' || !jwk.d || !jwk.kid) {
    throw new Error('JWT_PRIVATE_JWK debe ser una clave RSA privada con "kid"');
  }

  const privateKey = (await importJWK(jwk, 'RS256')) as CryptoKey;

  const publicJwk: JWK = { ...jwk };
  for (const field of PRIVATE_FIELDS) delete publicJwk[field];

  return { kid: jwk.kid, privateKey, publicJwk };
}

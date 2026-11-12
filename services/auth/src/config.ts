/**
 * Toda la configuración del servicio sale de variables de entorno.
 *
 * Por qué: el MISMO contenedor corre en tu PC (docker compose) y en Railway.
 * Lo único que cambia entre ambos es el valor de estas variables.
 * Si falta una obligatoria, el servicio se niega a arrancar: es mejor un deploy
 * fallido con un mensaje claro que un servicio "vivo" que falla en la primera petición.
 */
export interface AuthConfig {
  port: number;
  databaseUrl: string;
  /** Clave privada en formato JWK (JSON). Secreta: en Railway, variable sellada. */
  privateJwk: string;
  issuer: string;
  audience: string;
  /** Vida del access token, en formato de jose: '15m', '1h'... */
  tokenTtl: string;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function loadConfig(): AuthConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    databaseUrl: required('DATABASE_URL'),
    privateJwk: required('JWT_PRIVATE_JWK'),
    issuer: process.env.JWT_ISSUER ?? 'tms-auth',
    audience: process.env.JWT_AUDIENCE ?? 'tms-api',
    tokenTtl: process.env.JWT_TTL ?? '15m',
  };
}

/** Configuración de orders, toda desde variables de entorno (ver services/auth/src/config.ts). */
export interface OrdersConfig {
  port: number;
  databaseUrl: string;
  /** Dónde está el JWKS de auth. En Railway: http://${{auth.RAILWAY_PRIVATE_DOMAIN}}:${{auth.PORT}}/.well-known/jwks.json */
  jwksUrl: string;
  issuer: string;
  audience: string;
}

export const ORDERS_CONFIG = Symbol('ORDERS_CONFIG');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function loadConfig(): OrdersConfig {
  return {
    port: Number(process.env.PORT ?? 3002),
    databaseUrl: required('DATABASE_URL'),
    jwksUrl: required('AUTH_JWKS_URL'),
    issuer: process.env.JWT_ISSUER ?? 'tms-auth',
    audience: process.env.JWT_AUDIENCE ?? 'tms-api',
  };
}

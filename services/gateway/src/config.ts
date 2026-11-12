/** Configuración del gateway, toda desde variables de entorno. */
export interface GatewayConfig {
  port: number;
  /** URL interna de auth. En Railway: http://${{auth.RAILWAY_PRIVATE_DOMAIN}}:${{auth.PORT}} */
  authUrl: string;
  /** URL interna de orders. En Railway: http://${{orders.RAILWAY_PRIVATE_DOMAIN}}:${{orders.PORT}} */
  ordersUrl: string;
  jwksUrl: string;
  issuer: string;
  audience: string;
  /** Orígenes (dominios del frontend) a los que el navegador puede llamar. Vacío = ninguno. */
  corsOrigins: string[];
  /**
   * Cuántos proxies hay delante del gateway. En Railway hay uno (su borde/edge), que pone
   * la IP real del cliente en X-Forwarded-For. Con 1, Express usa esa IP en req.ip,
   * y el límite de peticiones cuenta por cliente real y no por "la IP de Railway".
   */
  trustProxy: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/** Quita la barra final para poder concatenar rutas sin dobles barras. */
const trimSlash = (url: string) => url.replace(/\/+$/, '');

export function loadConfig(): GatewayConfig {
  const authUrl = trimSlash(required('AUTH_URL'));
  return {
    port: Number(process.env.PORT ?? 8080),
    authUrl,
    ordersUrl: trimSlash(required('ORDERS_URL')),
    // Por defecto el JWKS está en auth; se puede sobreescribir si algún día cambia.
    jwksUrl: process.env.AUTH_JWKS_URL ?? `${authUrl}/.well-known/jwks.json`,
    issuer: process.env.JWT_ISSUER ?? 'tms-auth',
    audience: process.env.JWT_AUDIENCE ?? 'tms-api',
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  };
}

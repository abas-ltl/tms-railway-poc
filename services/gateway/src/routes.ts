import type { GatewayConfig } from './config.js';

/**
 * La tabla de rutas: la pieza central del gateway.
 *
 * Cada entrada dice: "lo que llegue con este prefijo público, mándalo a este servicio interno".
 * Agregar un servicio nuevo (tracking, billing...) = agregar una entrada aquí
 * y una variable de entorno con su URL interna.
 */
export interface Route {
  /** Prefijo público, tal como lo ve el navegador. */
  prefix: string;
  /** URL base del servicio interno. */
  target: string;
  /**
   * true  → se quita el prefijo: /auth/login llega a auth como /login.
   * false → se reenvía tal cual: /orders/123 llega a orders como /orders/123.
   */
  stripPrefix: boolean;
  /** Rutas públicas (login, registro) no exigen JWT. Todo lo demás, sí. */
  public: boolean;
}

export function buildRoutes(config: GatewayConfig): Route[] {
  return [
    { prefix: '/auth', target: config.authUrl, stripPrefix: true, public: true },
    { prefix: '/orders', target: config.ordersUrl, stripPrefix: false, public: false },
  ];
}

/** ¿Este path pertenece a esta ruta? "/orders" y "/orders/..." sí; "/ordersxyz" no. */
export function matches(route: Route, path: string): boolean {
  return path === route.prefix || path.startsWith(`${route.prefix}/`);
}

export function findRoute(routes: Route[], path: string): Route | undefined {
  return routes.find((route) => matches(route, path));
}

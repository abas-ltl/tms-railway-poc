import { AuthError, extractBearer, type JwtVerifier } from '@tms/auth-jwt';
import type { NextFunction, Request, Response } from 'express';
import { findRoute, type Route } from '../routes.js';

/**
 * Cabeceras que solo el sistema puede poner. Si llegan desde internet, alguien intenta
 * hacerse pasar por otro (p. ej. mandando "x-user-id: <id de otra persona>"), así que se borran.
 * Hoy nuestros servicios no leen ninguna, pero borrarlas en la puerta evita que mañana
 * alguien añada una y abra un agujero sin darse cuenta.
 */
const INTERNAL_HEADER = /^x-(user|internal)-/i;

/**
 * Eslabón de autenticación. Por qué es un middleware y no un Guard de Nest:
 * los guards solo corren antes de un controlador de Nest, y las peticiones que van
 * al proxy nunca llegan a un controlador. Un middleware corre para TODAS las peticiones.
 */
export function authenticate(routes: Route[], verify: JwtVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const header of Object.keys(req.headers)) {
      if (INTERNAL_HEADER.test(header)) delete req.headers[header];
    }

    const route = findRoute(routes, req.path);
    // Sin ruta (p. ej. /health del propio gateway) o ruta pública (login): pasa sin token.
    // Las preflight de CORS (OPTIONS) tampoco llevan token; el middleware de CORS ya las respondió.
    if (!route || route.public) return next();

    try {
      // Verificamos y descartamos el resultado: aquí solo decidimos si pasa o no.
      // La cabecera Authorization sigue intacta hacia el servicio, que vuelve a verificar
      // y saca la identidad del token él mismo.
      await verify(extractBearer(req.headers.authorization));
      next();
    } catch (err) {
      if (err instanceof AuthError) {
        // Una línea por rechazo: el motivo real (de jose) va al log, nunca al cliente.
        const reason = err.cause instanceof Error ? err.cause.message : err.message;
        console.warn(`[gateway] JWT rechazado: ${err.code} (${reason}) id=${req.headers['x-request-id']}`);
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  };
}

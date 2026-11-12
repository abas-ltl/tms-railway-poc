import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Primer eslabón de la cadena. Le pone a cada petición un id único (x-request-id)
 * y registra una línea de log cuando termina.
 *
 * El id viaja al servicio interno (lo añade el proxy) y vuelve en la respuesta.
 * Así, si un usuario reporta un error, con ese id encuentras su petición en los logs
 * del gateway Y en los de orders, aunque Railway los muestre en pantallas distintas.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && UUID.test(incoming) ? incoming : randomUUID();

  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);

  const started = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - started);
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} ${ms}ms id=${id}`);
  });

  next();
}

import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request, Response } from 'express';
import { matches, type Route } from '../routes.js';

/**
 * Último eslabón: reenvía la petición al servicio interno y devuelve su respuesta tal cual.
 * Se crea un proxy por cada entrada de la tabla de rutas.
 */
export function proxyFor(route: Route) {
  return createProxyMiddleware<Request, Response>({
    target: route.target,
    // Solo actúa sobre su prefijo; el resto de peticiones sigue de largo (next()).
    pathFilter: (path) => matches(route, path),
    pathRewrite: route.stripPrefix ? { [`^${route.prefix}`]: '' } : undefined,
    // Cambia la cabecera Host a la del servicio interno (auth.railway.internal...).
    changeOrigin: true,
    // Añade X-Forwarded-For/Proto/Host para que el servicio sepa quién llamó originalmente.
    xfwd: true,
    // Si el servicio no responde en 10 s, cortamos: el usuario recibe 504 en vez de esperar para siempre.
    proxyTimeout: 10_000,
    on: {
      proxyReq: (proxyReq, req) => {
        // El id de la petición viaja al servicio interno para poder cruzar logs.
        proxyReq.setHeader('x-request-id', String(req.headers['x-request-id']));
      },
      // El servicio interno no respondió (caído, reiniciándose, timeout).
      // 502 Bad Gateway = "yo estoy bien, el de atrás no". Respondemos JSON como el resto de
      // la API y no filtramos detalles internos (hosts, puertos) al cliente.
      error: (err, req, res) => {
        console.error(`[gateway] ${route.prefix} no responde: ${err.message} id=${req.headers['x-request-id']}`);
        if (!('writeHead' in res)) return res.destroy(); // conexión WebSocket: solo se cierra
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
        }
        res.end(JSON.stringify({ error: 'bad_gateway', message: 'Servicio no disponible, intenta de nuevo' }));
      },
    },
  });
}

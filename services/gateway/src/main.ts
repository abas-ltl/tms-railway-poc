import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createJwtVerifier } from '@tms/auth-jwt';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { authenticate } from './middlewares/authenticate.js';
import { proxyFor } from './middlewares/proxy.js';
import { requestId } from './middlewares/request-id.js';
import { buildRoutes } from './routes.js';

async function bootstrap() {
  const config = loadConfig();
  const routes = buildRoutes(config);
  const verify = createJwtVerifier({
    jwksUrl: config.jwksUrl,
    issuer: config.issuer,
    audience: config.audience,
  });

  // bodyParser: false → Nest NO lee el cuerpo de la petición. Si lo leyera (para convertirlo
  // en JSON), el flujo de datos quedaría consumido y el proxy reenviaría un cuerpo vacío.
  // El gateway no necesita entender el cuerpo: solo lo deja pasar.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  app.set('trust proxy', config.trustProxy);

  // ─── La cadena, en orden. Cada eslabón puede responder y cortar, o pasar al siguiente. ───

  // 1. Id de petición + log de acceso (primero, para que hasta los rechazos queden registrados).
  app.use(requestId);

  // 2. Cabeceras de seguridad estándar.
  app.use(helmet());

  // 3. CORS: qué páginas web pueden llamar a esta API desde el navegador.
  //    También responde las peticiones "preflight" (OPTIONS) que el navegador manda antes.
  app.enableCors({ origin: config.corsOrigins.length ? config.corsOrigins : false });

  // 4. Límite de peticiones por IP. El login tiene uno más estricto: frena a quien
  //    prueba contraseñas por fuerza bruta.
  //    Ojo: el contador vive en la memoria de ESTE proceso. Con 2 réplicas del gateway, cada una
  //    cuenta por su lado. Para eso, más adelante, el contador iría a Redis.
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'rate_limited', message: 'Demasiadas peticiones, espera un minuto' },
    });
  app.use('/auth/login', limiter(10));
  app.use(limiter(300));

  // 5. Autenticación: rutas no públicas exigen un JWT válido.
  app.use(authenticate(routes, verify));

  // 6. Proxy: un middleware por servicio interno.
  for (const route of routes) app.use(proxyFor(route));

  // Lo que no tomó ningún proxy cae en los controladores de Nest (/health) o en un 404.

  // Sin host: Node usa '::' (IPv6 + IPv4) si hay IPv6. Ver services/auth/src/main.ts.
  // El tráfico público, Railway se lo entrega al gateway en el puerto PORT.
  await app.listen(config.port);
  console.log(`gateway escuchando en el puerto ${config.port}`);
  for (const route of routes) {
    console.log(`  ${route.prefix} → ${route.target}${route.public ? ' (pública)' : ' (requiere JWT)'}`);
  }
}

await bootstrap();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  // Escucha SIGTERM/SIGINT para ejecutar onApplicationShutdown (cierre ordenado).
  app.enableShutdownHooks();

  // Sin indicar host a propósito. Node escucha entonces en '::' (todas las interfaces,
  // IPv6 + IPv4) si la máquina tiene IPv6, o en '0.0.0.0' (solo IPv4) si no lo tiene.
  // Railway necesita lo primero: su red privada usa IPv6 (en entornos antiguos, SOLO IPv6).
  // El error típico es escribir app.listen(port, '0.0.0.0'): funciona en tu PC, pero en
  // Railway el gateway no podría alcanzarnos por auth.railway.internal.
  await app.listen(config.port);
  console.log(`auth escuchando en el puerto ${config.port}`);
}

await bootstrap();

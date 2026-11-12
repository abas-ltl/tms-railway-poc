import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // Sin host: Node usa '::' (IPv6 + IPv4) si hay IPv6. Ver services/auth/src/main.ts.
  await app.listen(config.port);
  console.log(`orders escuchando en el puerto ${config.port}`);
}

await bootstrap();

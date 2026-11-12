import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/**
 * El gateway casi no usa la inyección de dependencias de Nest: su trabajo es una cadena
 * de middlewares que se monta en main.ts, donde se ve el orden de un vistazo.
 * Nest aporta el servidor HTTP, el ciclo de vida (apagado ordenado) y los controladores
 * propios del gateway, que hoy son solo /health.
 */
@Module({
  controllers: [HealthController],
})
export class AppModule {}

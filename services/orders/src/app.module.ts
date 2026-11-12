import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createJwtVerifier } from '@tms/auth-jwt';
import type pg from 'pg';
import { loadConfig, ORDERS_CONFIG, type OrdersConfig } from './config.js';
import { createPool, PG_POOL } from './database.js';
import { HealthController } from './health.controller.js';
import { JWT_VERIFIER, JwtAuthGuard } from './jwt-auth.guard.js';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';

@Module({
  controllers: [OrdersController, HealthController],
  providers: [
    { provide: ORDERS_CONFIG, useFactory: loadConfig },
    {
      provide: PG_POOL,
      inject: [ORDERS_CONFIG],
      useFactory: (config: OrdersConfig) => createPool(config.databaseUrl),
    },
    {
      // El MISMO verificador que usa el gateway, del paquete compartido @tms/auth-jwt.
      provide: JWT_VERIFIER,
      inject: [ORDERS_CONFIG],
      useFactory: (config: OrdersConfig) =>
        createJwtVerifier({ jwksUrl: config.jwksUrl, issuer: config.issuer, audience: config.audience }),
    },
    JwtAuthGuard,
    OrdersRepository,
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

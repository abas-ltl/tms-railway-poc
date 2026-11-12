import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';
import { AuthController } from './auth.controller.js';
import { AUTH_CONFIG, loadConfig, type AuthConfig } from './config.js';
import { createPool, PG_POOL } from './database.js';
import { HealthController } from './health.controller.js';
import { loadSigningKeys, SIGNING_KEYS } from './signing-keys.js';
import { TokensService } from './tokens.service.js';
import { UsersRepository } from './users.repository.js';

/**
 * El módulo es la "lista de piezas" del servicio y cómo se conectan.
 * Nest lee esto al arrancar y construye cada pieza inyectándole lo que pide en su constructor.
 */
@Module({
  controllers: [AuthController, HealthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadConfig },
    {
      provide: PG_POOL,
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => createPool(config.databaseUrl),
    },
    {
      // useFactory puede ser async: Nest espera a que la clave esté importada antes de arrancar.
      provide: SIGNING_KEYS,
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => loadSigningKeys(config.privateJwk),
    },
    UsersRepository,
    TokensService,
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** Railway manda SIGTERM antes de apagar un contenedor: cerramos las conexiones con orden. */
  async onApplicationShutdown() {
    await this.pool.end();
  }
}

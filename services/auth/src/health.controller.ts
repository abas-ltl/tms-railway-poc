import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from './database.js';

/**
 * Railway llama a esta ruta tras cada deploy (si configuras el "Healthcheck Path").
 * Solo cuando responde 200 da el deploy por bueno y le pasa el tráfico.
 * Por eso comprobamos la base: un auth sin base no está realmente "sano".
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  @Get()
  async check() {
    try {
      await this.pool.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', service: 'auth', db: 'down' });
    }
    return { status: 'ok', service: 'auth' };
  }
}

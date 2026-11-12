import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from './database.js';

/** Sin guard: Railway debe poder llamarla sin token. Comprueba la base, como en auth. */
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  @Get()
  async check() {
    try {
      await this.pool.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', service: 'orders', db: 'down' });
    }
    return { status: 'ok', service: 'orders' };
  }
}

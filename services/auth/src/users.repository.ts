import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from './database.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  roles: string[];
}

/**
 * El único lugar del servicio que escribe SQL sobre usuarios.
 * Los controladores no saben que existe Postgres; solo llaman a estos métodos.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** Devuelve null si el email ya existe (lo decide el índice único, no un SELECT previo). */
  async create(email: string, passwordHash: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO auth.users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, password_hash, roles`,
      [email, passwordHash],
    );
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash, roles FROM auth.users WHERE email = $1',
      [email],
    );
    return rows[0] ?? null;
  }
}

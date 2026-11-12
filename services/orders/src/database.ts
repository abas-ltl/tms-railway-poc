import pg from 'pg';

/** Pool de conexiones a Postgres (ver la explicación en services/auth/src/database.ts). */
export const PG_POOL = Symbol('PG_POOL');

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 5 });
}

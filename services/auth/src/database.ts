import pg from 'pg';

/**
 * Pool de conexiones a Postgres.
 *
 * Un pool mantiene unas pocas conexiones abiertas y las presta a cada consulta,
 * en vez de abrir y cerrar una conexión por petición (que es lento).
 * Se conecta "perezosamente": no toca la base hasta la primera consulta, así que
 * el servicio arranca aunque la red privada de Railway tarde unos segundos en estar lista.
 */
export const PG_POOL = Symbol('PG_POOL');

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 5 });
}

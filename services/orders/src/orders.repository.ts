import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from './database.js';

export interface Order {
  id: string;
  ownerId: string;
  origin: string;
  destination: string;
  weightKg: number;
  status: string;
  createdAt: string;
}

export interface NewOrder {
  origin: string;
  destination: string;
  weightKg: number;
}

/** Convierte la fila de Postgres (snake_case) al objeto de la API (camelCase). */
function toOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    origin: String(row.origin),
    destination: String(row.destination),
    // numeric llega como string desde pg (para no perder precisión); aquí basta con Number.
    weightKg: Number(row.weight_kg),
    status: String(row.status),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

@Injectable()
export class OrdersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async create(ownerId: string, input: NewOrder): Promise<Order> {
    const { rows } = await this.pool.query(
      `INSERT INTO orders.orders (owner_id, origin, destination, weight_kg)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ownerId, input.origin, input.destination, input.weightKg],
    );
    return toOrder(rows[0]);
  }

  /** Solo las órdenes de ESTE dueño: el filtro por owner_id es la autorización. */
  async listByOwner(ownerId: string): Promise<Order[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM orders.orders WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 100',
      [ownerId],
    );
    return rows.map(toOrder);
  }

  async findForOwner(id: string, ownerId: string): Promise<Order | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM orders.orders WHERE id = $1 AND owner_id = $2',
      [id, ownerId],
    );
    return rows[0] ? toOrder(rows[0]) : null;
  }
}

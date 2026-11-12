-- migrate:up
-- orders es dueño del esquema "orders". No hay clave foránea hacia auth.users a propósito:
-- son servicios separados y cada uno podría vivir en su propia base mañana.
-- El dueño de la orden se guarda como el "sub" del JWT, sin más.
CREATE SCHEMA IF NOT EXISTS orders;

CREATE TABLE orders.orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  origin      text NOT NULL,
  destination text NOT NULL,
  weight_kg   numeric(10, 2) NOT NULL CHECK (weight_kg > 0),
  status      text NOT NULL DEFAULT 'created',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- La consulta más común es "las órdenes de este usuario, las más nuevas primero".
CREATE INDEX orders_owner_created_idx ON orders.orders (owner_id, created_at DESC);

-- migrate:down
DROP TABLE orders.orders;
DROP SCHEMA orders;

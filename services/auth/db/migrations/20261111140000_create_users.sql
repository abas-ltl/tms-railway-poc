-- migrate:up
-- Cada servicio es dueño de su propio esquema dentro de la base. auth solo toca "auth.*".
-- Nadie más lee esta tabla: si orders necesita saber algo del usuario, lo saca del JWT.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Guardamos el email ya en minúsculas; el índice único impide duplicados.
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  -- Formato: scrypt$<sal>$<hash>. Nunca la contraseña en claro.
  password_hash text NOT NULL,
  roles         text[] NOT NULL DEFAULT ARRAY['user'],
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE auth.users;
DROP SCHEMA auth;

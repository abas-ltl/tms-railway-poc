/**
 * Infraestructura como código (IaC) de Railway para este proyecto.
 *
 * Este archivo DESCRIBE cómo debe estar el proyecto en Railway: qué servicios hay, de qué repo
 * se construyen, con qué Dockerfile, qué migraciones corren antes de desplegar y qué variables
 * tiene cada uno. No despliega nada por sí solo:
 *
 *   railway config plan    → compara este archivo con lo que hay en Railway y muestra las diferencias
 *   railway config apply   → aplica esas diferencias (pide confirmación)
 *
 * Una vez aplicado, cada `git push` a main redespliega SOLO los servicios cuyos archivos
 * cambiaron (eso lo deciden los watchPatterns de cada servicio).
 *
 * Qué se queda FUERA de este archivo, a propósito:
 *  - La clave privada del JWT: es un secreto y no va al repo. Se pone una vez a mano en
 *    Railway (sellada) y aquí se marca con preserve() = "no la toques".
 *  - La región y el dominio público del gateway: se configuran una vez en el panel.
 */
import { defineRailway, github, postgres, preserve, project, service } from 'railway/iac';

// ⚠️ Cambia esto por tu usuario/organización y nombre del repo en GitHub.
const REPO = 'abas-ltl/tms-railway-poc';
const BRANCH = 'main';

/**
 * Archivos que, si cambian, obligan a redesplegar a TODOS los servicios:
 * dependencias (lock) y la configuración común de TypeScript.
 */
const SHARED_FILES = ['package.json', 'package-lock.json', 'tsconfig.base.json'];

/** Emisor y audiencia del JWT: deben ser idénticos en auth, gateway y orders. */
const JWT_ISSUER = 'tms-auth';
const JWT_AUDIENCE = 'tms-api';

export default defineRailway(() => {
  // La base. El nombre "Postgres" debe coincidir con el servicio que ya existe en Railway:
  // así IaC lo reconoce y lo adopta en vez de crear otro.
  const db = postgres('Postgres');

  const auth = service('auth', {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: 'DOCKERFILE',
      // El Dockerfile se construye desde la raíz del repo (necesita el lock y los workspaces).
      dockerfilePath: 'services/auth/Dockerfile',
      // Solo se redespliega si cambia algo suyo o algo común.
      watchPatterns: ['services/auth/**', ...SHARED_FILES],
    },
    // Migraciones antes de desplegar. Si fallan, el deploy no avanza y sigue el anterior.
    preDeploy: 'npm --prefix /app/services/auth run migrate',
    healthcheck: '/health',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      PORT: '3001',
      DATABASE_URL: db.env.DATABASE_URL,
      JWT_ISSUER,
      JWT_AUDIENCE,
      JWT_TTL: '15m',
      // Secreto: se define a mano en Railway (sellado). IaC no lo lee ni lo pisa.
      JWT_PRIVATE_JWK: preserve(),
    },
  });

  const orders = service('orders', {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'services/orders/Dockerfile',
      // orders usa el paquete compartido: si cambia auth-jwt, orders se redespliega.
      watchPatterns: ['services/orders/**', 'packages/auth-jwt/**', ...SHARED_FILES],
    },
    preDeploy: 'npm --prefix /app/services/orders run migrate',
    healthcheck: '/health',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      PORT: '3002',
      DATABASE_URL: db.env.DATABASE_URL,
      // Sintaxis de plantilla de Railway: la resuelve Railway al desplegar
      // (http://auth.railway.internal:3001/...). Comillas normales, no `backticks`.
      AUTH_JWKS_URL: 'http://${{auth.RAILWAY_PRIVATE_DOMAIN}}:${{auth.PORT}}/.well-known/jwks.json',
      JWT_ISSUER,
      JWT_AUDIENCE,
    },
  });

  const gateway = service('gateway', {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'services/gateway/Dockerfile',
      watchPatterns: ['services/gateway/**', 'packages/auth-jwt/**', ...SHARED_FILES],
    },
    // Sin preDeploy: el gateway no tiene base de datos.
    healthcheck: '/health',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      PORT: '8080',
      AUTH_URL: 'http://${{auth.RAILWAY_PRIVATE_DOMAIN}}:${{auth.PORT}}',
      ORDERS_URL: 'http://${{orders.RAILWAY_PRIVATE_DOMAIN}}:${{orders.PORT}}',
      JWT_ISSUER,
      JWT_AUDIENCE,
      TRUST_PROXY: '1',
      // Cuando tengas frontend, añade aquí su dominio (varios, separados por coma):
      // CORS_ORIGINS: 'https://tms-web.up.railway.app',
    },
  });

  return project('tms-poc', { resources: [db, auth, orders, gateway] });
});

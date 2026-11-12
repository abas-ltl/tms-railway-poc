# tms-railway-poc

Prueba de concepto de la infraestructura del TMS: tres servicios NestJS separados, listos para Railway.

```
navegador ──► gateway (público) ──► auth   (privado)  ─┐
                                └──► orders (privado)  ─┴─► Postgres
```

| Servicio | Qué hace | Puerto | ¿Público? |
|---|---|---|---|
| `gateway` | CORS, límite de peticiones, verifica el JWT y reenvía | 8080 | Sí, el único |
| `auth` | Registro, login, firma JWT (RS256), publica el JWKS | 3001 | No |
| `orders` | Crea y lista órdenes de carga del usuario; vuelve a verificar el JWT | 3002 | No |
| `packages/auth-jwt` | La verificación de JWT, compartida por gateway y orders | — | — |

## Probarlo en tu PC (PowerShell, con Docker Desktop)

```powershell
node scripts/generate-jwk.mjs     # una vez: crea .env con la clave privada del JWT
docker compose up --build         # levanta postgres, migraciones, auth, orders y gateway
node scripts/smoke-test.mjs       # en otra terminal: 13 comprobaciones de punta a punta
```

¿No tienes Node instalado en Windows? Usa Node dentro de Docker, igual de válido:

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:24-slim node scripts/generate-jwk.mjs
docker compose up --build
docker run --rm --network tms-poc_default -v "${PWD}:/app" -w /app node:24-slim node scripts/smoke-test.mjs http://gateway:8080
```

## Documentación

1. [`docs/guia.md`](docs/guia.md): cómo funciona, por qué cada decisión, mapa de lectura del código y preguntas de repaso.
2. [`docs/despliegue-railway.md`](docs/despliegue-railway.md): despliegue en Railway con infraestructura como código. Cada `git push` redespliega solo lo que cambió.

## Infraestructura (Railway)

Todo el proyecto de Railway está descrito en [`.railway/railway.ts`](.railway/railway.ts):

```powershell
npm run infra:plan    # qué cambiaría en Railway (no toca nada)
npm run infra:apply   # aplicarlo (pide confirmación)
```
# tms-railway-poc

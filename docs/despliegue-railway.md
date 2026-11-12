# Desplegar en Railway con infraestructura como código

Objetivo: que el repo **describa** todo el proyecto de Railway y que cada `git push` despliegue
automáticamente lo que cambió.

## Cómo funciona, en una página

Hay **dos tipos de cambio**, y cada uno tiene su camino:

| Cambias… | Ejemplo | Qué haces | Qué pasa |
|---|---|---|---|
| **Código** | Un endpoint nuevo en orders | `git push` | Railway reconstruye **solo** los servicios cuyos archivos cambiaron, corre sus migraciones y, si el healthcheck pasa, les cambia el tráfico. |
| **Infraestructura** | Una variable nueva, un servicio nuevo, otro healthcheck | Editas `.railway/railway.ts`, luego `npm run infra:plan` y `npm run infra:apply` | Railway ajusta la configuración del proyecto para que coincida con el archivo. |

El archivo central es **`.railway/railway.ts`**. Ábrelo: declara Postgres y los tres
servicios, y para cada uno:
- de qué repo y rama se construye;
- qué Dockerfile usa;
- qué archivos lo redespliegan (`watchPatterns`);
- qué migraciones corren antes de desplegar (`preDeploy`);
- su healthcheck y sus variables.

> **Por qué no `railway.json`:** era el formato anterior ("Config as Code"). Railway lo marcó
> como obsoleto y deja de funcionar el **1 de diciembre de 2026**. Su reemplazo es este
> `.railway/railway.ts`, y una ventaja es que describe **todo el proyecto en un solo archivo**,
> no un archivo suelto por servicio.

### Cómo decide Railway qué redesplegar (`watchPatterns`)

| Si cambias… | Se redespliega |
|---|---|
| `services/auth/**` | solo auth |
| `services/orders/**` | solo orders |
| `services/gateway/**` | solo gateway |
| `packages/auth-jwt/**` (el paquete compartido) | gateway y orders, que lo usan |
| `package.json`, `package-lock.json`, `tsconfig.base.json` | los tres |
| `docs/**`, `scripts/**`, `.railway/**` | nada |

### Lo que se queda fuera del archivo, a propósito

- **La clave privada del JWT.** Un secreto no va al repo. En el archivo aparece como
  `preserve()`, que significa "existe en Railway, no la toques". La pones una vez a mano,
  sellada.
- **El dominio público del gateway y la región.** Se configuran una vez en el panel o con la
  CLI.

---

## Puesta en marcha (una sola vez)

### Paso 0. Requisitos

1. **Node 24 en Windows** (lo necesita la CLI de Railway). Comprueba con `node -v`.
2. **La CLI de Railway, versión 5.42.1 o mayor.** El motor de infraestructura como código vive
   en la CLI:
   ```powershell
   npm i -g @railway/cli
   railway --version
   railway login
   ```
3. **Tu cuenta de Railway conectada a GitHub**, con acceso al repo. Si no lo está:
   conecta tu cuenta de GitHub desde la configuración de tu cuenta en railway.com y dale acceso al repo.

### Paso 1. Subir el repo a GitHub

1. Edita **`.railway/railway.ts`** y cambia la línea `const REPO = 'TU_USUARIO/tms-railway-poc';`
   por tu usuario u organización y el nombre real del repo.
2. Instala dependencias y súbelo:
   ```powershell
   npm install
   git init
   git add .
   git commit -m "PoC gateway + auth + orders"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/tms-railway-poc.git
   git push -u origin main
   ```
   El `.env` no se sube: está en `.gitignore`.

### Paso 2. Preparar el proyecto en Railway

Usamos el proyecto `tms-poc` que ya creaste, con su servicio **Postgres**.

1. **Revisa el nombre de la base.** En el canvas tiene que llamarse exactamente `Postgres`.
   Si se llama distinto, renómbrala o cambia `postgres('Postgres')` en `railway.ts`. Así
   la infraestructura como código **adopta** la base existente en vez de crear otra.
2. **Si ya creaste un servicio desde "GitHub Repo"** en un intento anterior, renómbralo a
   `auth` (será adoptado) o bórralo. Si no, el plan propondrá crear `auth` aparte y ese
   servicio quedará huérfano.
3. Enlaza la carpeta con el proyecto:
   ```powershell
   railway link
   ```
   Elige tu workspace, el proyecto `tms-poc` y el entorno `production`.

### Paso 3. Revisar el plan

```powershell
npm run infra:plan
```

Es el paso de revisión: **compara** el archivo con Railway y **no cambia nada**. Deberías ver:
- `Postgres`: sin cambios, o como mucho ajustes menores.
- `auth`, `orders`, `gateway`: **se crean**, con su fuente de GitHub, su Dockerfile, sus
  watch patterns, su pre-deploy, su healthcheck y sus variables.

**Si el plan propone borrar algo que no esperas, no apliques.** Revisa los nombres del
paso 2 y vuelve a planificar.

### Paso 4. Aplicar

```powershell
npm run infra:apply
```

Te pide confirmación y crea los servicios. Railway empieza a construirlos de inmediato, y el
primer deploy de **auth fallará** con `Falta la variable de entorno JWT_PRIVATE_JWK`. Es lo
esperado: falta el secreto, y el servicio se niega a arrancar sin él. Eso hace el paso 5.

### Paso 5. El secreto de auth

1. En el panel: servicio **auth** → **Variables** → **New Variable**.
2. Nombre `JWT_PRIVATE_JWK`; valor, el JSON que imprimió `node scripts/generate-jwk.mjs`
   (también está en tu `.env`, entre las comillas simples).
3. Menú **⋮ → Seal**. Ya no se puede volver a leer en el panel; si un día hace falta cambiarla,
   se genera otra.
4. Pulsa **Deploy** en la barra de cambios pendientes.

En los logs de auth verás tres fases:
1. **Build**.
2. **Pre-deploy**: dbmate aplica la migración.
3. **Deploy**: `auth escuchando en el puerto 3001` y el healthcheck en verde.

### Paso 6. Dominio público del gateway y región

```powershell
railway domain --service gateway --port 8080
```

El puerto del dominio **debe ser igual** a `PORT` (8080). Si no coinciden, el dominio responde
error aunque el servicio esté sano: es el fallo más común en Railway.

**Región:** en cada servicio, *Settings → Deploy → Region* → **US East (Virginia)**, la misma
para los cuatro.

### Paso 7. Comprobar

```powershell
node scripts/smoke-test.mjs https://<dominio-del-gateway>
```

Si sale `Todo en orden.`, el sistema funciona en Railway igual que en tu PC.

---

## El día a día

**Cambio de código.** Por ejemplo, editas `services/orders/src/orders.controller.ts`:

```powershell
git add .
git commit -m "orders: filtrar por estado"
git push
```

Railway ve el commit, comprueba los `watchPatterns` y reconstruye **solo orders**. Corre sus
migraciones en el pre-deploy y le pasa el tráfico cuando `/health` responde. Si algo falla
(build, migración o healthcheck), **el deploy anterior sigue sirviendo**: nunca te quedas sin
servicio por un deploy roto.

**Migración nueva.** Crea el archivo en `services/orders/db/migrations/` y haz push. El
pre-deploy la aplica antes de arrancar el código nuevo.

**Cambio de infraestructura.** Por ejemplo, añadir `CORS_ORIGINS` al gateway:
1. Edita `.railway/railway.ts`.
2. `npm run infra:plan` y revisa.
3. `npm run infra:apply`.
4. `git commit` y `git push`, para que el repo y Railway sigan diciendo lo mismo.

> **No edites en el panel lo que gestiona `railway.ts`.** Si cambias a mano una variable que el
> archivo define, el próximo `apply` la devolverá a lo que diga el archivo. La regla: lo que
> está en el archivo se cambia en el archivo.

**Un servicio nuevo,** por ejemplo `tracking`:
1. Su carpeta en `services/tracking/` con su Dockerfile.
2. Una entrada `service('tracking', {...})` en `railway.ts`.
3. Su ruta en `services/gateway/src/routes.ts`.
4. `plan`, `apply` y push.

---

## Si algo falla

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| `infra:plan` dice que la CLI es antigua | La infraestructura como código necesita CLI 5.42.1 o mayor | `railway upgrade` |
| `infra:plan` no encuentra el proyecto | La carpeta no está enlazada | `railway link` |
| El plan quiere crear un segundo Postgres | El nombre no coincide | El nombre en el canvas vs. `postgres('...')` en `railway.ts` |
| Build falla con "repo not found" | Railway no tiene acceso al repo | La conexión de GitHub en tu cuenta de Railway (con acceso a ese repo), y que `REPO` esté bien escrito |
| auth no arranca: `Falta la variable JWT_PRIVATE_JWK` | Falta el secreto | Paso 5 |
| Pre-deploy falla con `SSL is not enabled on the server` | dbmate exige SSL por defecto | Con el Postgres de Railway no debería pasar. Si pasa, añade `?sslmode=disable` a la URL. |
| Healthcheck en rojo | El servicio no escucha en `PORT` | Las variables `PORT` y, en el gateway, el puerto del dominio |
| `/auth/login` responde `502` | El gateway no encuentra auth | El servicio debe llamarse exactamente `auth` (su dominio privado sale del nombre) |
| `/orders` responde `503 auth_unavailable` | No se puede descargar el JWKS | La variable `AUTH_JWKS_URL` de orders y la `AUTH_URL` del gateway |
| Un push no redesplegó un servicio | El cambio no coincide con sus `watchPatterns` | La tabla de watch patterns de arriba |

---

## Siguientes pasos posibles

1. **Aplicar la infraestructura desde GitHub Actions.** Railway ofrece una acción
   (`railwayapp/config`) que hace el `plan` en cada pull request y el `apply` al hacer merge.
   Así nadie tiene que correr `apply` a mano.
2. **Entorno `staging`.** El archivo recibe `ctx.environment`, así que puede dar valores
   distintos por entorno (más réplicas en producción, por ejemplo).
3. **Bases separadas por servicio, refresh tokens y el contador del límite de peticiones en
   Redis.**

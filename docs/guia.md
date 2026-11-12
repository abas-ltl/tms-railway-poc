# Guía: gateway + auth + orders como servicios separados

Esta guía acompaña al código. Léela con el código abierto al lado: cada sección te dice qué
archivo mirar y por qué está escrito así.

---

## 1. El concepto en una página

Tres programas independientes, cada uno en su contenedor. **Solo uno de ellos** (el gateway)
se puede alcanzar desde internet. Los otros dos viven en una red privada y solo hablan con
quien está dentro de esa red.

```
                 internet                 │            red privada
                                          │
navegador ── https ──► gateway :8080 ─────┼── http ──► auth :3001 ───┐
                       (puerta pública)   │                          ├──► Postgres
                                          └── http ──► orders :3002 ─┘
```

El viaje de una petición, de principio a fin:

1. **Registro y login.** El navegador manda `POST /auth/login` al gateway. Es una ruta
   pública, así que el gateway no pide token y la reenvía a auth como `POST /login`.
2. **auth firma un JWT.** Comprueba la contraseña y firma un token con su **clave privada**.
   El token dice "soy el usuario X, válido 15 minutos".
3. **Una ruta protegida.** El navegador manda `POST /orders` con `Authorization: Bearer <token>`.
4. **El gateway verifica.** Comprueba la firma con la **clave pública** de auth, que descargó
   una vez del JWKS y guarda en memoria. Si el token es falso o venció, responde `401` ahí
   mismo y orders nunca se entera.
5. **orders verifica otra vez** con el mismo código, saca del token quién es el usuario y
   guarda la orden a su nombre.

Una idea para quedarse: **la red privada protege qué se puede alcanzar; el JWT protege
quién puede hacer qué.** Son dos capas distintas y usamos las dos.

---

## 2. Mapa de lectura del código

Léelo en este orden. Cada paso usa lo anterior.

| # | Archivo | Qué vas a entender |
|---|---|---|
| 1 | `package.json` (raíz) | Qué es un monorepo con *npm workspaces* |
| 2 | `scripts/generate-jwk.mjs` | De dónde sale la clave privada y por qué está en formato JWK |
| 3 | `services/auth/src/config.ts` | Configuración solo por variables de entorno |
| 4 | `services/auth/db/migrations/*.sql` | El esquema propio de cada servicio |
| 5 | `services/auth/src/password.ts` | Cómo se guarda una contraseña |
| 6 | `services/auth/src/signing-keys.ts` | Clave privada vs. clave pública |
| 7 | `services/auth/src/tokens.service.ts` | Cómo se firma un JWT |
| 8 | `services/auth/src/auth.controller.ts` | Registro, login y JWKS |
| 9 | `packages/auth-jwt/src/index.ts` | **El corazón:** cómo se verifica un JWT |
| 10 | `services/orders/src/jwt-auth.guard.ts` | Verificar dentro de un servicio Nest (guard) |
| 11 | `services/orders/src/orders.controller.ts` | Usar la identidad del token |
| 12 | `services/gateway/src/routes.ts` | La tabla de rutas |
| 13 | `services/gateway/src/main.ts` | **La cadena de middlewares**, en orden |
| 14 | `services/gateway/src/middlewares/*.ts` | Cada eslabón por dentro |
| 15 | `services/*/Dockerfile` | Cómo se empaqueta cada servicio |
| 16 | `docker-compose.yml` | La réplica local de Railway |

---

## 3. Las decisiones y sus porqués

### Estructura

**Un repo con tres servicios (monorepo con npm workspaces).** Los tres comparten
`package-lock.json` y el paquete `packages/auth-jwt`. Cada servicio sigue siendo independiente
al desplegar: tiene su Dockerfile, su imagen y sus variables. Un repo por servicio también
funcionaría, pero obligaría a publicar `auth-jwt` como paquete npm y a sincronizar versiones
a mano. Para un equipo pequeño, el monorepo es más simple.

**La verificación del JWT vive en un paquete compartido (`packages/auth-jwt`).** El gateway y
orders verifican con **el mismo código**. Si cada uno tuviera su copia, tarde o temprano una
diría "acepto HS256" y la otra no, o una comprobaría la audiencia y la otra no. Una sola
implementación significa una sola regla.

**Cada servicio solo lee su configuración de variables de entorno (`config.ts`).** La misma
imagen corre en tu PC y en Railway; lo único que cambia son los valores. Si falta una
variable obligatoria, el servicio no arranca. Es preferible a un servicio "vivo" que falla en
la primera petición real.

### Base de datos

**Un Postgres con un esquema por servicio (`auth.*`, `orders.*`).** Cada servicio solo toca
su esquema y no hay claves foráneas entre ellos. orders guarda el dueño de la orden como el
`sub` del token, sin consultar la tabla de usuarios. Esto mantiene la regla de oro de los
servicios separados: **ningún servicio lee las tablas de otro**. Si mañana orders necesita su
propia base, se mueve sin romper nada.

> En la explicación anterior te propuse una base distinta por servicio, cada una con su
> usuario de Postgres. Es más estricto, pero exige crear las bases y los roles a mano antes
> del primer deploy. Para esta prueba elegí esquemas: misma separación lógica, cero pasos
> manuales. El salto a bases separadas sería el siguiente paso de endurecimiento.

**Las migraciones con dbmate, cada servicio con su propia tabla de control.** Ver el
`--migrations-table auth_schema_migrations` en `services/auth/package.json`. Si los dos
servicios compartieran la tabla `schema_migrations`, cada uno vería las migraciones del otro
como "aplicadas por alguien más". Con una tabla por servicio, cada uno lleva su propia cuenta.

**`--wait` y `--no-dump-schema` en dbmate.**
- `--wait` reintenta hasta que la base responda. Útil porque la red privada puede tardar unos
  segundos en estar lista.
- `--no-dump-schema` evita que dbmate intente ejecutar `pg_dump`, que no está instalado en
  nuestra imagen.

### auth

**RS256 (asimétrico) y no HS256 (secreto compartido).** Con RS256 solo auth tiene la clave
que **firma**. Gateway y orders tienen la clave pública, que solo **verifica**. Si alguien
entrara en orders, podría leer la clave pública pero no fabricar tokens. Con HS256 el mismo
secreto firma y verifica, y habría que repartirlo a todos los servicios.

**La clave privada en formato JWK (JSON de una línea) y no PEM.** Un PEM tiene saltos de
línea, y eso da problemas en archivos `.env` y en paneles de variables. Un JWK es un JSON de
una sola línea: se pega tal cual. Además, la clave pública se obtiene quitándole campos
(`d`, `p`, `q`...), como hace `signing-keys.ts`.

**El `kid` (key id).** Cada token lleva en su encabezado qué clave lo firmó, y los
verificadores la buscan por ese `kid` en el JWKS. Así funciona la rotación de claves sin
cortar el servicio:
1. Se publica la clave nueva junto a la vieja.
2. Los tokens nuevos usan la nueva.
3. Cuando vencen los viejos, se retira la vieja.

**Token de 15 minutos.** Un JWT no se puede revocar antes de que venza: es el precio de no
consultar a auth en cada petición. Por eso es corto. El siguiente paso natural es un
*refresh token* (largo, guardado en base de datos y revocable). Aquí no está, para mantener
la prueba simple.

**scrypt para las contraseñas, con sal aleatoria.** Viene incluido en Node, así que no hay
dependencias nativas como bcrypt, que a veces fallan al compilar dentro de Docker. Es lento a
propósito: si roban la tabla, probar contraseñas sale carísimo.

**El "hash de relleno" en el login (`DUMMY_HASH`).** Si el email no existe, igual verificamos
contra un hash falso. Así "no existe" y "contraseña incorrecta" tardan lo mismo y devuelven el
mismo error. Si no, midiendo el tiempo de respuesta alguien podría averiguar qué emails están
registrados.

### Verificación del JWT (`packages/auth-jwt`)

**`algorithms: ['RS256']` fijo.** El token trae un campo `alg` que dice cómo fue firmado.
Nunca le hacemos caso: si dijera `"none"`, un verificador ingenuo aceptaría un token sin
firma. La prueba de humo y las pruebas manuales incluyen ese ataque y se rechaza.

**`issuer` y `audience` obligatorios.** Un token firmado por auth pero emitido para otro
sistema (otra audiencia) no sirve aquí.

**401 vs 503: no es lo mismo "token malo" que "no puedo comprobarlo".** Si auth está caído y
aún no tenemos su JWKS en caché, respondemos `503 auth_unavailable`, no `401`. Un 401 le dice
al frontend "vuelve a iniciar sesión": no es justo echar a todos los usuarios porque auth se
está reiniciando.

**El JWKS se descarga una vez y queda en memoria.** Lo comprobé en las pruebas: con el JWKS ya
descargado, **apagué auth y orders siguió respondiendo 200** con un token válido. Verificar no
hace ninguna llamada de red; solo hace falta auth para emitir tokens nuevos.

### orders

**Vuelve a verificar el JWT aunque el gateway ya lo hizo.** orders no debe pensar "si llegó
hasta aquí, será bueno". Si mañana otro servicio interno le llama directo, o alguien le pone
un dominio público por error, orders sigue protegido. Cuesta microsegundos.

**En orders es un *Guard* de Nest; en el gateway, un *middleware*.**
- En orders hay controladores normales, y un guard es la forma idiomática de Nest de decidir
  "esta petición puede ejecutar este handler".
- En el gateway, las peticiones van al proxy y **nunca llegan a un controlador**, así que un
  guard nunca se ejecutaría. Un middleware corre para todas.

**La identidad sale del token, nunca de una cabecera.** `@CurrentUser()` lee los claims ya
verificados. Si orders leyera una cabecera `x-user-id`, cualquiera podría escribirla a mano.

**`404` tanto si la orden no existe como si es de otro usuario.** Así no confirmamos que una
orden ajena existe.

### gateway

**`bodyParser: false`.** Nest, por defecto, lee el cuerpo de cada petición para convertirlo
en JSON. Pero ese cuerpo es un flujo de datos que solo se puede leer una vez: si Nest lo lee,
el proxy reenvía un cuerpo vacío. El gateway no necesita entender el cuerpo, solo dejarlo
pasar.

**La cadena de middlewares, y por qué en ese orden** (`main.ts`):
1. **`requestId`**: el primero, para que hasta las peticiones rechazadas queden en el log con
   su id.
2. **`helmet`**: cabeceras de seguridad estándar.
3. **CORS**: va antes de la autenticación porque el navegador manda una petición `OPTIONS` de
   "permiso" **sin token**. Si la autenticación fuera primero, la rechazaría y el navegador
   nunca mandaría la petición real.
4. **Límite de peticiones**: antes de verificar tokens, para que un atacante no nos haga gastar
   CPU en verificaciones.
5. **Autenticación**.
6. **Proxy**.

**Prefijo que se quita (auth) vs. prefijo que se conserva (orders)** (`routes.ts`). auth no
sabe que vive bajo `/auth`, porque es un detalle de la URL pública. orders sí define sus
rutas como `/orders`. Las dos son válidas; lo importante es que lo decide la tabla de rutas y
que ves los dos casos.

**Se borran las cabeceras `x-user-*` y `x-internal-*` que manden los clientes.** Hoy nadie las
lee. Borrarlas en la puerta evita que mañana alguien añada una y abra un agujero sin darse
cuenta. Lo comprobé: un `x-user-id: otra-persona` enviado desde fuera no llega al servicio.

**`express-rate-limit` y no `@nestjs/throttler`.** En la explicación anterior mencioné
`@nestjs/throttler`, pero al construirlo apareció el mismo problema que con los guards: el
throttler de Nest funciona sobre controladores, y aquí todo es middleware.
`express-rate-limit` es un middleware, así que encaja.
- **El login tiene su propio límite, más estricto (10 por minuto)**, para frenar la fuerza
  bruta.
- **Ojo:** el contador vive en la memoria del proceso. Con 2 réplicas del gateway, cada una
  cuenta por su lado. Para eso, más adelante, el contador iría a Redis.

**`trust proxy`.** En Railway, delante del gateway hay un proxy (su borde), y la IP que ve
Express es la de ese proxy. Sin `trust proxy = 1`, el límite de peticiones contaría a todo el
mundo como un único cliente. Con `1`, Express toma la IP real de la cabecera
`X-Forwarded-For` que pone Railway. En local no hay proxy, por eso el compose usa
`TRUST_PROXY=0`.

**502 vs 401 vs 503, cada uno con su significado:**

| Código | Quién falla | Ejemplo |
|---|---|---|
| `401` | El cliente | Token ausente, falso o vencido |
| `502` | El servicio de atrás | orders está caído |
| `503` | auth, que no nos deja verificar | No pudimos descargar el JWKS |

**El healthcheck del gateway no consulta a los demás.** Si orders se cae, el gateway sigue
sano: puede seguir sirviendo login y responde `502` en `/orders`. Si su healthcheck dependiera
de orders, Railway reiniciaría el gateway por un fallo que no es suyo. En cambio, los
healthchecks de auth y orders **sí** consultan su base, porque sin ella no sirven.

### Empaquetado y arranque

**Escuchar sin indicar host (`app.listen(port)`).** Railway necesita que el servicio escuche
en IPv6, porque su red privada lo usa (y en entornos antiguos, solo IPv6). Escribir
`'0.0.0.0'` es el error típico: funciona en tu PC y en Railway nadie te encuentra.
- Mi primera versión escribía `'::'` explícito, y en un entorno sin IPv6 eso hacía fallar el
  arranque.
- Sin host, Node hace lo correcto solo: usa `::` si hay IPv6 y `0.0.0.0` si no lo hay.

**Dockerfile en dos etapas.** La primera instala todo y compila TypeScript. La segunda empieza
de cero e instala solo las dependencias de producción. El resultado es una imagen más pequeña
y sin compilador ni código fuente.

**El Dockerfile se construye desde la raíz del repo.** Necesita el `package-lock.json` de la
raíz y, en orders y gateway, el paquete compartido. Por eso en Railway no se define *Root
Directory* y en su lugar se indica qué Dockerfile usar (`dockerfilePath` en `.railway/railway.ts`).

**Primero se copian los `package.json`, después el código.** Docker guarda cada paso en caché.
Así, cambiar una línea de código no vuelve a ejecutar `npm ci`, que es el paso lento.

**`CMD ["node", "dist/main.js"]` y no `npm start`.** Al apagar un contenedor, Railway manda la
señal SIGTERM. npm no la reenvía bien, y el servicio se cortaría sin su cierre ordenado
(`enableShutdownHooks` y el `pool.end()` de la base).

**`USER node`.** El contenedor no corre como root. Si alguien explotara un fallo del servicio,
tendría menos poder.

---

## 4. Demostración local

En PowerShell, desde la carpeta del proyecto:

```powershell
node scripts/generate-jwk.mjs
docker compose up --build
```

Verás arrancar, en orden, estos contenedores:
1. `postgres`.
2. `auth-migrate` y `orders-migrate`, que aplican migraciones y **terminan**. Esto imita el
   pre-deploy de Railway.
3. `auth`, `orders` y `gateway`.

En otra terminal:

```powershell
node scripts/smoke-test.mjs
```

Deberían salir 13 líneas `OK` y al final `Todo en orden.`. Para mirar por dentro:

```powershell
# Probar que auth NO es accesible desde tu PC (igual que en Railway): debe fallar.
curl.exe http://localhost:3001/health

# Los logs del gateway: cada petición con su id, y los rechazos con su motivo.
docker compose logs gateway

# Busca un x-request-id de esos logs en los de orders: es la misma petición vista desde atrás.
docker compose logs orders

# Apaga orders y llama /orders con un token: el gateway responde 502, no se cae.
docker compose stop orders
```

---

## 5. Preguntas de repaso

Intenta responderlas sin mirar; después búscalas en el código.

1. Si alguien roba la imagen Docker de **orders** con todas sus variables, ¿puede fabricar
   tokens válidos? ¿Por qué? ¿Y si roba la de **auth**?
2. El gateway ya verificó el token. Da un escenario concreto en el que, si orders no
   verificara por su cuenta, alguien podría crear órdenes a nombre de otro.
3. ¿Qué pasaría si movieras `app.enableCors(...)` **después** de `authenticate` en el `main.ts`
   del gateway? ¿Quién lo notaría primero?
4. auth se reinicia durante 20 segundos. ¿Qué ven los usuarios que ya tenían sesión? ¿Y los
   que intentan iniciar sesión justo entonces?
5. Si mañana añades un servicio `tracking`, ¿qué archivos del gateway tocas y qué variables
   añades en Railway?
6. ¿Por qué el healthcheck de orders consulta la base y el del gateway no consulta a orders?

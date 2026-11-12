# Imagen del servicio auth.
# Se construye DESDE LA RAÍZ del repo (contexto = .), porque necesita el package-lock.json
# de la raíz y, en otros servicios, el paquete compartido packages/auth-jwt.
#   docker build -f services/auth/Dockerfile .
# En Railway: lo indica dockerfilePath en .railway/railway.ts

# ─── Etapa 1: compilar TypeScript ────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app

# Primero SOLO los package.json y el lock. Docker guarda cada paso en caché: mientras no
# cambien las dependencias, el `npm ci` (el paso lento) no se repite al cambiar código.
# Copiamos los package.json de TODOS los workspaces porque npm ci compara el lock completo.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/auth-jwt/package.json packages/auth-jwt/
COPY services/auth/package.json services/auth/
COPY services/orders/package.json services/orders/
COPY services/gateway/package.json services/gateway/
# --workspace: instala solo lo que necesita ESTE servicio, no las dependencias de los demás.
RUN npm ci --workspace @tms/auth

COPY services/auth services/auth
RUN npm run build --workspace @tms/auth

# ─── Etapa 2: imagen final, solo lo necesario para ejecutar ─────────────────────
# Empezamos de cero: sin TypeScript, sin código fuente, sin dependencias de desarrollo.
# Imagen más pequeña = deploys más rápidos y menos cosas que puedan tener vulnerabilidades.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/auth-jwt/package.json packages/auth-jwt/
COPY services/auth/package.json services/auth/
COPY services/orders/package.json services/orders/
COPY services/gateway/package.json services/gateway/
RUN npm ci --omit=dev --workspace @tms/auth && npm cache clean --force

COPY --from=build /app/services/auth/dist services/auth/dist
# Las migraciones van DENTRO de la imagen: el pre-deploy de Railway (npm run migrate)
# se ejecuta en este mismo contenedor.
COPY services/auth/db services/auth/db

WORKDIR /app/services/auth
# No correr como root: si alguien explotara un fallo del servicio, tendría menos poder.
USER node
EXPOSE 3001
# `node` directo y no `npm start`: npm no reenvía bien la señal SIGTERM con la que Railway
# apaga el contenedor, y el servicio no tendría su cierre ordenado.
CMD ["node", "dist/main.js"]

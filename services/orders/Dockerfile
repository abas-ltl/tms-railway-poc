# Imagen del servicio orders. Mismo esquema que services/auth/Dockerfile (lee ese primero);
# la diferencia es que orders depende del paquete compartido packages/auth-jwt.
#   docker build -f services/orders/Dockerfile .
# En Railway: lo indica dockerfilePath en .railway/railway.ts

# ─── Etapa 1: compilar ───────────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/auth-jwt/package.json packages/auth-jwt/
COPY services/auth/package.json services/auth/
COPY services/orders/package.json services/orders/
COPY services/gateway/package.json services/gateway/
RUN npm ci --workspace @tms/orders

# El paquete compartido se compila primero: orders importa su dist/.
COPY packages/auth-jwt packages/auth-jwt
COPY services/orders services/orders
RUN npm run build --workspace @tms/auth-jwt && npm run build --workspace @tms/orders

# ─── Etapa 2: imagen final ───────────────────────────────────────────────────────
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/auth-jwt/package.json packages/auth-jwt/
COPY services/auth/package.json services/auth/
COPY services/orders/package.json services/orders/
COPY services/gateway/package.json services/gateway/
RUN npm ci --omit=dev --workspace @tms/orders && npm cache clean --force

# node_modules/@tms/auth-jwt es un enlace a packages/auth-jwt: ahí tiene que estar su dist/.
COPY --from=build /app/packages/auth-jwt/dist packages/auth-jwt/dist
COPY --from=build /app/services/orders/dist services/orders/dist
COPY services/orders/db services/orders/db

WORKDIR /app/services/orders
USER node
EXPOSE 3002
CMD ["node", "dist/main.js"]
